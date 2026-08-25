-- Deja en cero Turnos, Libreta, Clientes, Comercio (Productos/Vender/Ventas/Caja)
-- para el tenant "vipvet". NO toca usuarios, tenants ni configuracion (turno_config).

-- Orden: hijos antes que padres para no chocar con las foreign keys.

-- Comercio: ventas / caja / productos
delete from public.venta_items
where venta_id in (select id from public.ventas where tenant_id = 'vipvet');

delete from public.ventas
where tenant_id = 'vipvet';

delete from public.cajas
where tenant_id = 'vipvet';

delete from public.stock_movimientos
where tenant_id = 'vipvet';

delete from public.producto_auditoria
where tenant_id = 'vipvet';

delete from public.productos
where tenant_id = 'vipvet';

-- Turnos
delete from public.turnos
where tenant_id = 'vipvet';

delete from public.dias_bloqueados
where tenant_id = 'vipvet';

delete from public.recordatorios_vacunas
where tenant_id = 'vipvet';

-- Libreta sanitaria
delete from public.libretas_publicas
where tenant_id = 'vipvet';

delete from public.historia_clinica
where tenant_id = 'vipvet';

delete from public.historias
where tenant_id = 'vipvet';

-- Clientes y sus mascotas
delete from public.mascotas
where tenant_id = 'vipvet';

delete from public.clientes
where tenant_id = 'vipvet';

-- Verificación (todas deberían dar 0)
select 'turnos' t, count(*) from public.turnos where tenant_id = 'vipvet'
union all select 'clientes', count(*) from public.clientes where tenant_id = 'vipvet'
union all select 'mascotas', count(*) from public.mascotas where tenant_id = 'vipvet'
union all select 'historias', count(*) from public.historias where tenant_id = 'vipvet'
union all select 'productos', count(*) from public.productos where tenant_id = 'vipvet'
union all select 'ventas', count(*) from public.ventas where tenant_id = 'vipvet'
union all select 'cajas', count(*) from public.cajas where tenant_id = 'vipvet';
