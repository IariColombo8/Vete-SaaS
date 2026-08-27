-- ============================================================================
-- 022 — Co-dueños de mascota (múltiples DNIs con acceso a la misma ficha)
--
-- Caso: dos clientes (pareja, familia) comparten una mascota y ambos quieren
-- ver su ficha en /mi-historia con su propio DNI. Hasta ahora `mascotas` solo
-- tenía un `cliente_id` (dueño principal). Se agrega una tabla puente
-- `mascota_duenos` para dueños adicionales, sin tocar el dueño principal
-- existente (mínimo cambio, compatible con todo lo que ya lee `cliente_id`).
--
-- El alta de co-dueño es autoservicio desde /mi-historia: el dueño ya
-- verificado por DNI agrega otro DNI, creando el cliente si no existe (mismo
-- criterio laxo que `guardar_cliente_publico`).
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
-- ============================================================================

create table if not exists public.mascota_duenos (
  mascota_id  uuid not null references public.mascotas(id) on delete cascade,
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  tenant_id   text not null,
  created_at  timestamptz not null default now(),
  primary key (mascota_id, cliente_id)
);

alter table public.mascota_duenos enable row level security;

drop policy if exists mascota_duenos_staff on public.mascota_duenos;
create policy mascota_duenos_staff on public.mascota_duenos
  for all using (es_staff(tenant_id)) with check (es_staff(tenant_id));

-- ----------------------------------------------------------------------------
-- es_dueno_mascota_publico: true si el cliente es el dueño principal o un
-- co-dueño de la mascota. Usada para (re)validar el DNI en /mi-historia.
-- ----------------------------------------------------------------------------
create or replace function public.es_dueno_mascota_publico(
  p_tenant     text,
  p_mascota_id uuid,
  p_cliente_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.mascotas m
    where m.id = p_mascota_id and m.tenant_id = p_tenant and m.cliente_id = p_cliente_id
  ) or exists (
    select 1 from public.mascota_duenos d
    where d.mascota_id = p_mascota_id and d.tenant_id = p_tenant and d.cliente_id = p_cliente_id
  )
$$;

grant execute on function public.es_dueno_mascota_publico(text, uuid, uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- obtener_duenos_mascota_publico: lista de dueños (principal + co-dueños)
-- para mostrar en la ficha pública.
-- ----------------------------------------------------------------------------
create or replace function public.obtener_duenos_mascota_publico(
  p_tenant     text,
  p_mascota_id uuid
)
returns table(cliente_id uuid, nombre text, dni text, es_principal boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.nombre, c.dni, true
  from public.mascotas m
  join public.clientes c on c.id = m.cliente_id
  where m.id = p_mascota_id and m.tenant_id = p_tenant
  union all
  select c.id, c.nombre, c.dni, false
  from public.mascota_duenos d
  join public.clientes c on c.id = d.cliente_id
  where d.mascota_id = p_mascota_id and d.tenant_id = p_tenant
$$;

grant execute on function public.obtener_duenos_mascota_publico(text, uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- agregar_dueno_mascota_publico: el DNI ya verificado (`p_dni_actual`) agrega
-- otro DNI como co-dueño. Si el DNI nuevo no existe como cliente del tenant,
-- se crea con datos mínimos (mismo criterio que `guardar_cliente_publico`).
-- Valida ownership a mano (no hay sesión): sin ella, cualquiera con el uuid
-- de la mascota podría regalarse a sí mismo como co-dueño.
-- ----------------------------------------------------------------------------
create or replace function public.agregar_dueno_mascota_publico(
  p_tenant       text,
  p_mascota_id   uuid,
  p_dni_actual   text,
  p_dni_nuevo    text,
  p_nombre_nuevo text default ''
)
returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mascota        public.mascotas;
  v_cliente_actual public.clientes;
  v_cliente_nuevo  public.clientes;
begin
  select * into v_mascota from public.mascotas
    where id = p_mascota_id and tenant_id = p_tenant;
  if v_mascota.id is null then
    raise exception 'MASCOTA_NOT_FOUND';
  end if;

  select * into v_cliente_actual from public.clientes
    where tenant_id = p_tenant and dni = nullif(trim(p_dni_actual), '');
  if v_cliente_actual.id is null then
    raise exception 'DNI_ACTUAL_INVALIDO';
  end if;

  if v_mascota.cliente_id is distinct from v_cliente_actual.id
     and not exists (
       select 1 from public.mascota_duenos
       where mascota_id = p_mascota_id and cliente_id = v_cliente_actual.id
     )
  then
    raise exception 'NO_AUTORIZADO';
  end if;

  select * into v_cliente_nuevo from public.clientes
    where tenant_id = p_tenant and dni = nullif(trim(p_dni_nuevo), '');

  if v_cliente_nuevo.id is null then
    insert into public.clientes (tenant_id, nombre, dni, telefono, email, domicilio, historial_datos)
    values (
      p_tenant,
      coalesce(nullif(trim(p_nombre_nuevo), ''), 'Sin nombre'),
      nullif(trim(p_dni_nuevo), ''),
      '', '', null, '[]'::jsonb
    )
    returning * into v_cliente_nuevo;
  end if;

  if v_cliente_nuevo.id = v_mascota.cliente_id then
    raise exception 'YA_ES_DUENO';
  end if;

  insert into public.mascota_duenos (mascota_id, cliente_id, tenant_id)
  values (p_mascota_id, v_cliente_nuevo.id, p_tenant)
  on conflict (mascota_id, cliente_id) do nothing;

  return v_cliente_nuevo;
end $$;

grant execute on function public.agregar_dueno_mascota_publico(text, uuid, text, text, text) to anon, authenticated;
