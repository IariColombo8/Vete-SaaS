-- ============================================================================
-- 032. Historial de compras del cliente en "Historia clínica de mi mascota".
--
-- `ventas`/`venta_items` son estrictamente staff-only (ver 005_ventas.sql).
-- Para mostrarle al propio cliente sus compras pasadas en la página pública
-- /[slug]/mi-historia (que ya verifica la identidad por DNI antes de llegar
-- acá, ver getClienteByDNI), se agrega una RPC `security definer` que solo
-- devuelve las ventas de ESE cliente puntual — nunca lista ventas ajenas.
-- ============================================================================

create or replace function public.obtener_compras_cliente_publico(
  p_tenant     text,
  p_cliente_id uuid
)
returns table(
  id          uuid,
  numero      integer,
  created_at  timestamptz,
  total       numeric,
  estado      venta_estado,
  items       jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id, v.numero, v.created_at, v.total, v.estado,
    coalesce(
      (select jsonb_agg(jsonb_build_object('nombre', vi.nombre, 'cantidad', vi.cantidad, 'unidad', vi.unidad))
       from public.venta_items vi where vi.venta_id = v.id),
      '[]'::jsonb
    ) as items
  from public.ventas v
  where v.tenant_id = p_tenant and v.cliente_id = p_cliente_id
  order by v.created_at desc
$$;

grant execute on function public.obtener_compras_cliente_publico(text, uuid) to anon, authenticated;
