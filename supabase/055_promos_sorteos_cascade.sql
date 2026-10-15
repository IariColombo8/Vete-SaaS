-- 055: promociones y sorteos se borran junto con su tenant.
--
-- 020 las creó con `references tenants(slug)` sin `on delete cascade`, a
-- diferencia del resto de las tablas de negocio. Con un solo sorteo o promo,
-- el borrado de la veterinaria desde /superadmin fallaba por FK (23503).

alter table public.promociones
  drop constraint promociones_tenant_id_fkey,
  add constraint promociones_tenant_id_fkey
    foreign key (tenant_id) references public.tenants(slug) on delete cascade;

alter table public.sorteos
  drop constraint sorteos_tenant_id_fkey,
  add constraint sorteos_tenant_id_fkey
    foreign key (tenant_id) references public.tenants(slug) on delete cascade;

-- Con la cascada, el orden en que Postgres borra las hijas no está garantizado:
-- puede borrar los clientes/ventas/productos del tenant antes que el sorteo, y
-- `sorteo_ganadores`/`sorteo_premios` todavía los apuntan. Estas FKs se chequean
-- al final de la transacción: para entonces la cascada del sorteo ya se llevó
-- ganadores y premios. Borrar un cliente o un producto suelto que ganó un
-- sorteo sigue fallando como antes.

alter table public.sorteo_ganadores
  alter constraint sorteo_ganadores_cliente_id_fkey deferrable initially deferred,
  alter constraint sorteo_ganadores_venta_id_fkey   deferrable initially deferred,
  alter constraint sorteo_ganadores_premio_id_fkey  deferrable initially deferred;

alter table public.sorteo_premios
  alter constraint sorteo_premios_producto_id_fkey deferrable initially deferred;
