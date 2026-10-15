-- ============================================================================
-- 056 — Catálogo de planes en la base, editable desde /superadmin
--
-- Hasta acá los planes vivían en `lib/plans.ts` (precio, límites, features) y
-- `tenants.plan` era el enum cerrado `tenant_plan`: cambiar un precio pedía un
-- deploy y sumar un plan, una migración. Ahora:
--
-- 1. `planes` es la fuente de verdad: precio, límites, secciones incluidas
--    (`features`, las claves de `Feature` en lib/plans.ts), bullets para
--    /pricing, orden y si se ofrece (`visible`). Lectura pública (la página de
--    precios la muestra sin sesión); escritura solo superadmin.
-- 2. `tenants.plan` pasa a text con FK a `planes`: un plan en uso no se puede
--    borrar. Básico y Pro tampoco (el registro, la prueba y el plan por
--    defecto los nombran en el código).
-- 3. `plan_limites` (044/054) pasa a ser una vista sobre `planes`: `crear_turno`
--    y el trigger de `invitaciones` la siguen leyendo igual, pero ya no hay un
--    espejo que mantener a mano.
-- 4. `crear_veterinaria` deja de castear a `tenant_plan`.
--
-- El precio que se cambia acá vale para las contrataciones nuevas: una
-- suscripción de Mercado Pago ya autorizada sigue con el monto que aceptó.
--
-- Requiere 044, 049, 053 y 054. Idempotente.
-- ============================================================================

-- 1. Tabla ---------------------------------------------------------------------

create table if not exists public.planes (
  id              text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,29}$'),
  nombre          text not null check (btrim(nombre) <> ''),
  descripcion     text not null default '',
  precio_mensual  numeric(12,2) not null check (precio_mensual > 0),
  max_turnos_mes  integer check (max_turnos_mes is null or max_turnos_mes > 0), -- null = ilimitado
  max_usuarios    integer check (max_usuarios is null or max_usuarios > 0),     -- null = ilimitado
  features        text[] not null default '{}',
  highlights      text[] not null default '{}',
  orden           integer not null default 0,
  visible         boolean not null default true, -- se muestra en precios y se puede contratar
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

insert into public.planes (id, nombre, descripcion, precio_mensual, max_turnos_mes, max_usuarios, features, highlights, orden)
values
  ('basico', 'Básico', 'La clínica completa', 50000, null, 2,
   array['multiUsuario', 'pdfLibreta', 'qrMascota'],
   array[
     'Turnos ilimitados',
     'Página pública y link para sacar turno',
     'Clientes, libreta sanitaria e historia clínica',
     'Libreta en PDF y QR por mascota',
     'Hasta 2 usuarios'
   ], 10),
  ('pro', 'Pro', 'Para clínicas en funcionamiento', 80000, null, null,
   array['analytics', 'multiUsuario', 'whatsapp', 'pdfLibreta', 'qrMascota', 'recordatoriosVacunas',
         'multipleProfesionales', 'productos', 'ventas', 'promosSorteos', 'facturacionElectronica',
         'mercadoPagoPoint'],
   array[
     'Turnos ilimitados',
     'Usuarios ilimitados',
     'Dashboard de métricas',
     'Notificaciones por WhatsApp y recordatorios de vacunas',
     'Libreta sanitaria en PDF y QR por mascota',
     'Productos, stock, mostrador, caja y remitos',
     'Cuenta corriente, gastos y promos',
     'Factura electrónica (ARCA)',
     'Cobro con Mercado Pago Point'
   ], 20)
on conflict (id) do nothing;

create or replace function public.touch_planes()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists planes_touch on public.planes;
create trigger planes_touch before update on public.planes
  for each row execute function public.touch_planes();

alter table public.planes enable row level security;

drop policy if exists planes_lectura on public.planes;
create policy planes_lectura on public.planes
  for select to anon, authenticated using (true);

drop policy if exists planes_alta on public.planes;
create policy planes_alta on public.planes
  for insert to authenticated with check (public.es_superadmin());

drop policy if exists planes_edicion on public.planes;
create policy planes_edicion on public.planes
  for update to authenticated using (public.es_superadmin()) with check (public.es_superadmin());

drop policy if exists planes_baja on public.planes;
create policy planes_baja on public.planes
  for delete to authenticated using (public.es_superadmin() and id not in ('basico', 'pro'));

-- El id es lo que guardan `tenants.plan` y el `external_reference` de cada
-- suscripción de Mercado Pago: renombrarlo dejaría referencias colgadas.
create or replace function public.planes_id_inmutable()
returns trigger language plpgsql as $$
begin
  if new.id <> old.id then
    raise exception 'PLAN_ID_INMUTABLE' using hint = 'El id de un plan no se puede cambiar.';
  end if;
  return new;
end $$;

drop trigger if exists planes_id_inmutable on public.planes;
create trigger planes_id_inmutable before update of id on public.planes
  for each row execute function public.planes_id_inmutable();

-- 2. tenants.plan → text con FK -------------------------------------------------

update public.tenants set plan = 'pro' where plan::text = 'plus';

alter table public.tenants alter column plan drop default;
alter table public.tenants alter column plan type text using plan::text;
alter table public.tenants alter column plan set default 'basico';

alter table public.tenants drop constraint if exists tenants_plan_fkey;
alter table public.tenants
  add constraint tenants_plan_fkey foreign key (plan) references public.planes(id);

-- 3. plan_limites → vista -------------------------------------------------------

-- `drop table` sobre una vista (o al revés) falla aunque lleve `if exists`:
-- se mira qué es antes de borrarlo, así la migración se puede volver a correr.
do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'plan_limites' and c.relkind = 'r') then
    drop table public.plan_limites;
  end if;
end $$;

create or replace view public.plan_limites as
  select id as plan, max_turnos_mes, max_usuarios from public.planes;

-- 4. Registro sin el enum -------------------------------------------------------

create or replace function public.crear_veterinaria(p_slug text, p_datos jsonb default '{}'::jsonb)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_nombre text;
  v_avatar text;
begin
  if v_uid is null then
    raise exception 'NO_AUTENTICADO';
  end if;

  if p_slug is null or btrim(p_slug) = '' then
    raise exception 'SLUG_INVALIDO';
  end if;

  if exists (select 1 from public.tenants where slug = p_slug) then
    raise exception 'SLUG_TAKEN';
  end if;

  insert into public.tenants (
    slug, nombre, plan, status,
    telefono, email, direccion, ciudad, admin_ids, trial_expires_at
  ) values (
    p_slug,
    nullif(p_datos->>'nombre', ''),
    coalesce(nullif(p_datos->>'plan', ''), 'basico'),
    'activo',
    p_datos->>'telefono',
    p_datos->>'email',
    p_datos->>'direccion',
    p_datos->>'ciudad',
    coalesce(p_datos->'admin_ids', to_jsonb(array[v_uid::text])),
    case when nullif(p_datos->>'trial_dias', '') is not null
         then now() + ((p_datos->>'trial_dias')::int || ' days')::interval
         else null end
  );

  insert into public.turno_config (tenant_id) values (p_slug)
  on conflict (tenant_id) do nothing;

  -- La fila de `usuarios` puede faltar (trigger que falló, cuenta vieja
  -- limpiada): se crea o se actualiza, nunca se asume que existe.
  select u.email,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
         u.raw_user_meta_data->>'avatar_url'
    into v_email, v_nombre, v_avatar
    from auth.users u where u.id = v_uid;

  insert into public.usuarios (id, email, display_name, photo_url, role, tenant_id)
  values (v_uid, v_email, v_nombre, v_avatar, 'veterinario', p_slug)
  on conflict (id) do update
     set role = 'veterinario',
         tenant_id = p_slug,
         email = coalesce(public.usuarios.email, excluded.email),
         last_login = now();

  return p_slug;
end $function$;
