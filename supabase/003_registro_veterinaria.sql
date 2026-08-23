-- ============================================================================
-- 003 — Alta de veterinaria + cierre de escalada de privilegios
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
--
-- Arregla dos cosas:
--
--  1. Huevo-y-gallina al crear un tenant. La policy de INSERT exigía
--     `es_staff(slug)`, pero nadie puede ser staff de un slug que todavía no
--     existe. El alta pasa ahora por una función SECURITY DEFINER que crea el
--     tenant y promueve al usuario en la MISMA transacción — así nadie queda
--     con una veterinaria que no puede administrar.
--
--  2. Escalada de privilegios. `usuarios_self_update` permitía editar la
--     propia fila entera, incluido `role`: cualquier usuario autenticado podía
--     hacerse `superadmin` desde la consola del navegador. Ahora role y
--     tenant_id quedan congelados para el propio usuario; solo los cambia el
--     superadmin o esta función.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Alta de veterinaria (tenant + config + promoción del dueño)
--
-- Errores: NO_AUTENTICADO | SLUG_TAKEN
-- ----------------------------------------------------------------------------
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
    telefono, email, direccion, ciudad, admin_ids
  ) values (
    p_slug,
    nullif(p_datos->>'nombre', ''),
    coalesce((p_datos->>'plan')::tenant_plan, 'basico'),
    'activo',
    p_datos->>'telefono',
    p_datos->>'email',
    p_datos->>'direccion',
    p_datos->>'ciudad',
    coalesce(p_datos->'admin_ids', to_jsonb(array[v_uid::text]))
  );

  insert into public.turno_config (tenant_id) values (p_slug)
  on conflict (tenant_id) do nothing;

  -- Promoción del dueño. Va acá dentro a propósito: si fallara, el rollback
  -- se lleva también el tenant y no queda una veterinaria huérfana.
  update public.usuarios
     set role = 'veterinario', tenant_id = p_slug
   where id = v_uid;

  return p_slug;
end $$;

grant execute on function public.crear_veterinaria(text, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Cerrar la escalada de privilegios en `usuarios`
--
-- El usuario puede editar sus datos de perfil, pero NO su rol ni su tenant.
-- `mi_role()` / `mi_tenant()` leen el snapshot previo al UPDATE, así que
-- comparan contra el valor viejo.
-- ----------------------------------------------------------------------------
drop policy if exists usuarios_self_update on public.usuarios;
create policy usuarios_self_update on public.usuarios for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = mi_role()
    and tenant_id is not distinct from mi_tenant()
  );

-- El superadmin sigue pudiendo cambiar roles: `usuarios_admin_all` es una
-- policy permisiva aparte, y las permisivas se combinan con OR.
