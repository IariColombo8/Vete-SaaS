-- ============================================================================
-- 023 — obtener_mascotas_publico también trae mascotas donde el cliente es
-- co-dueño (tabla mascota_duenos de 022), no solo dueño principal.
--
-- Bug: Emanuel se agregó como co-dueño de "Nix" (dueña principal Iara), pero
-- al buscar su propio DNI en /mi-historia veía "todavía no cargaste
-- mascotas" — `obtener_mascotas_publico` solo miraba `mascotas.cliente_id`.
-- Esta función la usan tanto /mi-historia como el formulario de turno
-- (useClienteByDNI/useClienteByEmail) y el panel admin: en los tres casos
-- tiene sentido que un co-dueño vea la mascota compartida.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente. Requiere 022.
-- ============================================================================

create or replace function public.obtener_mascotas_publico(
  p_tenant     text,
  p_cliente_id uuid
)
returns setof public.mascotas
language sql
stable
security definer
set search_path = public
as $$
  select m.* from public.mascotas m
  where m.tenant_id = p_tenant and m.cliente_id = p_cliente_id
  union
  select m.* from public.mascotas m
  join public.mascota_duenos d on d.mascota_id = m.id
  where m.tenant_id = p_tenant and d.tenant_id = p_tenant and d.cliente_id = p_cliente_id
  order by nombre
$$;

grant execute on function public.obtener_mascotas_publico(text, uuid) to anon, authenticated;
