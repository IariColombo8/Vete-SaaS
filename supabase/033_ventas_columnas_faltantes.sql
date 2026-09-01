-- ============================================================================
-- 033. Columnas de `ventas` que faltaron aplicar de 005_ventas.sql.
--
-- `registrar_venta` inserta `cliente_dni` y `cliente_domicilio` (snapshot del
-- cliente al momento de la venta, igual que `cliente_nombre`/`cliente_telefono`),
-- pero esas dos columnas nunca llegaron a crearse en esta base — mismo patrón
-- de "el batch se cortó a mitad" que ya pasó con otras migraciones. Por eso
-- cobrar tiraba 400: la RPC intentaba escribir en una columna inexistente,
-- con o sin cliente elegido (el insert falla en cualquier caso).
-- ============================================================================

alter table public.ventas
  add column if not exists cliente_dni       text not null default '',
  add column if not exists cliente_domicilio text not null default '';
