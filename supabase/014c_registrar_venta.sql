-- ============================================================================
-- 014c_registrar_venta.sql — registrar_venta extendida
--
-- Reemplaza la versión de 005_ventas.sql. Agrega tres parámetros opcionales al
-- final (compatibilidad con quien todavía llame la firma vieja durante el
-- deploy): p_recargo, p_cuotas, p_pagos.
-- ============================================================================

create or replace function public.registrar_venta(
  p_tenant_id      text,
  p_items          jsonb,
  p_medio_pago     text default 'efectivo',
  p_cliente_id     uuid default null,
  p_descuento      numeric default 0,
  p_observaciones  text default null,
  p_recargo        numeric default 0,
  p_cuotas         integer default null,
  p_pagos          jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item        jsonb;
  v_producto_id uuid;
  v_cantidad    numeric;
  v_precio      numeric;
  v_subtotal    numeric;

  v_nombre      text;
  v_marca       text;
  v_linea       text;
  v_peso        numeric;
  v_unidad      producto_unidad;
  v_controla    boolean;
  v_activo      boolean;
  v_stock       numeric;
  v_nuevo       numeric;
  v_present     text;

  v_suma        numeric := 0;
  v_total       numeric;
  v_caja_id     uuid;
  v_venta_id    uuid;
  v_numero      integer;
  v_usuario     text;
  v_cli_nombre  text := '';
  v_cli_tel     text := '';
  v_cli_dni     text := '';
  v_cli_dom     text := '';

  v_pago        jsonb;
  v_pagos_suma  numeric := 0;
begin
  if not public.es_staff(p_tenant_id) then
    raise exception 'No tenés permiso sobre esta veterinaria';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;

  if p_medio_pago not in
    ('efectivo', 'debito', 'credito', 'transferencia', 'mixto', 'cuenta_corriente')
  then
    raise exception 'Medio de pago inválido: %', p_medio_pago;
  end if;

  if p_descuento is null or p_descuento = 'NaN'::numeric or p_descuento < 0 then
    raise exception 'El descuento no es válido';
  end if;

  if p_recargo is null or p_recargo = 'NaN'::numeric or p_recargo < 0 then
    raise exception 'El recargo no es válido';
  end if;

  if p_medio_pago = 'cuenta_corriente' and p_cliente_id is null then
    raise exception 'La cuenta corriente necesita un cliente';
  end if;

  if p_medio_pago = 'mixto' and
    (p_pagos is null or jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0)
  then
    raise exception 'El pago mixto necesita el desglose por medio';
  end if;

  select coalesce(display_name, email) into v_usuario
    from public.usuarios where id = auth.uid();

  if p_cliente_id is not null then
    select nombre, coalesce(telefono, ''), coalesce(dni, ''), coalesce(domicilio, '')
      into v_cli_nombre, v_cli_tel, v_cli_dni, v_cli_dom
      from public.clientes
      where id = p_cliente_id and tenant_id = p_tenant_id;

    if not found then
      raise exception 'El cliente seleccionado no existe';
    end if;
  end if;

  select id into v_caja_id
    from public.cajas
    where tenant_id = p_tenant_id and estado = 'abierta'
    limit 1;

  select coalesce(max(numero), 0) + 1 into v_numero
    from public.ventas where tenant_id = p_tenant_id;

  insert into public.ventas
    (tenant_id, numero, caja_id, cliente_id, cliente_nombre, cliente_telefono,
     cliente_dni, cliente_domicilio,
     medio_pago, subtotal, descuento, recargo, cuotas, total,
     vendedor_id, vendedor_nombre, observaciones)
  values
    (p_tenant_id, v_numero, v_caja_id, p_cliente_id, v_cli_nombre, v_cli_tel,
     v_cli_dni, v_cli_dom,
     p_medio_pago::medio_pago, 0, p_descuento, p_recargo, p_cuotas, 0,
     auth.uid(), v_usuario,
     coalesce(nullif(trim(coalesce(p_observaciones, '')), ''), ''))
  returning id into v_venta_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := nullif(v_item->>'producto_id', '')::uuid;
    v_cantidad    := coalesce((v_item->>'cantidad')::numeric, 0);
    v_precio      := coalesce((v_item->>'precio_unitario')::numeric, 0);
    v_subtotal    := coalesce((v_item->>'subtotal')::numeric, 0);

    if v_producto_id is null then
      raise exception 'Hay un item sin producto';
    end if;
    if v_cantidad is null or v_cantidad = 'NaN'::numeric or v_cantidad <= 0 then
      raise exception 'Cantidad inválida en la venta';
    end if;
    if v_subtotal is null or v_subtotal = 'NaN'::numeric or v_subtotal < 0 then
      raise exception 'Importe inválido en la venta';
    end if;

    select nombre, coalesce(marca, ''), coalesce(linea, ''), peso_kg,
           unidad, controla_stock, activo, stock
      into v_nombre, v_marca, v_linea, v_peso, v_unidad, v_controla, v_activo, v_stock
      from public.productos
      where id = v_producto_id and tenant_id = p_tenant_id
      for update;

    if not found then
      raise exception 'Uno de los productos ya no existe';
    end if;
    if not v_activo then
      raise exception 'El producto "%" está dado de baja', v_nombre;
    end if;

    if v_controla then
      v_nuevo := v_stock - v_cantidad;
      if v_nuevo < 0 then
        raise exception 'No hay stock suficiente de "%" (quedan %, se piden %)',
          v_nombre, v_stock, v_cantidad;
      end if;

      update public.productos set stock = v_nuevo where id = v_producto_id;

      insert into public.stock_movimientos
        (tenant_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
         referencia, usuario_id, usuario_nombre)
      values
        (p_tenant_id, v_producto_id, 'venta', -v_cantidad, v_stock, v_nuevo,
         'Venta #' || v_numero, auth.uid(), v_usuario);
    end if;

    v_present := case
      when v_unidad = 'kg'   then 'por kg'
      when v_peso is not null then trim(to_char(v_peso, 'FM999999990.999')) || ' kg'
      else ''
    end;

    insert into public.venta_items
      (venta_id, tenant_id, producto_id, nombre, marca, presentacion,
       unidad, cantidad, precio_unitario, subtotal)
    values
      (v_venta_id, p_tenant_id, v_producto_id,
       v_nombre || case when v_linea <> '' then ' ' || v_linea else '' end,
       v_marca, v_present, v_unidad, v_cantidad, v_precio, v_subtotal);

    v_suma := v_suma + v_subtotal;
  end loop;

  v_total := greatest(v_suma - p_descuento, 0) + p_recargo;

  update public.ventas
    set subtotal = v_suma, total = v_total
    where id = v_venta_id;

  -- Desglose de "mixto": tiene que sumar exactamente el total (tolerancia de
  -- un centavo por redondeo de punto flotante en el cliente).
  if p_medio_pago = 'mixto' then
    for v_pago in select * from jsonb_array_elements(p_pagos)
    loop
      if coalesce((v_pago->>'medio_pago'), '') not in ('efectivo', 'debito', 'credito', 'transferencia') then
        raise exception 'Medio de pago inválido en el desglose: %', v_pago->>'medio_pago';
      end if;
      if coalesce((v_pago->>'monto')::numeric, 0) <= 0 then
        raise exception 'Hay un monto inválido en el desglose de pagos';
      end if;

      v_pagos_suma := v_pagos_suma + (v_pago->>'monto')::numeric;

      insert into public.venta_pagos (venta_id, tenant_id, medio_pago, monto)
      values (v_venta_id, p_tenant_id, (v_pago->>'medio_pago')::medio_pago, (v_pago->>'monto')::numeric);
    end loop;

    if abs(v_pagos_suma - v_total) > 0.01 then
      raise exception 'El desglose de pagos ($%) no coincide con el total ($%)', v_pagos_suma, v_total;
    end if;
  end if;

  -- Cuenta corriente: la venta queda como deuda del cliente.
  if p_medio_pago = 'cuenta_corriente' then
    insert into public.cuenta_corriente_movimientos
      (tenant_id, cliente_id, tipo, monto, venta_id, usuario_nombre)
    values
      (p_tenant_id, p_cliente_id, 'venta', v_total, v_venta_id, v_usuario);
  end if;

  return jsonb_build_object(
    'venta_id',  v_venta_id,
    'numero',    v_numero,
    'caja_id',   v_caja_id,
    'subtotal',  v_suma,
    'descuento', p_descuento,
    'recargo',   p_recargo,
    'total',     v_total
  );
end $$;

-- ============================================================================
-- registrar_pago_cta_cte — cobrar (total o parcial) la cuenta corriente
--
-- Inserta una fila en `ventas` (sin items, `es_pago_cta_cte = true`) para que
-- el cobro entre al arqueo de caja del turno abierto igual que una venta, y un
-- movimiento 'pago' que descuenta el saldo del cliente.
-- ============================================================================

create or replace function public.registrar_pago_cta_cte(
  p_tenant_id     text,
  p_cliente_id    uuid,
  p_monto         numeric,
  p_medio_pago    text,
  p_observaciones text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario    text;
  v_caja_id    uuid;
  v_venta_id   uuid;
  v_numero     integer;
  v_cli_nombre text;
  v_cli_tel    text;
begin
  if not public.es_staff(p_tenant_id) then
    raise exception 'No tenés permiso sobre esta veterinaria';
  end if;

  if p_monto is null or p_monto = 'NaN'::numeric or p_monto <= 0 then
    raise exception 'El monto del pago no es válido';
  end if;

  if p_medio_pago not in ('efectivo', 'debito', 'credito', 'transferencia') then
    raise exception 'Medio de pago inválido para un cobro de cuenta corriente: %', p_medio_pago;
  end if;

  select nombre, coalesce(telefono, '') into v_cli_nombre, v_cli_tel
    from public.clientes
    where id = p_cliente_id and tenant_id = p_tenant_id;

  if not found then
    raise exception 'El cliente no existe';
  end if;

  select coalesce(display_name, email) into v_usuario
    from public.usuarios where id = auth.uid();

  select id into v_caja_id
    from public.cajas
    where tenant_id = p_tenant_id and estado = 'abierta'
    limit 1;

  select coalesce(max(numero), 0) + 1 into v_numero
    from public.ventas where tenant_id = p_tenant_id;

  insert into public.ventas
    (tenant_id, numero, caja_id, cliente_id, cliente_nombre, cliente_telefono,
     medio_pago, subtotal, descuento, recargo, total,
     es_pago_cta_cte, vendedor_id, vendedor_nombre, observaciones)
  values
    (p_tenant_id, v_numero, v_caja_id, p_cliente_id, v_cli_nombre, v_cli_tel,
     p_medio_pago::medio_pago, 0, 0, 0, p_monto,
     true, auth.uid(), v_usuario,
     coalesce(nullif(trim(coalesce(p_observaciones, '')), ''), 'Pago de cuenta corriente'))
  returning id into v_venta_id;

  insert into public.cuenta_corriente_movimientos
    (tenant_id, cliente_id, tipo, monto, venta_id, observaciones, usuario_nombre)
  values
    (p_tenant_id, p_cliente_id, 'pago', p_monto, v_venta_id,
     coalesce(nullif(trim(coalesce(p_observaciones, '')), ''), ''), v_usuario);

  return jsonb_build_object('venta_id', v_venta_id, 'numero', v_numero);
end $$;
