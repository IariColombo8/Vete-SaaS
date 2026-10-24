-- ============================================================================
-- 066 — Pedidos desde la vidriera (tienda web)
--
-- El cliente arma un carrito en /[slug]/productos, se identifica (Google) y
-- confirma: retiro en el local o envío a domicilio, y cómo paga (efectivo,
-- transferencia, tarjeta o QR de Mercado Pago, con la cuenta que la
-- veterinaria ya conectó para Point).
--
-- 1. `tienda_config`: si la veterinaria recibe pedidos, qué entregas y medios
--    ofrece y el alias para transferir. Se lee en público (es lo que el
--    comprador necesita ver); la edita el staff.
-- 2. `pedidos` / `pedido_items`: el pedido con su snapshot de cliente,
--    dirección y nota. Estados: pendiente → preparacion → reparto →
--    completado (o cancelado). El pago va aparte (`pago_estado`).
-- 3. `ventas.origen` / `ventas.pedido_id` / `ventas.pedido_numero`: la venta
--    de un pedido se distingue de la del mostrador.
-- 4. RPC:
--    · `crear_pedido_web`        — solo service_role (la API calcula precios).
--    · `_venta_de_pedido`        — interna: pedido → venta (stock, correlativo,
--                                  caja). La llama el servidor cuando Mercado
--                                  Pago aprueba, o el staff vía la de abajo.
--    · `registrar_venta_pedido`  — staff: cobró en efectivo/transferencia.
--    · `editar_pedido`           — staff: items, descuento, datos de entrega.
--    · `cambiar_estado_pedido`   — staff: avanzar en el tablero.
--    · `cancelar_pedido`         — staff: anula la venta si la había.
--
-- Decisiones:
--  · El stock se descuenta cuando el pedido se convierte en venta (pago
--    aprobado o cobrado por el staff), no al crearlo: un pedido en efectivo
--    que nunca se retira no deja stock trabado.
--  · Un pedido con venta ya no se edita: la venta (y la factura) son el
--    documento. Para cambiarlo se cancela.
--  · El envío no suma al total: lo cobra el cadete al entregar.
--
-- Idempotente. Requiere 005, 014 (medio_pago), 050 (mp_point_cobros).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. tienda_config
-- ----------------------------------------------------------------------------
create table if not exists public.tienda_config (
  tenant_id              text primary key references public.tenants(slug) on delete cascade,
  pedidos_habilitados    boolean not null default false,
  retiro_habilitado      boolean not null default true,
  envio_habilitado       boolean not null default true,
  nota_envio             text not null default 'El envío lo cobra el cadete al entregar.',
  -- Medios que se ofrecen. 'tarjeta' y 'qr' además exigen Mercado Pago conectado.
  medios                 text[] not null default array['efectivo', 'transferencia', 'tarjeta', 'qr'],
  alias_transferencia    text not null default '',
  titular_transferencia  text not null default '',
  updated_at             timestamptz not null default now(),
  constraint tienda_config_medios_ck
    check (medios <@ array['efectivo', 'transferencia', 'tarjeta', 'qr'])
);

alter table public.tienda_config enable row level security;

drop policy if exists tienda_config_publico on public.tienda_config;
create policy tienda_config_publico on public.tienda_config for select using (true);

drop policy if exists tienda_config_staff on public.tienda_config;
create policy tienda_config_staff on public.tienda_config for all
  using (public.es_staff(tenant_id)) with check (public.es_staff(tenant_id));

-- VipVet arranca con la tienda abierta (lo pidió el dueño).
insert into public.tienda_config (tenant_id, pedidos_habilitados)
select slug, true from public.tenants where slug ilike '%vipvet%'
on conflict (tenant_id) do nothing;

-- ¿Puede la vidriera cobrar con Mercado Pago? Sin exponer el token.
create or replace function public.tienda_publica(p_tenant text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pedidos_habilitados', coalesce(c.pedidos_habilitados, false),
    'retiro_habilitado',   coalesce(c.retiro_habilitado, true),
    'envio_habilitado',    coalesce(c.envio_habilitado, true),
    'nota_envio',          coalesce(c.nota_envio, ''),
    'medios',              coalesce(to_jsonb(c.medios), '[]'::jsonb),
    'alias_transferencia', coalesce(c.alias_transferencia, ''),
    'titular_transferencia', coalesce(c.titular_transferencia, ''),
    'mp_conectado',        exists (select 1 from public.mp_point_config m where m.tenant_id = p_tenant)
  )
  from (select 1) x
  left join public.tienda_config c on c.tenant_id = p_tenant
$$;

grant execute on function public.tienda_publica(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. pedidos
-- ----------------------------------------------------------------------------
create table if not exists public.pedidos (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          text not null references public.tenants(slug) on delete cascade,
  numero             integer not null,

  estado             text not null default 'pendiente'
                     check (estado in ('pendiente', 'preparacion', 'reparto', 'completado', 'cancelado')),

  -- Quién compró (cuenta de Google) y su ficha de cliente en la veterinaria.
  usuario_id         uuid references auth.users(id) on delete set null,
  cliente_id         uuid references public.clientes(id) on delete set null,
  cliente_nombre     text not null,
  cliente_telefono   text not null default '',
  cliente_email      text not null default '',
  cliente_dni        text not null default '',

  entrega            text not null check (entrega in ('retiro', 'envio')),
  direccion          text not null default '',
  nota               text not null default '',

  -- Cómo eligió pagar en la web. 'tarjeta' y 'qr' van por Mercado Pago.
  medio_pago         text not null check (medio_pago in ('efectivo', 'transferencia', 'tarjeta', 'qr')),
  pago_estado        text not null default 'pendiente'
                     check (pago_estado in ('pendiente', 'aprobado', 'rechazado')),
  mp_preference_id   text,
  mp_order_id        text,
  mp_cobro_id        uuid references public.mp_point_cobros(id) on delete set null,
  mp_payment_id      text,

  subtotal           numeric(12,2) not null default 0,
  descuento          numeric(12,2) not null default 0 check (descuento >= 0),
  total              numeric(12,2) not null default 0,

  venta_id           uuid references public.ventas(id) on delete set null,
  -- Por qué no se pudo registrar la venta de un pago aprobado (sin stock…).
  venta_error        text,
  factura_error      text,
  notificado_at      timestamptz,

  cancelado_motivo   text,
  preparacion_at     timestamptz,
  reparto_at         timestamptz,
  completado_at      timestamptz,
  cancelado_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint pedidos_numero_uk unique (tenant_id, numero),
  constraint pedidos_direccion_ck check (entrega = 'retiro' or length(trim(direccion)) > 0)
);

create index if not exists pedidos_tenant_estado_idx on public.pedidos (tenant_id, estado, created_at desc);
create index if not exists pedidos_usuario_idx on public.pedidos (usuario_id, created_at desc);

create table if not exists public.pedido_items (
  id               uuid primary key default gen_random_uuid(),
  pedido_id        uuid not null references public.pedidos(id) on delete cascade,
  tenant_id        text not null references public.tenants(slug) on delete cascade,
  producto_id      uuid references public.productos(id) on delete set null,
  nombre           text not null,
  marca            text not null default '',
  presentacion     text not null default '',
  imagen_url       text,
  unidad           text not null default 'un',
  cantidad         numeric(12,3) not null check (cantidad > 0),
  precio_unitario  numeric(12,2) not null check (precio_unitario >= 0),
  subtotal         numeric(12,2) not null check (subtotal >= 0),
  orden            integer not null default 0
);

create index if not exists pedido_items_pedido_idx on public.pedido_items (pedido_id, orden);

alter table public.pedidos      enable row level security;
alter table public.pedido_items enable row level security;

-- Staff: lee. Escribe solo por RPC (como ventas).
drop policy if exists pedidos_staff_select on public.pedidos;
create policy pedidos_staff_select on public.pedidos for select using (public.es_staff(tenant_id));

drop policy if exists pedido_items_staff_select on public.pedido_items;
create policy pedido_items_staff_select on public.pedido_items for select using (public.es_staff(tenant_id));

-- El comprador ve sus propios pedidos.
drop policy if exists pedidos_comprador_select on public.pedidos;
create policy pedidos_comprador_select on public.pedidos for select using (usuario_id = auth.uid());

drop policy if exists pedido_items_comprador_select on public.pedido_items;
create policy pedido_items_comprador_select on public.pedido_items for select
  using (exists (select 1 from public.pedidos p where p.id = pedido_id and p.usuario_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- 3. ventas: origen
-- ----------------------------------------------------------------------------
alter table public.ventas add column if not exists origen text not null default 'mostrador';
alter table public.ventas drop constraint if exists ventas_origen_ck;
alter table public.ventas add constraint ventas_origen_ck check (origen in ('mostrador', 'web'));
alter table public.ventas add column if not exists pedido_id uuid references public.pedidos(id) on delete set null;
alter table public.ventas add column if not exists pedido_numero integer;

-- ----------------------------------------------------------------------------
-- 4a. crear_pedido_web — solo service_role
--
-- La API (`/api/tienda/pedidos`) ya validó la sesión, buscó o creó el cliente
-- y calculó los precios con los de la vidriera; acá solo se numera y se
-- guarda en una transacción.
--
-- p_datos: { cliente_nombre, cliente_telefono, cliente_email, cliente_dni,
--            entrega, direccion, nota, medio_pago }
-- p_items: [{ producto_id, nombre, marca, presentacion, imagen_url, unidad,
--             cantidad, precio_unitario, subtotal }]
-- ----------------------------------------------------------------------------
create or replace function public.crear_pedido_web(
  p_tenant     text,
  p_usuario_id uuid,
  p_cliente_id uuid,
  p_datos      jsonb,
  p_items      jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_numero integer;
  v_item   jsonb;
  v_suma   numeric := 0;
  v_orden  integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene productos';
  end if;

  -- Correlativo sin carreras entre dos compras simultáneas.
  perform pg_advisory_xact_lock(hashtext('pedidos:' || p_tenant));
  select coalesce(max(numero), 0) + 1 into v_numero from public.pedidos where tenant_id = p_tenant;

  insert into public.pedidos
    (tenant_id, numero, usuario_id, cliente_id, cliente_nombre, cliente_telefono,
     cliente_email, cliente_dni, entrega, direccion, nota, medio_pago)
  values
    (p_tenant, v_numero, p_usuario_id, p_cliente_id,
     left(trim(p_datos->>'cliente_nombre'), 200),
     left(coalesce(trim(p_datos->>'cliente_telefono'), ''), 50),
     left(coalesce(trim(p_datos->>'cliente_email'), ''), 200),
     left(coalesce(trim(p_datos->>'cliente_dni'), ''), 20),
     p_datos->>'entrega',
     left(coalesce(trim(p_datos->>'direccion'), ''), 300),
     left(coalesce(trim(p_datos->>'nota'), ''), 500),
     p_datos->>'medio_pago')
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.pedido_items
      (pedido_id, tenant_id, producto_id, nombre, marca, presentacion, imagen_url,
       unidad, cantidad, precio_unitario, subtotal, orden)
    values
      (v_id, p_tenant, (v_item->>'producto_id')::uuid, v_item->>'nombre',
       coalesce(v_item->>'marca', ''), coalesce(v_item->>'presentacion', ''), v_item->>'imagen_url',
       coalesce(v_item->>'unidad', 'un'), (v_item->>'cantidad')::numeric,
       (v_item->>'precio_unitario')::numeric, (v_item->>'subtotal')::numeric, v_orden);
    v_suma := v_suma + (v_item->>'subtotal')::numeric;
    v_orden := v_orden + 1;
  end loop;

  update public.pedidos set subtotal = v_suma, total = v_suma where id = v_id;

  return jsonb_build_object('pedido_id', v_id, 'numero', v_numero, 'total', v_suma);
end $$;

revoke execute on function public.crear_pedido_web(text, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.crear_pedido_web(text, uuid, uuid, jsonb, jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- 4b. _venta_de_pedido — interna. Pedido → venta.
--
-- Idempotente: si el pedido ya tiene venta, la devuelve. Descuenta stock y
-- registra los movimientos igual que `registrar_venta`; la venta queda en la
-- caja abierta si la hay (si no, se imputa al completar el pedido).
-- ----------------------------------------------------------------------------
create or replace function public._venta_de_pedido(
  p_pedido_id      uuid,
  p_medio_pago     text,
  p_cuotas         integer default null,
  p_mp_payment_id  text default null,
  p_usuario_id     uuid default null,
  p_usuario_nombre text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p          public.pedidos%rowtype;
  v_it       public.pedido_items%rowtype;
  v_venta_id uuid;
  v_numero   integer;
  v_caja_id  uuid;
  v_controla boolean;
  v_activo   boolean;
  v_stock    numeric;
  v_nuevo    numeric;
  v_nombre   text;
  v_total    numeric;
  v_vendedor text := coalesce(nullif(trim(coalesce(p_usuario_nombre, '')), ''), 'Tienda web');
begin
  select * into p from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe';
  end if;

  if p.venta_id is not null then
    select numero into v_numero from public.ventas where id = p.venta_id;
    return jsonb_build_object('venta_id', p.venta_id, 'numero', v_numero, 'ya_existia', true);
  end if;

  if p.estado = 'cancelado' then
    raise exception 'El pedido está cancelado';
  end if;

  if p_medio_pago not in ('efectivo', 'debito', 'credito', 'transferencia') then
    raise exception 'Medio de pago inválido: %', p_medio_pago;
  end if;

  if not exists (select 1 from public.pedido_items where pedido_id = p.id) then
    raise exception 'El pedido no tiene productos';
  end if;

  select id into v_caja_id
    from public.cajas where tenant_id = p.tenant_id and estado = 'abierta' limit 1;

  -- Mismo correlativo que el mostrador: el remito es uno solo.
  select coalesce(max(numero), 0) + 1 into v_numero from public.ventas where tenant_id = p.tenant_id;

  v_total := greatest(p.subtotal - p.descuento, 0);

  insert into public.ventas
    (tenant_id, numero, caja_id, cliente_id, cliente_nombre, cliente_telefono,
     cliente_dni, cliente_domicilio, medio_pago, subtotal, descuento, recargo, cuotas, total,
     vendedor_id, vendedor_nombre, observaciones, origen, pedido_id, pedido_numero, mp_payment_id)
  values
    (p.tenant_id, v_numero, v_caja_id, p.cliente_id, p.cliente_nombre, p.cliente_telefono,
     p.cliente_dni, case when p.entrega = 'envio' then p.direccion else '' end,
     p_medio_pago::medio_pago, p.subtotal, p.descuento, 0,
     case when p_medio_pago = 'credito' then p_cuotas else null end, v_total,
     p_usuario_id, v_vendedor,
     'Pedido web N° ' || p.numero || case when p.entrega = 'envio' then ' · Envío a domicilio' else ' · Retiro en local' end,
     'web', p.id, p.numero, p_mp_payment_id)
  returning id into v_venta_id;

  for v_it in select * from public.pedido_items where pedido_id = p.id order by orden
  loop
    if v_it.producto_id is not null then
      select nombre, controla_stock, activo, stock
        into v_nombre, v_controla, v_activo, v_stock
        from public.productos
        where id = v_it.producto_id and tenant_id = p.tenant_id
        for update;

      if found and v_controla then
        v_nuevo := v_stock - v_it.cantidad;
        if v_nuevo < 0 then
          raise exception 'No hay stock suficiente de "%" (quedan %, se piden %)',
            v_nombre, v_stock, v_it.cantidad;
        end if;

        update public.productos set stock = v_nuevo where id = v_it.producto_id;

        insert into public.stock_movimientos
          (tenant_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
           referencia, usuario_id, usuario_nombre)
        values
          (p.tenant_id, v_it.producto_id, 'venta', -v_it.cantidad, v_stock, v_nuevo,
           'Venta #' || v_numero || ' (pedido web N° ' || p.numero || ')', p_usuario_id, v_vendedor);
      end if;
    end if;

    insert into public.venta_items
      (venta_id, tenant_id, producto_id, nombre, marca, presentacion,
       unidad, cantidad, precio_unitario, subtotal)
    values
      (v_venta_id, p.tenant_id, v_it.producto_id, v_it.nombre, v_it.marca, v_it.presentacion,
       v_it.unidad::producto_unidad, v_it.cantidad, v_it.precio_unitario, v_it.subtotal);
  end loop;

  update public.pedidos
    set venta_id = v_venta_id,
        venta_error = null,
        pago_estado = 'aprobado',
        mp_payment_id = coalesce(p_mp_payment_id, mp_payment_id),
        updated_at = now()
    where id = p.id;

  return jsonb_build_object('venta_id', v_venta_id, 'numero', v_numero, 'caja_id', v_caja_id, 'ya_existia', false);
end $$;

revoke execute on function public._venta_de_pedido(uuid, text, integer, text, uuid, text) from public, anon, authenticated;
grant execute on function public._venta_de_pedido(uuid, text, integer, text, uuid, text) to service_role;

-- ----------------------------------------------------------------------------
-- 4c. registrar_venta_pedido — staff (cobró en el local o al cadete)
-- ----------------------------------------------------------------------------
create or replace function public.registrar_venta_pedido(
  p_pedido_id  uuid,
  p_medio_pago text,
  p_cuotas     integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant  text;
  v_usuario text;
begin
  select tenant_id into v_tenant from public.pedidos where id = p_pedido_id;
  if v_tenant is null or not public.es_staff(v_tenant) then
    raise exception 'No tenés permiso sobre este pedido';
  end if;

  select coalesce(display_name, email) into v_usuario from public.usuarios where id = auth.uid();

  return public._venta_de_pedido(p_pedido_id, p_medio_pago, p_cuotas, null, auth.uid(), v_usuario);
end $$;

grant execute on function public.registrar_venta_pedido(uuid, text, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 4d. editar_pedido — staff, solo antes de que haya venta
--
-- p_items: [{ producto_id, cantidad, precio_unitario, subtotal }] — mismo
-- contrato que `registrar_venta` (el mostrador también calcula los importes).
-- Nombre, marca y presentación se vuelven a copiar del catálogo.
-- p_datos (opcional): { entrega, direccion, nota, cliente_telefono }
-- ----------------------------------------------------------------------------
create or replace function public.editar_pedido(
  p_pedido_id uuid,
  p_items     jsonb,
  p_descuento numeric default 0,
  p_datos     jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p          public.pedidos%rowtype;
  v_item     jsonb;
  v_prod     public.productos%rowtype;
  v_cantidad numeric;
  v_precio   numeric;
  v_subtotal numeric;
  v_suma     numeric := 0;
  v_orden    integer := 0;
  v_entrega  text;
  v_dir      text;
begin
  select * into p from public.pedidos where id = p_pedido_id for update;
  if not found or not public.es_staff(p.tenant_id) then
    raise exception 'No tenés permiso sobre este pedido';
  end if;
  if p.estado not in ('pendiente', 'preparacion') then
    raise exception 'Solo se editan pedidos pendientes o en preparación';
  end if;
  if p.venta_id is not null or p.pago_estado = 'aprobado' then
    raise exception 'El pedido ya está cobrado: para cambiarlo, cancelalo y armá uno nuevo';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido tiene que tener al menos un producto';
  end if;
  if p_descuento is null or p_descuento = 'NaN'::numeric or p_descuento < 0 then
    raise exception 'El descuento no es válido';
  end if;

  delete from public.pedido_items where pedido_id = p.id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_cantidad := coalesce((v_item->>'cantidad')::numeric, 0);
    v_precio   := coalesce((v_item->>'precio_unitario')::numeric, 0);
    v_subtotal := coalesce((v_item->>'subtotal')::numeric, 0);
    if v_cantidad is null or v_cantidad = 'NaN'::numeric or v_cantidad <= 0 then
      raise exception 'Cantidad inválida';
    end if;
    if v_subtotal is null or v_subtotal = 'NaN'::numeric or v_subtotal < 0 then
      raise exception 'Importe inválido';
    end if;

    select * into v_prod from public.productos
      where id = (v_item->>'producto_id')::uuid and tenant_id = p.tenant_id;
    if not found then
      raise exception 'Uno de los productos ya no existe';
    end if;

    insert into public.pedido_items
      (pedido_id, tenant_id, producto_id, nombre, marca, presentacion, imagen_url,
       unidad, cantidad, precio_unitario, subtotal, orden)
    values
      (p.id, p.tenant_id, v_prod.id,
       v_prod.nombre || case when coalesce(v_prod.linea, '') <> '' then ' ' || v_prod.linea else '' end,
       coalesce(v_prod.marca, ''),
       case
         when v_prod.unidad = 'kg' then 'por kg'
         when v_prod.peso_kg is not null then trim(to_char(v_prod.peso_kg, 'FM999999990.999')) || ' kg'
         else ''
       end,
       v_prod.imagen_url, v_prod.unidad::text, v_cantidad, v_precio, v_subtotal, v_orden);

    v_suma := v_suma + v_subtotal;
    v_orden := v_orden + 1;
  end loop;

  v_entrega := coalesce(p_datos->>'entrega', p.entrega);
  v_dir     := coalesce(p_datos->>'direccion', p.direccion);
  if v_entrega not in ('retiro', 'envio') then
    raise exception 'Entrega inválida';
  end if;
  if v_entrega = 'envio' and length(trim(v_dir)) = 0 then
    raise exception 'Para enviar hace falta la dirección';
  end if;

  update public.pedidos
    set subtotal = v_suma,
        descuento = least(p_descuento, v_suma),
        total = greatest(v_suma - p_descuento, 0),
        entrega = v_entrega,
        direccion = left(trim(v_dir), 300),
        nota = left(coalesce(p_datos->>'nota', p.nota), 500),
        cliente_telefono = left(coalesce(p_datos->>'cliente_telefono', p.cliente_telefono), 50),
        updated_at = now()
    where id = p.id;

  return jsonb_build_object('subtotal', v_suma, 'total', greatest(v_suma - p_descuento, 0));
end $$;

grant execute on function public.editar_pedido(uuid, jsonb, numeric, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 4e. cambiar_estado_pedido — staff
--
-- Completar exige la venta registrada (cobrado). Si la venta se registró
-- con la caja cerrada (pago con tarjeta de madrugada), se imputa a la caja
-- abierta en este momento: "pasa a caja" cuando se entrega.
-- ----------------------------------------------------------------------------
create or replace function public.cambiar_estado_pedido(
  p_pedido_id uuid,
  p_estado    text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p         public.pedidos%rowtype;
  v_caja_id uuid;
begin
  select * into p from public.pedidos where id = p_pedido_id for update;
  if not found or not public.es_staff(p.tenant_id) then
    raise exception 'No tenés permiso sobre este pedido';
  end if;
  if p.estado in ('completado', 'cancelado') then
    raise exception 'El pedido ya está cerrado';
  end if;
  if p_estado not in ('pendiente', 'preparacion', 'reparto', 'completado') then
    raise exception 'Estado inválido: %', p_estado;
  end if;

  if p_estado = 'completado' then
    if p.venta_id is null then
      raise exception 'Primero registrá el cobro del pedido';
    end if;
    select id into v_caja_id from public.cajas where tenant_id = p.tenant_id and estado = 'abierta' limit 1;
    if v_caja_id is not null then
      update public.ventas set caja_id = v_caja_id where id = p.venta_id and caja_id is null;
    end if;
  end if;

  update public.pedidos
    set estado = p_estado,
        preparacion_at = case when p_estado = 'preparacion' then coalesce(preparacion_at, now()) else preparacion_at end,
        reparto_at     = case when p_estado = 'reparto'     then coalesce(reparto_at, now())     else reparto_at end,
        completado_at  = case when p_estado = 'completado'  then now()                           else completado_at end,
        updated_at = now()
    where id = p.id;
end $$;

grant execute on function public.cambiar_estado_pedido(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4f. cancelar_pedido — staff. Anula la venta (devuelve stock) si la había.
-- ----------------------------------------------------------------------------
create or replace function public.cancelar_pedido(
  p_pedido_id uuid,
  p_motivo    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.pedidos%rowtype;
begin
  select * into p from public.pedidos where id = p_pedido_id for update;
  if not found or not public.es_staff(p.tenant_id) then
    raise exception 'No tenés permiso sobre este pedido';
  end if;
  if p.estado = 'cancelado' then
    return;
  end if;
  if p.estado = 'completado' then
    raise exception 'El pedido ya se entregó: anulá la venta desde Ventas';
  end if;

  if p.venta_id is not null then
    perform public.anular_venta(p.venta_id, coalesce(nullif(trim(coalesce(p_motivo, '')), ''), 'Pedido web cancelado'));
  end if;

  update public.pedidos
    set estado = 'cancelado',
        cancelado_at = now(),
        cancelado_motivo = nullif(trim(coalesce(p_motivo, '')), ''),
        updated_at = now()
    where id = p.id;
end $$;

grant execute on function public.cancelar_pedido(uuid, text) to authenticated;
