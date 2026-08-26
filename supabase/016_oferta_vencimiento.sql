-- ============================================================================
-- 016. Vencimiento de oferta.
--
-- `oferta_hasta` es opcional: null significa "hasta que la saque a mano" (el
-- comportamiento de siempre). Con fecha cargada, la oferta deja de aplicarse
-- sola pasado ese día — lo resuelve `tieneOferta()` en el cliente comparando
-- contra la fecha actual, no un job en la base.
-- ============================================================================

alter table public.productos
  add column if not exists oferta_hasta date;
