-- Borra TODOS los productos de VipVet. Uso puntual, no es parte del esquema
-- versionado (no lo corras dos veces sin revisar antes qué tenant es).
--
-- Es seguro en cuanto a integridad: `stock_movimientos` y los cambios de precio
-- cuelgan de productos con `on delete cascade` (se borran solos), y
-- `venta_items.producto_id` es `on delete set null` — las ventas ya hechas no
-- se tocan, solo pierden el link al producto (el nombre y el precio quedan
-- congelados en el propio item, así que el remito no cambia).
--
-- Reemplazá 'vipvet' si el slug real es otro.

-- 1) Mirá primero cuántos se van a borrar.
select count(*) as productos_a_borrar
from public.productos
where tenant_id = 'vipvet';

-- 2) Si el número de arriba es el esperado, descomentá y corré esto:
-- delete from public.productos
-- where tenant_id = 'vipvet';
