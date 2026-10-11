-- ============================================================================
-- 053 — Registro robusto: el dueño siempre queda como veterinario del tenant
--
-- Bug real: una cuenta de auth.users sin fila en public.usuarios (quedó así
-- al borrar una veterinaria de prueba anterior) creó el tenant "pepito".
-- `crear_veterinaria` hacía `update usuarios set role = 'veterinario'`, que
-- sobre una fila inexistente actualiza 0 filas sin error. Resultado: tenant
-- creado y nadie con permiso sobre él; el panel rebotaba al inicio.
--
-- 1. `crear_veterinaria` ahora hace UPSERT de la fila del usuario, tomando
--    email y nombre de auth.users, así el dueño existe sí o sí.
-- 2. Backfill: filas faltantes en `usuarios` para todo auth.users, y los
--    `admin_ids` de cada tenant quedan como veterinario de ese tenant si no
--    tienen otro.
--
-- Idempotente. Requiere `011_trial_demo.sql`.
-- ============================================================================

create or replace function public.crear_veterinaria(
  p_slug   text,
  p_datos  jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
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
    coalesce((p_datos->>'plan')::tenant_plan, 'basico'),
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
end $$;

grant execute on function public.crear_veterinaria(text, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- Backfill
-- ----------------------------------------------------------------------------
insert into public.usuarios (id, email, display_name, photo_url, role)
select u.id,
       u.email,
       coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
       u.raw_user_meta_data->>'avatar_url',
       'usuario'
  from auth.users u
  left join public.usuarios pu on pu.id = u.id
 where pu.id is null;

-- Dueños declarados en admin_ids que quedaron sin tenant: se los vincula.
update public.usuarios pu
   set role = 'veterinario', tenant_id = t.slug
  from public.tenants t, jsonb_array_elements_text(t.admin_ids) a(uid)
 where pu.id::text = a.uid
   and pu.tenant_id is null
   and pu.role in ('usuario', 'veterinario');
