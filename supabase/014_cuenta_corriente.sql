-- ============================================================================
-- 014_cuenta_corriente.sql — Medios de pago ampliados y cuenta corriente
--
-- Continúa 005_ventas.sql. Agrega:
--   · Dos medios de pago nuevos: 'mixto' y 'cuenta_corriente'.
--   · Recargo y cuotas en `ventas`, para débito/crédito.
--   · `venta_pagos`: desglose de "mixto" (tiene que sumar el total).
--   · `cuenta_corriente_movimientos`: el saldo deudor de cada cliente. No se
--     desnormaliza en `clientes` — se calcula sumando movimientos, que con el
--     volumen de una veterinaria es una consulta liviana.
--
-- Requiere haber corrido antes 005_ventas.sql.
-- ============================================================================

-- No se puede agregar un valor a un enum y usarlo en la misma transacción,
-- así que esto corre solo (sin bloque `do $$`) y antes que todo lo demás.
alter type medio_pago add value if not exists 'mixto';
alter type medio_pago add value if not exists 'cuenta_corriente';
