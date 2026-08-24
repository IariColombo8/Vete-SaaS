-- ============================================================================
-- 005_ventas.sql — Punto de venta, caja y remitos
--
-- Continúa `004_productos.sql`, que dejó el catálogo y el stock. Acá se agrega
-- lo que faltaba para vender:
--
--   · `cajas`       — turno de mostrador, con apertura, arqueo y cierre.
--   · `ventas`      — cabecera del ticket.
--   · `venta_items` — el detalle, con los datos del producto congelados.
--
-- Tres decisiones que conviene tener presentes al leer esto:
--
-- 1. El detalle va en tabla, no en un `jsonb` como en el kiosko. El dashboard
--    necesita agrupar por producto ("los 10 más vendidos") y eso contra jsonb
--    es lento y se escribe mal.
--
-- 2. Los items guardan una copia del nombre, la marca y el precio. Si mañana
--    sube el precio o se da de baja el producto, el remito que se imprimió hace
--    seis meses tiene que seguir diciendo exactamente lo mismo.
--
-- 3. Vender es una sola llamada a `registrar_venta`. Nunca se descuenta stock
--    desde el cliente: si la conexión se corta a mitad del carrito, o se
--    descontó todo o no se descontó nada.
--
-- Requiere haber corrido antes `schema.sql` y `004_productos.sql`.
-- ============================================================================

-- ============================================================================
-- 1. TIPOS
-- ============================================================================

do $$ begin
  create type medio_pago as enum ('efectivo', 'debito', 'credito', 'transferencia');
exception when duplicate_object then null; end $$;

do $$ begin
  create type venta_estado as enum ('completada', 'anulada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type caja_estado as enum ('abierta', 'cerrada');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 2. PRODUCTOS: campos de alimento
--
-- El selector guiado del mostrador es "marca → línea → presentación". Con estos
-- tres campos alcanza y no hace falta una tabla de variantes: cada bolsa sigue
-- siendo un producto normal, con su propio stock y su propio precio, que es
-- como se compran y se cuentan en la práctica.
--
--   · unidad = 'un' + peso_kg  → bolsa cerrada (Royal Canin Adulto 15 kg)
--   · unidad = 'kg'            → suelto: `precio` se lee como precio POR KILO
--                                y el mostrador pide cuántos kg se llevan.
-- ============================================================================

alter table public.productos add column if not exists marca   text;
alter table public.productos add column if not exists linea   text;
alter table public.productos add column if not exists peso_kg numeric(8,3);

alter table public.productos drop constraint if exists productos_peso_kg_ck;
alter table public.productos add  constraint productos_peso_kg_ck
  check (peso_kg is null or peso_kg > 0);

-- El selector arranca listando marcas, después líneas de esa marca.
create index if not exists idx_productos_marca
  on public.productos (tenant_id, marca, linea)
  where marca is not null and marca <> '';

-- ============================================================================
-- 3. CAJAS
-- ============================================================================

create table if not exists public.cajas (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           text not null references public.tenants(slug) on delete cascade,

  estado              caja_estado not null default 'abierta',
  saldo_inicial       numeric(12,2) not null default 0,

  -- Se completan al cerrar.
  saldo_declarado     numeric(12,2),   -- lo que se contó a mano
  saldo_esperado      numeric(12,2),   -- inicial + ventas en efectivo
  diferencia          numeric(12,2),   -- declarado - esperado
  total_efectivo      numeric(12,2) not null default 0,
  total_otros         numeric(12,2) not null default 0,  -- débito + crédito + transferencia
  total_ventas        numeric(12,2) not null default 0,
  cantidad_ventas     integer       not null default 0,

  abierta_por         uuid references auth.users(id) on delete set null,
  abierta_por_nombre  text,
  cerrada_por         uuid references auth.users(id) on delete set null,
  cerrada_por_nombre  text,
  observaciones       text not null default '',

  apertura_at         timestamptz not null default now(),
  cierre_at           timestamptz,

  constraint cajas_saldo_inicial_ck check (saldo_inicial >= 0),
  -- Una caja cerrada tiene que tener fecha de cierre y arqueo; una abierta, no.
  constraint cajas_cierre_ck check (
    (estado = 'abierta' and cierre_at is null  and saldo_declarado is null)
    or
    (estado = 'cerrada' and cierre_at is not null and saldo_declarado is not null)
  )
);

-- Como máximo una caja abierta por veterinaria. En el kiosko esto se controlaba
-- solo en la aplicación y un bug alcanzó para dejar dos cajas abiertas a la vez;
-- con el índice parcial la base lo rechaza aunque la aplicación se equivoque.
create unique index if not exists idx_cajas_una_abierta
  on public.cajas (tenant_id)
  where estado = 'abierta';

create index if not exists idx_cajas_apertura
  on public.cajas (tenant_id, apertura_at desc);

-- ============================================================================
-- 4. VENTAS
-- ============================================================================

create table if not exists public.ventas (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null references public.tenants(slug) on delete cascade,

  -- Correlativo por veterinaria, para el remito. Lo asigna `registrar_venta`.
  numero            integer not null,

  caja_id           uuid references public.cajas(id) on delete set null,

  -- El cliente es opcional (mostrador). Se guarda el id para poder ver "las
  -- compras de Juan" y además el nombre suelto, para que el remito siga siendo
  -- legible si el cliente después se borra.
  cliente_id        uuid references public.clientes(id) on delete set null,
  cliente_nombre    text not null default '',
  cliente_telefono  text not null default '',
  cliente_dni       text not null default '',
  cliente_domicilio text not null default '',

  medio_pago        medio_pago   not null default 'efectivo',
  estado            venta_estado not null default 'completada',

  subtotal          numeric(12,2) not null default 0,  -- suma de los items
  descuento         numeric(12,2) not null default 0,  -- descuento global
  total             numeric(12,2) not null default 0,

  anulada_at        timestamptz,
  anulada_motivo    text,

  vendedor_id       uuid references auth.users(id) on delete set null,
  vendedor_nombre   text,

  observaciones     text not null default '',
  created_at        timestamptz not null default now(),

  constraint ventas_total_ck     check (total >= 0),
  constraint ventas_descuento_ck check (descuento >= 0),
  constraint ventas_numero_ck    check (numero > 0),
  constraint ventas_anulada_ck   check (
    (estado = 'completada' and anulada_at is null)
    or
    (estado = 'anulada'    and anulada_at is not null)
  )
);

-- Por si la tabla se creó con una versión anterior de este archivo.
alter table public.ventas add column if not exists cliente_dni       text not null default '';
alter table public.ventas add column if not exists cliente_domicilio text not null default '';

create unique index if not exists idx_ventas_numero
  on public.ventas (tenant_id, numero);

-- El índice que más se usa: el dashboard y el historial siempre filtran por
-- tenant y ordenan por fecha descendente.
create index if not exists idx_ventas_fecha
  on public.ventas (tenant_id, created_at desc);

create index if not exists idx_ventas_caja
  on public.ventas (caja_id) where caja_id is not null;

create index if not exists idx_ventas_cliente
  on public.ventas (tenant_id, cliente_id) where cliente_id is not null;

-- ============================================================================
-- 5. VENTA_ITEMS
--
-- `producto_id` es `on delete set null` a propósito: si se borra un producto
-- del catálogo, la venta histórica no se toca. El detalle sobrevive gracias a
-- los campos congelados de abajo.
-- ============================================================================

create table if not exists public.venta_items (
  id                uuid primary key default gen_random_uuid(),
  venta_id          uuid not null references public.ventas(id) on delete cascade,
  tenant_id         text not null references public.tenants(slug) on delete cascade,
  producto_id       uuid references public.productos(id) on delete set null,

  -- Copia congelada de cómo era el producto al momento de venderlo.
  nombre            text not null,
  marca             text not null default '',
  presentacion      text not null default '',   -- "15 kg", "por kg", ""
  unidad            producto_unidad not null default 'un',

  cantidad          numeric(12,3) not null,     -- kg si unidad='kg'
  precio_unitario   numeric(12,2) not null,     -- por kilo si unidad='kg'
  subtotal          numeric(12,2) not null,     -- ya con la oferta aplicada

  constraint venta_items_cantidad_ck check (cantidad > 0),
  constraint venta_items_precio_ck   check (precio_unitario >= 0),
  constraint venta_items_subtotal_ck check (subtotal >= 0)
);

create index if not exists idx_venta_items_venta    on public.venta_items (venta_id);
-- Para el "top productos" del dashboard.
create index if not exists idx_venta_items_producto on public.venta_items (tenant_id, producto_id);

-- ============================================================================
-- 6. RPC: abrir_caja
-- ============================================================================

create or replace function public.abrir_caja(
  p_tenant_id     text,
  p_saldo_inicial numeric default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario text;
  v_id      uuid;
begin
  if not public.es_staff(p_tenant_id) then
    raise exception 'No tenés permiso sobre esta veterinaria';
  end if;

  if p_saldo_inicial is null or p_saldo_inicial = 'NaN'::numeric or p_saldo_inicial < 0 then
    raise exception 'El saldo inicial no es válido';
  end if;

  if exists (select 1 from public.cajas
              where tenant_id = p_tenant_id and estado = 'abierta') then
    raise exception 'Ya hay una caja abierta. Cerrala antes de abrir otra.';
  end if;

  select coalesce(display_name, email) into v_usuario
    from public.usuarios where id = auth.uid();

  insert into public.cajas
    (tenant_id, saldo_inicial, abierta_por, abierta_por_nombre)
  values
    (p_tenant_id, p_saldo_inicial, auth.uid(), v_usuario)
  returning id into v_id;

  return jsonb_build_object('caja_id', v_id);
end $$;

-- ============================================================================
-- 7. RPC: cerrar_caja
--
-- El esperado se recalcula acá sumando las ventas del turno en vez de confiar
-- en un contador que se va actualizando: si alguna venta se anuló, el contador
-- queda mal y el arqueo acusa una diferencia que no existe.
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
  v_tenant    text;
  v_estado    caja_estado;
  v_inicial   numeric;
  v_efectivo  numeric;
  v_otros     numeric;
  v_total     numeric;
  v_cantidad  integer;
  v_esperado  numeric;
  v_usuario   text;
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
    coalesce(sum(total) filter (where medio_pago <> 'efectivo'), 0),
    coalesce(sum(total), 0),
    count(*)
  into v_efectivo, v_otros, v_total, v_cantidad
  from public.ventas
  where caja_id = p_caja_id and estado = 'completada';

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
-- 8. RPC: registrar_venta
--
-- El corazón del mostrador. Todo pasa en una transacción:
--   valida items → bloquea productos → descuenta stock → inserta movimientos
--   → numera la venta → guarda cabecera y detalle.
--
-- p_items: [{ producto_id, cantidad, precio_unitario, subtotal }]
--   El precio y el subtotal los manda el cliente porque el cálculo de ofertas
--   (incluidos los combos "3x$1000") vive en `lib/ventas/carrito.ts` y está
--   testeado ahí. Pero acá NO se confía en el total: se recalcula sumando los
--   subtotales, así el total guardado siempre coincide con el detalle.
-- ============================================================================

create or replace function public.registrar_venta(
  p_tenant_id      text,
  p_items          jsonb,
  p_medio_pago     text default 'efectivo',
  p_cliente_id     uuid default null,
  p_descuento      numeric default 0,
  p_observaciones  text default null
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
begin
  if not public.es_staff(p_tenant_id) then
    raise exception 'No tenés permiso sobre esta veterinaria';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;

  if p_medio_pago not in ('efectivo', 'debito', 'credito', 'transferencia') then
    raise exception 'Medio de pago inválido: %', p_medio_pago;
  end if;

  if p_descuento is null or p_descuento = 'NaN'::numeric or p_descuento < 0 then
    raise exception 'El descuento no es válido';
  end if;

  select coalesce(display_name, email) into v_usuario
    from public.usuarios where id = auth.uid();

  -- Copia del cliente para el remito. Si el id no corresponde a esta
  -- veterinaria queda en null: no se filtran datos de otro tenant.
  if p_cliente_id is not null then
    select nombre, coalesce(telefono, ''), coalesce(dni, ''), coalesce(domicilio, '')
      into v_cli_nombre, v_cli_tel, v_cli_dni, v_cli_dom
      from public.clientes
      where id = p_cliente_id and tenant_id = p_tenant_id;

    if not found then
      raise exception 'El cliente seleccionado no existe';
    end if;
  end if;

  -- Si hay una caja abierta la venta se le imputa sola. Si no la hay, se vende
  -- igual: no tiene sentido bloquear el mostrador porque nadie abrió caja.
  select id into v_caja_id
    from public.cajas
    where tenant_id = p_tenant_id and estado = 'abierta'
    limit 1;

  -- Correlativo por veterinaria. El `for update` sobre las ventas del tenant
  -- serializa dos cajeros vendiendo a la vez; si aun así se cuelan, el índice
  -- único `idx_ventas_numero` rechaza el duplicado y la transacción se cae.
  select coalesce(max(numero), 0) + 1 into v_numero
    from public.ventas where tenant_id = p_tenant_id;

  insert into public.ventas
    (tenant_id, numero, caja_id, cliente_id, cliente_nombre, cliente_telefono,
     cliente_dni, cliente_domicilio,
     medio_pago, subtotal, descuento, total, vendedor_id, vendedor_nombre, observaciones)
  values
    (p_tenant_id, v_numero, v_caja_id, p_cliente_id, v_cli_nombre, v_cli_tel,
     v_cli_dni, v_cli_dom,
     p_medio_pago::medio_pago, 0, p_descuento, 0, auth.uid(), v_usuario,
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

    -- Etiqueta legible de la presentación, para el remito.
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

  -- El descuento nunca puede dejar el total en negativo.
  v_total := greatest(v_suma - p_descuento, 0);

  update public.ventas
    set subtotal = v_suma, total = v_total
    where id = v_venta_id;

  return jsonb_build_object(
    'venta_id',  v_venta_id,
    'numero',    v_numero,
    'caja_id',   v_caja_id,
    'subtotal',  v_suma,
    'descuento', p_descuento,
    'total',     v_total
  );
end $$;

-- ============================================================================
-- 9. RPC: anular_venta
--
-- Devuelve el stock y deja la venta marcada. No se borra nunca: el correlativo
-- del remito tiene que quedar completo, sin agujeros.
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
  v_tenant   text;
  v_estado   venta_estado;
  v_numero   integer;
  v_item     record;
  v_stock    numeric;
  v_nuevo    numeric;
  v_usuario  text;
begin
  select tenant_id, estado, numero
    into v_tenant, v_estado, v_numero
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

  update public.ventas set
    estado         = 'anulada',
    anulada_at     = now(),
    anulada_motivo = nullif(trim(coalesce(p_motivo, '')), '')
  where id = p_venta_id;

  return jsonb_build_object('venta_id', p_venta_id, 'numero', v_numero);
end $$;

-- ============================================================================
-- 10. ROW LEVEL SECURITY
--
-- Igual que en 004: todo es interno de la veterinaria, nada es público.
-- Las ventas son append-only desde el cliente — se insertan y se anulan por
-- RPC (`security definer`), nunca con un update suelto que podría cambiar un
-- total ya cobrado.
-- ============================================================================

alter table public.cajas       enable row level security;
alter table public.ventas      enable row level security;
alter table public.venta_items enable row level security;

drop policy if exists cajas_staff on public.cajas;
create policy cajas_staff on public.cajas for select
  using (es_staff(tenant_id));

drop policy if exists ventas_read       on public.ventas;
drop policy if exists venta_items_read  on public.venta_items;
create policy ventas_read on public.ventas for select
  using (es_staff(tenant_id));
create policy venta_items_read on public.venta_items for select
  using (es_staff(tenant_id));

-- ============================================================================
-- FIN
-- ============================================================================
