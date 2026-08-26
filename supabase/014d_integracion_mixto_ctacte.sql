-- ============================================================================
-- 014d_integracion_mixto_ctacte.sql — corrige dos huecos de integración que
-- quedaron entre "mixto"/"cuenta_corriente" y el código que ya existía:
--
-- 1. `anular_venta` no tocaba `cuenta_corriente_movimientos`: anular una venta
--    a cuenta corriente (o un cobro de cuenta corriente) dejaba la deuda del
--    cliente intacta para siempre. Se agrega el movimiento compensatorio.
--
-- 2. `cerrar_caja` clasificaba una venta "mixta" entera como "no efectivo"
--    (`medio_pago <> 'efectivo'`), así que la parte en efectivo de un pago
--    mixto nunca entraba al esperado de caja. Se suma desde `venta_pagos`.
--
-- Reemplaza las dos funciones de 005_ventas.sql por `create or replace`.
-- ============================================================================

-- ============================================================================
-- 1. anular_venta — revierte también la cuenta corriente
-- ============================================================================

create or replace function public.anular_venta(
  p_venta_id uuid,
  p_motivo   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant       text;
  v_estado       venta_estado;
  v_numero       integer;
  v_medio_pago   medio_pago;
  v_cliente_id   uuid;
  v_total        numeric;
  v_es_pago_cta  boolean;
  v_item         record;
  v_stock        numeric;
  v_nuevo        numeric;
  v_usuario      text;
begin
  select tenant_id, estado, numero, medio_pago, cliente_id, total, es_pago_cta_cte
    into v_tenant, v_estado, v_numero, v_medio_pago, v_cliente_id, v_total, v_es_pago_cta
    from public.ventas where id = p_venta_id
    for update;

  if not found then
    raise exception 'La venta no existe';
  end if;
  if not public.es_staff(v_tenant) then
    raise exception 'No tenés permiso sobre esta veterinaria';
  end if;
  if v_estado = 'anulada' then
    raise exception 'La venta #% ya está anulada', v_numero;
  end if;

  select coalesce(display_name, email) into v_usuario
    from public.usuarios where id = auth.uid();

  for v_item in
    select producto_id, nombre, cantidad
      from public.venta_items
      where venta_id = p_venta_id and producto_id is not null
  loop
    select stock into v_stock
      from public.productos
      where id = v_item.producto_id and controla_stock
      for update;

    -- Si el producto se borró o es un servicio sin stock, no hay nada que devolver.
    if not found then continue; end if;

    v_nuevo := v_stock + v_item.cantidad;
    update public.productos set stock = v_nuevo where id = v_item.producto_id;

    insert into public.stock_movimientos
      (tenant_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
       referencia, usuario_id, usuario_nombre)
    values
      (v_tenant, v_item.producto_id, 'entrada', v_item.cantidad, v_stock, v_nuevo,
       'Anulación venta #' || v_numero, auth.uid(), v_usuario);
  end loop;

  -- Una venta a cuenta corriente que se anula deja de ser deuda: se compensa
  -- con un movimiento 'pago' por el mismo monto, nunca se borra el original
  -- (mismo criterio que el resto del sistema: todo queda en el historial).
  if v_medio_pago = 'cuenta_corriente' and v_cliente_id is not null then
    insert into public.cuenta_corriente_movimientos
      (tenant_id, cliente_id, tipo, monto, venta_id, observaciones, usuario_nombre)
    values
      (v_tenant, v_cliente_id, 'pago', v_total, p_venta_id,
       'Anulación de la venta #' || v_numero, v_usuario);
  end if;

  -- Anular un COBRO de cuenta corriente restaura la deuda que ese cobro había
  -- cancelado.
  if v_es_pago_cta_cte and v_cliente_id is not null then
    insert into public.cuenta_corriente_movimientos
      (tenant_id, cliente_id, tipo, monto, venta_id, observaciones, usuario_nombre)
    values
      (v_tenant, v_cliente_id, 'venta', v_total, p_venta_id,
       'Anulación del pago de cuenta corriente #' || v_numero, v_usuario);
  end if;

  update public.ventas set
    estado         = 'anulada',
    anulada_at     = now(),
    anulada_motivo = nullif(trim(coalesce(p_motivo, '')), '')
  where id = p_venta_id;

  return jsonb_build_object('venta_id', p_venta_id, 'numero', v_numero);
end $$;

-- ============================================================================
-- 2. cerrar_caja — la parte en efectivo de un pago "mixto" cuenta como
--    efectivo, no como "otros". El total no cambia, solo cómo se reparte.
-- ============================================================================

create or replace function public.cerrar_caja(
  p_caja_id         uuid,
  p_saldo_declarado numeric,
  p_observaciones   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant         text;
  v_estado         caja_estado;
  v_inicial        numeric;
  v_efectivo       numeric;
  v_otros          numeric;
  v_total          numeric;
  v_cantidad       integer;
  v_esperado       numeric;
  v_usuario        text;
  v_efectivo_mixto numeric;
begin
  if p_saldo_declarado is null or p_saldo_declarado = 'NaN'::numeric or p_saldo_declarado < 0 then
    raise exception 'El monto contado no es válido';
  end if;

  select tenant_id, estado, saldo_inicial
    into v_tenant, v_estado, v_inicial
    from public.cajas where id = p_caja_id
    for update;

  if not found then
    raise exception 'La caja no existe';
  end if;
  if not public.es_staff(v_tenant) then
    raise exception 'No tenés permiso sobre esta veterinaria';
  end if;
  if v_estado = 'cerrada' then
    raise exception 'La caja ya está cerrada';
  end if;

  -- Las anuladas no cuentan: la plata volvió al cliente.
  select
    coalesce(sum(total) filter (where medio_pago = 'efectivo'), 0),
    coalesce(sum(total), 0),
    count(*)
  into v_efectivo, v_total, v_cantidad
  from public.ventas
  where caja_id = p_caja_id and estado = 'completada';

  -- La pata en efectivo de los pagos "mixto" del turno: sin esto, un mixto de
  -- $500 efectivo + $500 tarjeta quedaba entero afuera del efectivo esperado.
  select coalesce(sum(vp.monto), 0) into v_efectivo_mixto
    from public.venta_pagos vp
    join public.ventas v on v.id = vp.venta_id
    where v.caja_id = p_caja_id and v.estado = 'completada'
      and v.medio_pago = 'mixto' and vp.medio_pago = 'efectivo';

  v_efectivo := v_efectivo + v_efectivo_mixto;
  v_otros    := greatest(v_total - v_efectivo, 0);
  v_esperado := v_inicial + v_efectivo;

  select coalesce(display_name, email) into v_usuario
    from public.usuarios where id = auth.uid();

  update public.cajas set
    estado             = 'cerrada',
    saldo_declarado    = p_saldo_declarado,
    saldo_esperado     = v_esperado,
    diferencia         = p_saldo_declarado - v_esperado,
    total_efectivo     = v_efectivo,
    total_otros        = v_otros,
    total_ventas       = v_total,
    cantidad_ventas    = v_cantidad,
    cerrada_por        = auth.uid(),
    cerrada_por_nombre = v_usuario,
    observaciones      = coalesce(nullif(trim(coalesce(p_observaciones, '')), ''), observaciones),
    cierre_at          = now()
  where id = p_caja_id;

  return jsonb_build_object(
    'caja_id',         p_caja_id,
    'saldo_esperado',  v_esperado,
    'saldo_declarado', p_saldo_declarado,
    'diferencia',      p_saldo_declarado - v_esperado,
    'total_efectivo',  v_efectivo,
    'total_otros',     v_otros,
    'total_ventas',    v_total,
    'cantidad_ventas', v_cantidad
  );
end $$;

-- ============================================================================
-- FIN
-- ============================================================================
