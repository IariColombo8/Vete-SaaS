-- ============================================================================
-- Backfill: sacar el control de stock a TODO el catálogo existente con stock
-- en cero, no solo a los alimentos.
--
-- 012_import_sin_control_stock.sql ya hizo que los productos nuevos entren
-- sin control de stock, y hizo el backfill solo para categoría "Alimentos".
-- El usuario pidió lo mismo para medicamentos y accesorios: no conoce el
-- stock real de nada todavía, y quiere poder vender igual mientras lo carga.
--
-- Mismo criterio que 012: solo toca productos que están en 0 y todavía con
-- el control por defecto encendido — no le apaga el control a algo que ya
-- tenía stock cargado a propósito.
-- ============================================================================

update public.productos
set controla_stock = false
where stock = 0
  and controla_stock = true;
