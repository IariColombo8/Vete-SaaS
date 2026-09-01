-- ============================================================================
-- 029. `sorteo_ganadores.venta_id` tiene que admitir null.
--
-- Un ganador elegido por la mecánica de "cliente registrado" o "foto de
-- mascota" no tiene ninguna venta asociada. El intento de re-crear esta
-- misma corrección ya estaba en 025, pero el batch de esa migración se cortó
-- antes de llegar a esta línea (mismo síntoma que 026 con la RPC) — de ahí el
-- 400 al insertar en `sorteo_ganadores` con `venta_id: null`.
-- ============================================================================

alter table public.sorteo_ganadores
  alter column venta_id drop not null;
