-- ============================================================================
-- 023. Lectura pública de productos.
--
-- `productos_staff` (004_productos.sql) es `for all using (es_staff(tenant_id))`,
-- así que bloquea CUALQUIER lectura anónima — incluida la de
-- `getProductosPublicados` / `getProductosPublicadosPorIds`, que la landing
-- pública (sin sesión) usa para mostrar la vidriera y las promos. Sin esta
-- policy, esas funciones siempre devuelven `[]` con la clave anon, aunque el
-- producto exista y esté publicado.
--
-- Las funciones públicas ya limitan las columnas que piden (nunca costo, ni
-- stock, ni margen), así que exponer la fila entera a nivel de RLS es
-- aceptable: lo sensible ya no viaja por esas consultas.
-- ============================================================================

drop policy if exists productos_publico on public.productos;
create policy productos_publico on public.productos for select
  using (activo = true);
