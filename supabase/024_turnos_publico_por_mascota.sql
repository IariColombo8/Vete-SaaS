-- ============================================================================
-- 024 — Turnos por mascota (no por cliente) en /mi-historia
--
-- Bug: /mi-historia/[mascotaId] pedía los turnos con
-- `obtener_turnos_publico(tenant, cliente_id)` y filtraba en el cliente por
-- mascota_id. Eso solo trae los turnos reservados con el DNI que está
-- viendo la ficha ahora mismo: si Iara (dueña principal) sacó el turno de
-- Nix, Emanuel (co-dueño, agregado en 022) no lo veía porque el turno quedó
-- con `cliente_id` de Iara.
--
-- Los turnos ya tienen `mascota_id` propio (ver schema.sql), así que no hace
-- falta pasar por el cliente: se trae directo por mascota, validando tenant.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
-- ============================================================================

create or replace function public.obtener_turnos_mascota_publico(
  p_tenant     text,
  p_mascota_id uuid
)
returns setof public.turnos
language sql
stable
security definer
set search_path = public
as $$
  select t.* from public.turnos t
  where t.tenant_id = p_tenant and t.mascota_id = p_mascota_id
  order by t.fecha desc, t.hora desc
$$;

grant execute on function public.obtener_turnos_mascota_publico(text, uuid) to anon, authenticated;
