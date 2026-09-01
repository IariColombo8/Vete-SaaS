-- ============================================================================
-- 028. Borrar un cliente no debe bloquearse por sus participaciones de sorteo.
--
-- `sorteo_participaciones.cliente_id` no tenía `on delete cascade`: borrar un
-- cliente que había subido la foto de su mascota para un sorteo fallaba con
-- una violación de foreign key. Si el cliente se borra, su participación deja
-- de tener sentido — se borra con él, igual que hace `sorteo_id` (cascada
-- desde el sorteo).
-- ============================================================================

alter table public.sorteo_participaciones
  drop constraint if exists sorteo_participaciones_cliente_id_fkey;

alter table public.sorteo_participaciones
  add constraint sorteo_participaciones_cliente_id_fkey
    foreign key (cliente_id) references public.clientes(id) on delete cascade;
