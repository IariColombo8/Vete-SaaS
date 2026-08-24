-- ============================================================================
-- Seed de ventas — VipVet
--
-- Genera 45 días de historia de mostrador para poder mirar el dashboard de
-- Ventas y el arqueo de caja con datos reales en vez de una pantalla vacía:
--
--   · ~4 a 12 ventas por día (los sábados venden más, los domingos cierran)
--   · items tomados del catálogo real, con precio y stock del producto
--   · descuento de stock + `stock_movimientos` tipo 'venta', igual que hace
--     `registrar_venta`
--   · 4 clientes de mostrador, así se puede probar "las compras de Juan"
--   · un puñado de ventas anuladas (con el stock devuelto, como `anular_venta`)
--   · cajas cerradas para los últimos 6 días y una caja abierta hoy
--
-- ⚠ POR QUÉ NO USA LAS RPC: `registrar_venta`, `abrir_caja` y `cerrar_caja`
--   validan `es_staff(tenant_id)`, que se apoya en `auth.uid()`. En el SQL
--   Editor no hay usuario autenticado, así que las RPC fallarían siempre. Este
--   script escribe las tablas directo (el SQL Editor corre como owner y saltea
--   RLS) replicando exactamente lo que hacen las RPC: mismo cálculo de
--   subtotal/total, mismo correlativo, mismos movimientos de stock.
--   Es un script de datos de prueba, no un camino que use la aplicación.
--
-- Ejecutar DESPUÉS de `004_productos.sql`, `005_ventas.sql`,
-- `seeds/vipvet_productos.sql` y `seeds/vipvet_alimentos_imagenes.sql`, en:
--   Supabase Dashboard → SQL Editor → New query
--
-- Idempotente y no destructivo: marca sus filas con
-- `observaciones = 'Venta de demo (seed)'` y el guard mira SOLO esas. Las
-- ventas y la caja que hayas hecho a mano desde el mostrador quedan intactas,
-- y el correlativo de remito arranca después del último número real.
--
-- (La versión anterior salía sin hacer nada si existía cualquier venta. Dos
--  ventas de prueba alcanzaban para que no generara nada, y el `raise notice`
--  que lo avisaba no se ve en el SQL Editor. Por eso parecía que fallaba.)
-- ============================================================================

-- ============================================================================
-- 1. CLIENTES DE MOSTRADOR
-- ============================================================================

insert into public.clientes (tenant_id, nombre, telefono, email, dni)
values
  ('vipvet','Juan Pérez',        '3442556677','juanperez@gmail.com',      '28455112'),
  ('vipvet','Carla Giménez',     '3442448899','carla.gimenez@gmail.com',  '31200455'),
  ('vipvet','Rodrigo Fernández', '3442771122','rodri.fernandez@gmail.com','25977301'),
  ('vipvet','Marta Suárez',      '3442663344','martasuarez@hotmail.com',  '19788440')
on conflict (tenant_id, dni) do nothing;

-- ============================================================================
-- 2. VENTAS
-- ============================================================================

do $$
declare
  c_tenant   constant text := 'vipvet';
  c_dias     constant int  := 45;    -- cuántos días hacia atrás
  c_vendedor constant text := 'Mostrador';
  -- Marca las filas que generó este script: sirve para el guard de
  -- idempotencia y para poder borrarlas sin tocar las ventas reales.
  c_marca    constant text := 'Venta de demo (seed)';

  v_dia          date;
  v_fecha        timestamptz;
  v_cantidad_dia int;
  v_i            int;
  v_j            int;
  v_items        int;

  v_caja_id      uuid;
  v_venta_id     uuid;
  v_numero       int := 0;
  v_medio        medio_pago;
  v_descuento    numeric;
  v_suma         numeric;
  v_total        numeric;

  v_cli_id       uuid;
  v_cli_nombre   text;
  v_cli_tel      text;
  v_prod         record;
  v_cant         numeric;
  v_sub          numeric;
  v_stock_ant    numeric;
  v_stock_new    numeric;
  v_present      text;

  v_anular       boolean;
  v_anuladas     int := 0;
  v_generadas    int := 0;
begin
  if not exists (select 1 from public.tenants where slug = c_tenant) then
    raise exception 'No existe la veterinaria "%". Corré antes seeds/vipvet_productos.sql', c_tenant;
  end if;

  -- El guard mira SOLO las ventas de demo, marcadas en `observaciones`. La
  -- versión anterior miraba si existía cualquier venta, así que dos ventas de
  -- prueba hechas a mano en el mostrador alcanzaban para que este bloque
  -- saliera sin escribir nada — y el `raise notice` no se ve en el SQL Editor.
  if exists (
    select 1 from public.ventas
     where tenant_id = c_tenant and observaciones = c_marca
  ) then
    raise notice 'Las ventas de demo ya están cargadas. Mirá el bloque LIMPIEZA del final.';
    return;
  end if;

  -- El correlativo arranca después de la última venta real: si vendiste algo
  -- a mano, el remito #1 ya existe y el índice único lo rechazaría.
  select coalesce(max(numero), 0) into v_numero
    from public.ventas where tenant_id = c_tenant;

  if not exists (
    select 1 from public.productos
     where tenant_id = c_tenant and activo and (stock > 0 or not controla_stock)
  ) then
    raise exception 'No hay productos con stock en "%". Corré antes seeds/vipvet_productos.sql', c_tenant;
  end if;

  -- Semilla fija: el mismo script produce siempre los mismos datos, así dos
  -- personas mirando la demo ven lo mismo.
  perform setseed(0.42);

  for v_i in reverse c_dias .. 0 loop
    v_dia := current_date - v_i;

    -- Domingo cerrado.
    continue when extract(dow from v_dia) = 0;

    -- Sábado hay más movimiento; el resto de la semana, normal.
    v_cantidad_dia := case
      when extract(dow from v_dia) = 6 then 8 + floor(random() * 5)::int
      else 4 + floor(random() * 5)::int
    end;

    -- Caja del día: solo los últimos 6 días la abren y cierran; más atrás
    -- las ventas quedan sin imputar, que es un caso real y hay que poder verlo.
    --
    -- Las de días pasados se insertan YA cerradas: hay un índice único parcial
    -- que permite una sola caja abierta por veterinaria, así que abrirlas y
    -- cerrarlas de a una chocaría con la caja que puedas tener abierta vos.
    -- El arqueo se completa más abajo, cuando se sabe cuánto se vendió; acá van
    -- valores provisorios porque el check constraint exige que una caja cerrada
    -- tenga cierre_at y saldo_declarado.
    v_caja_id := null;
    if v_i <= 6 then
      if v_i > 0 then
        insert into public.cajas
          (tenant_id, estado, saldo_inicial, abierta_por_nombre, apertura_at,
           cerrada_por_nombre, cierre_at, saldo_declarado, saldo_esperado, observaciones)
        values
          (c_tenant, 'cerrada', 20000, c_vendedor, v_dia + time '08:30',
           c_vendedor, v_dia + time '20:00', 0, 0, c_marca)
        returning id into v_caja_id;

      -- La de hoy queda abierta para poder probar el arqueo desde la app, pero
      -- solo si no hay ya una abierta.
      elsif not exists (
        select 1 from public.cajas where tenant_id = c_tenant and estado = 'abierta'
      ) then
        insert into public.cajas
          (tenant_id, estado, saldo_inicial, abierta_por_nombre, apertura_at, observaciones)
        values
          (c_tenant, 'abierta', 20000, c_vendedor, v_dia + time '08:30', c_marca)
        returning id into v_caja_id;
      end if;
    end if;

    for v_j in 1 .. v_cantidad_dia loop
      -- Entre las 8:30 y las 19:30.
      v_fecha := v_dia + time '08:30' + (random() * interval '11 hours');

      -- 55% efectivo, 20% débito, 15% crédito, 10% transferencia.
      v_medio := case
        when random() < 0.55 then 'efectivo'
        when random() < 0.75 then 'debito'
        when random() < 0.90 then 'credito'
        else 'transferencia'
      end::medio_pago;

      -- 1 de cada 3 ventas es de un cliente conocido; el resto, mostrador.
      v_cli_id     := null;
      v_cli_nombre := '';
      v_cli_tel    := '';
      if random() < 0.34 then
        select id, nombre, telefono
          into v_cli_id, v_cli_nombre, v_cli_tel
          from public.clientes
         where tenant_id = c_tenant
         order by random()
         limit 1;
      end if;

      v_numero    := v_numero + 1;
      v_suma      := 0;
      -- Un descuento chico en 1 de cada 8 ventas.
      v_descuento := case when random() < 0.125 then round((random() * 3000 + 500)::numeric, -2) else 0 end;

      insert into public.ventas
        (tenant_id, numero, caja_id, cliente_id, cliente_nombre, cliente_telefono,
         medio_pago, subtotal, descuento, total, vendedor_nombre, observaciones, created_at)
      values
        (c_tenant, v_numero, v_caja_id,
         v_cli_id, coalesce(v_cli_nombre, ''), coalesce(v_cli_tel, ''),
         v_medio, 0, v_descuento, 0, c_vendedor, c_marca, v_fecha)
      returning id into v_venta_id;

      v_items := 1 + floor(random() * 4)::int;   -- 1 a 4 renglones

      for v_prod in
        select id, nombre, coalesce(marca, '') as marca, coalesce(linea, '') as linea,
               peso_kg, unidad, precio, controla_stock, stock
          from public.productos
         where tenant_id = c_tenant
           and activo
           and (not controla_stock or stock > 0)
         order by
           -- Los alimentos se llevan la mayor parte de las ventas de una
           -- veterinaria: se les da más peso para que el "top productos" del
           -- dashboard se parezca a la realidad.
           random() * case when categoria like 'Alimentos%' then 0.35 else 1 end
         limit v_items
      loop
        -- Suelto: entre 0,5 y 5 kg. Cerrado: 1 a 3 unidades.
        v_cant := case
          when v_prod.unidad = 'kg' then round((0.5 + random() * 4.5)::numeric, 1)
          else 1 + floor(random() * 3)::int
        end;

        if v_prod.controla_stock and v_cant > v_prod.stock then
          v_cant := v_prod.stock;
        end if;
        continue when v_cant <= 0;

        v_sub := round(v_prod.precio * v_cant, 2);

        if v_prod.controla_stock then
          v_stock_ant := v_prod.stock;
          v_stock_new := v_stock_ant - v_cant;

          update public.productos set stock = v_stock_new where id = v_prod.id;

          insert into public.stock_movimientos
            (tenant_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
             referencia, usuario_nombre, fecha)
          values
            (c_tenant, v_prod.id, 'venta', -v_cant, v_stock_ant, v_stock_new,
             'Venta #' || v_numero, c_vendedor, v_fecha);
        end if;

        -- Misma etiqueta que arma `registrar_venta` para el remito.
        v_present := case
          when v_prod.unidad = 'kg'     then 'por kg'
          when v_prod.peso_kg is not null then trim(to_char(v_prod.peso_kg, 'FM999999990.999')) || ' kg'
          else ''
        end;

        insert into public.venta_items
          (venta_id, tenant_id, producto_id, nombre, marca, presentacion,
           unidad, cantidad, precio_unitario, subtotal)
        values
          (v_venta_id, c_tenant, v_prod.id,
           v_prod.nombre || case when v_prod.linea <> '' then ' ' || v_prod.linea else '' end,
           v_prod.marca, v_present, v_prod.unidad, v_cant, v_prod.precio, v_sub);

        v_suma := v_suma + v_sub;
      end loop;

      -- Si por stock no entró ningún renglón, la venta no existe.
      if v_suma = 0 then
        delete from public.ventas where id = v_venta_id;
        v_numero := v_numero - 1;
        continue;
      end if;

      v_total := greatest(v_suma - v_descuento, 0);

      update public.ventas
         set subtotal = v_suma, total = v_total
       where id = v_venta_id;

      v_generadas := v_generadas + 1;

      -- 1 de cada 40 ventas se anula: el stock vuelve y la fila queda marcada,
      -- nunca se borra (el correlativo del remito no puede tener agujeros).
      v_anular := random() < 0.025;
      if v_anular then
        update public.productos p
           set stock = p.stock + i.cantidad
          from public.venta_items i
         where i.venta_id = v_venta_id
           and i.producto_id = p.id
           and p.controla_stock;

        insert into public.stock_movimientos
          (tenant_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
           referencia, usuario_nombre, fecha)
        select c_tenant, i.producto_id, 'entrada', i.cantidad,
               p.stock - i.cantidad, p.stock,
               'Anulación venta #' || v_numero, c_vendedor, v_fecha + interval '20 minutes'
          from public.venta_items i
          join public.productos p on p.id = i.producto_id and p.controla_stock
         where i.venta_id = v_venta_id;

        update public.ventas
           set estado         = 'anulada',
               anulada_at     = v_fecha + interval '20 minutes',
               anulada_motivo = 'El cliente se arrepintió de la compra'
         where id = v_venta_id;

        v_anuladas := v_anuladas + 1;
      end if;
    end loop;

    -- Cierre del día. Se recalcula el esperado desde las ventas completadas,
    -- igual que `cerrar_caja`: sumar un contador daría mal apenas se anula una.
    -- La caja de hoy queda ABIERTA para poder probar el arqueo desde la app.
    if v_caja_id is not null and v_i > 0 then
      update public.cajas c set
        -- El estado ya vino 'cerrada' del insert; acá solo se completa el arqueo.
        total_efectivo  = t.efectivo,
        total_otros     = t.otros,
        total_ventas    = t.total,
        cantidad_ventas = t.cantidad,
        saldo_esperado  = c.saldo_inicial + t.efectivo,
        -- Una diferencia chica de vez en cuando: así el arqueo no se ve
        -- sospechosamente perfecto.
        saldo_declarado = greatest(
          c.saldo_inicial + t.efectivo
            + case when random() < 0.3 then round((random() * 2000 - 1000)::numeric, -2) else 0 end,
          0),
        cerrada_por_nombre = c_vendedor,
        cierre_at          = v_dia + time '20:00'
      from (
        select
          coalesce(sum(total) filter (where medio_pago  = 'efectivo'), 0) as efectivo,
          coalesce(sum(total) filter (where medio_pago <> 'efectivo'), 0) as otros,
          coalesce(sum(total), 0)                                          as total,
          count(*)                                                         as cantidad
        from public.ventas
        where caja_id = v_caja_id and estado = 'completada'
      ) t
      where c.id = v_caja_id;

      update public.cajas
         set diferencia = saldo_declarado - saldo_esperado
       where id = v_caja_id;
    end if;
  end loop;

  raise notice 'VipVet: % ventas generadas (% anuladas) en % días.',
    v_generadas, v_anuladas, c_dias;
end $$;

-- ============================================================================
-- 3. VERIFICACIÓN
--
-- Una sola query: el SQL Editor de Supabase muestra únicamente el resultado
-- del ÚLTIMO select del script.
-- ============================================================================

select * from (
  select 1 as orden, 'ventas totales' as que, count(*)::text as valor
    from public.ventas where tenant_id = 'vipvet'
  union all
  select 2, '  · de demo (este seed)', count(*)::text
    from public.ventas where tenant_id = 'vipvet' and observaciones = 'Venta de demo (seed)'
  union all
  select 3, '  · anuladas', count(*)::text
    from public.ventas where tenant_id = 'vipvet' and estado = 'anulada'
  union all
  select 4, 'facturado (completadas)',
         to_char(coalesce(sum(total), 0), 'FM999G999G999D00')
    from public.ventas where tenant_id = 'vipvet' and estado = 'completada'
  union all
  select 5, 'periodo',
         coalesce(min(created_at)::date::text || ' a ' || max(created_at)::date::text, '—')
    from public.ventas where tenant_id = 'vipvet'
  union all
  select 6, 'renglones vendidos', count(*)::text
    from public.venta_items where tenant_id = 'vipvet'
  union all
  select 7, 'cajas cerradas', count(*)::text
    from public.cajas where tenant_id = 'vipvet' and estado = 'cerrada'
  union all
  select 8, 'cajas abiertas (deberia ser 1)', count(*)::text
    from public.cajas where tenant_id = 'vipvet' and estado = 'abierta'
  union all
  select 9, 'productos bajo minimo', count(*)::text
    from public.productos where tenant_id = 'vipvet' and stock_bajo and activo
  union all
  select 10, 'producto mas vendido',
         coalesce((
           select i.nombre || ' (' || round(sum(i.subtotal))::text || ')'
             from public.venta_items i
             join public.ventas v on v.id = i.venta_id and v.estado = 'completada'
            where i.tenant_id = 'vipvet'
            group by i.nombre
            order by sum(i.subtotal) desc
            limit 1), '—')
) d
order by orden;

-- ============================================================================
-- LIMPIEZA — para regenerar las ventas de demo
--
-- Borra SOLO lo que generó este script (las filas marcadas como demo). Las
-- ventas que hiciste vos desde el mostrador no se tocan.
--
-- ⚠ NO restaura el stock que descontaron esas ventas. Si te importa que el
--   stock vuelva al valor del catálogo, corré también el último update.
--
-- Descomentar y ejecutar sólo si querés volver a generar.
-- ============================================================================

-- delete from public.venta_items
--  where venta_id in (select id from public.ventas
--                      where tenant_id = 'vipvet' and observaciones = 'Venta de demo (seed)');
-- delete from public.stock_movimientos
--  where tenant_id = 'vipvet'
--    and (referencia like 'Venta #%' or referencia like 'Anulación venta #%');
-- delete from public.ventas
--  where tenant_id = 'vipvet' and observaciones = 'Venta de demo (seed)';
-- delete from public.cajas
--  where tenant_id = 'vipvet' and observaciones = 'Venta de demo (seed)';
