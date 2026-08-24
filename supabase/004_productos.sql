-- ============================================================================
-- Veterinaria-SaaS — 004: Productos y stock
--
-- Port de la parte de catálogo/stock del POS "Kiosko Despensa", adaptada al
-- modelo multi-tenant de este SaaS:
--   · `comercio_id text` → `tenant_id text references tenants(slug)`
--   · PK text → uuid, igual que el resto de las tablas de acá
--   · columnas en inglés (name/price/category) → español, como el resto
--   · RLS ON con `es_staff(tenant_id)`; en el kiosko estaba apagado y todo
--     pasaba por API routes con service_role. Acá el cliente escribe directo.
--   · se descarta lo específico del kiosko: sincronización con la
--     distribuidora, favoritos de la grilla del POS y login por PIN.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- Requiere haber corrido antes `schema.sql` (usa tenants, usuarios, es_staff).
-- Idempotente: se puede correr varias veces sin romper.
-- ============================================================================

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

do $$ begin
  create type producto_unidad as enum ('un', 'kg');
exception when duplicate_object then null; end $$;

do $$ begin
  create type oferta_tipo as enum ('monto', 'porcentaje', 'combo');
exception when duplicate_object then null; end $$;

-- 'uso' = consumido en una consulta (jeringa, vacuna aplicada, gasa).
-- 'venta' queda previsto para cuando haya mostrador; hoy nadie lo escribe.
do $$ begin
  create type movimiento_stock_tipo as enum ('entrada', 'ajuste', 'rotura', 'uso', 'venta');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 2. PRODUCTOS
-- Mercadería de la veterinaria: alimento, medicamentos, accesorios y también
-- "servicios" (baño, peluquería) que se listan pero no llevan stock.
-- ============================================================================

create table if not exists public.productos (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           text not null references public.tenants(slug) on delete cascade,

  -- Identificación
  codigo              text,          -- código interno del proveedor
  codigo_barras       text,          -- EAN, para lector
  nombre              text not null,
  descripcion         text not null default '',
  categoria           text not null default '',   -- "Rubro / Subrubro"
  imagen_url          text,

  -- Plata
  precio              numeric(12,2) not null default 0,   -- precio de venta
  costo               numeric(12,2),                      -- para calcular margen

  -- Stock
  stock               numeric(12,3) not null default 0,
  stock_minimo        numeric(12,3) not null default 0,
  -- false = es un servicio: se cobra pero no descuenta ni valida stock
  controla_stock      boolean not null default true,
  unidad              producto_unidad not null default 'un',
  -- Unidades por bulto/paquete cerrado del proveedor (ej: 12 latas por caja)
  unidades_por_bulto  integer,
  fecha_vencimiento   date,

  -- Oferta de catálogo
  --   monto      → precio - oferta_valor
  --   porcentaje → precio * (1 - oferta_valor/100)
  --   combo      → cada `oferta_cantidad` unidades cuestan `oferta_valor` en total
  oferta_activa       boolean not null default false,
  oferta_tipo         oferta_tipo,
  oferta_valor        numeric(12,2) not null default 0,
  oferta_cantidad     integer,

  -- Estado
  activo              boolean not null default true,
  -- Lo marca la importación cuando la fila del Excel venía incompleta
  revisar             boolean not null default false,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Columna calculada: PostgREST no sabe comparar una columna contra otra, así
  -- que "stock <= stock_minimo" no se puede filtrar desde el cliente. Materializarlo
  -- acá lo vuelve un filtro común (`stock_bajo=eq.true`) y además indexable.
  -- Incluye a los agotados; para "bajo pero no agotado" se suma `stock > 0`.
  stock_bajo boolean generated always as (
    controla_stock and stock <= stock_minimo
  ) stored,

  constraint productos_precio_ck       check (precio >= 0),
  constraint productos_costo_ck        check (costo is null or costo >= 0),
  constraint productos_stock_minimo_ck check (stock_minimo >= 0),
  constraint productos_bulto_ck        check (unidades_por_bulto is null or unidades_por_bulto > 0),
  -- Una oferta activa tiene que ser aplicable; si no, no es una oferta.
  constraint productos_oferta_ck check (
    not oferta_activa
    or (
      oferta_tipo is not null
      and oferta_valor > 0
      and (oferta_tipo <> 'porcentaje' or oferta_valor < 100)
      and (oferta_tipo <> 'combo'      or coalesce(oferta_cantidad, 0) > 1)
    )
  )
);

-- Los códigos son únicos dentro del tenant, pero opcionales: por eso el índice
-- único es parcial (varios productos sin código no chocan entre sí).
create unique index if not exists productos_tenant_barras_uk
  on public.productos (tenant_id, codigo_barras)
  where codigo_barras is not null and codigo_barras <> '';

create unique index if not exists productos_tenant_codigo_uk
  on public.productos (tenant_id, codigo)
  where codigo is not null and codigo <> '';

create index if not exists productos_tenant_nombre_idx
  on public.productos (tenant_id, lower(nombre));
create index if not exists productos_tenant_categoria_idx
  on public.productos (tenant_id, categoria);
create index if not exists productos_vencimiento_idx
  on public.productos (tenant_id, fecha_vencimiento)
  where fecha_vencimiento is not null;
create index if not exists productos_stock_bajo_idx
  on public.productos (tenant_id)
  where stock_bajo;

-- Si la tabla ya existía de una corrida anterior sin la columna calculada.
alter table public.productos add column if not exists stock_bajo boolean
  generated always as (controla_stock and stock <= stock_minimo) stored;

-- ============================================================================
-- 3. STOCK_MOVIMIENTOS
-- Historial append-only. `cantidad` es el delta con signo: positivo entra,
-- negativo sale. Nunca se actualiza ni se borra una fila de acá.
-- ============================================================================

create table if not exists public.stock_movimientos (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null references public.tenants(slug) on delete cascade,
  producto_id     uuid not null references public.productos(id) on delete cascade,
  tipo            movimiento_stock_tipo not null,
  cantidad        numeric(12,3) not null,   -- delta con signo
  stock_anterior  numeric(12,3),
  stock_nuevo     numeric(12,3),
  referencia      text,                     -- observación libre
  usuario_id      uuid references auth.users(id) on delete set null,
  usuario_nombre  text,
  fecha           timestamptz not null default now()
);

create index if not exists stock_mov_producto_idx on public.stock_movimientos (producto_id, fecha desc);
create index if not exists stock_mov_tenant_idx   on public.stock_movimientos (tenant_id, fecha desc);

-- ============================================================================
-- 4. PRODUCTO_AUDITORIA
-- Quién tocó el precio y cuándo. Protege al dueño frente a un error o un
-- cambio no autorizado de un empleado. No es contabilidad, es trazabilidad.
-- ============================================================================

create table if not exists public.producto_auditoria (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null references public.tenants(slug) on delete cascade,
  producto_id     uuid not null references public.productos(id) on delete cascade,
  campo           text not null,
  valor_anterior  text,
  valor_nuevo     text,
  usuario_id      uuid references auth.users(id) on delete set null,
  usuario_nombre  text,
  fecha           timestamptz not null default now()
);

create index if not exists producto_aud_producto_idx on public.producto_auditoria (producto_id, fecha desc);
create index if not exists producto_aud_tenant_idx   on public.producto_auditoria (tenant_id, fecha desc);

-- ============================================================================
-- 5. TRIGGERS
-- ============================================================================

drop trigger if exists touch_productos on public.productos;
create trigger touch_productos before update on public.productos
  for each row execute function public.touch_updated_at();

-- Auditoría automática del precio. Estaba en el cliente en el kiosko (una
-- llamada aparte después del update, que se podía olvidar o saltear); acá lo
-- hace la base, así que ningún cambio de precio se escapa.
create or replace function public.auditar_precio_producto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.precio is distinct from old.precio then
    insert into public.producto_auditoria
      (tenant_id, producto_id, campo, valor_anterior, valor_nuevo, usuario_id, usuario_nombre)
    values (
      new.tenant_id, new.id, 'precio',
      old.precio::text, new.precio::text,
      auth.uid(),
      coalesce(
        (select display_name from public.usuarios where id = auth.uid()),
        (select email        from public.usuarios where id = auth.uid()),
        'sistema'
      )
    );
  end if;
  return new;
end $$;

drop trigger if exists auditar_precio on public.productos;
create trigger auditar_precio after update of precio on public.productos
  for each row execute function public.auditar_precio_producto();

-- ============================================================================
-- 6. RPC: ajustar_stock
-- Mueve el stock y deja el movimiento en una sola transacción. El `for update`
-- serializa dos ajustes simultáneos sobre el mismo producto.
--
-- Corre con permisos del invocante (NO security definer) a propósito: así RLS
-- se aplica sola y un usuario no puede tocar el stock de otro tenant, aunque
-- adivine el uuid del producto.
--
--   entrada → suma abs(cantidad)
--   rotura  → resta abs(cantidad)
--   uso     → resta abs(cantidad)   (consumido en una consulta)
--   ajuste  → deja el stock en exactamente `cantidad`
-- ============================================================================

create or replace function public.ajustar_stock(
  p_producto_id uuid,
  p_tipo        text,
  p_cantidad    numeric,
  p_referencia  text default null
) returns jsonb
language plpgsql
as $$
declare
  v_tenant     text;
  v_nombre     text;
  v_controla   boolean;
  v_actual     numeric;
  v_nuevo      numeric;
  v_usuario    text;
begin
  if p_tipo not in ('entrada', 'ajuste', 'rotura', 'uso') then
    raise exception 'Tipo de movimiento inválido: %', p_tipo;
  end if;
  -- Ojo: en Postgres `numeric 'NaN' = 'NaN'` da true, así que el truco de
  -- comparar el valor consigo mismo no sirve para detectarlo.
  if p_cantidad is null or p_cantidad = 'NaN'::numeric then
    raise exception 'Cantidad inválida';
  end if;

  select tenant_id, nombre, controla_stock, stock
    into v_tenant, v_nombre, v_controla, v_actual
    from public.productos
    where id = p_producto_id
    for update;

  -- Si RLS lo filtró, para esta sesión el producto no existe. Mismo mensaje
  -- que si no existiera de verdad: no confirma la existencia de datos ajenos.
  if not found then
    raise exception 'El producto no existe';
  end if;

  if not v_controla then
    raise exception 'El producto "%" es un servicio: no lleva stock', v_nombre;
  end if;

  if p_tipo = 'ajuste' then
    v_nuevo := p_cantidad;
  elsif p_tipo = 'entrada' then
    v_nuevo := v_actual + abs(p_cantidad);
  else
    v_nuevo := v_actual - abs(p_cantidad);
  end if;

  if v_nuevo < 0 then
    raise exception 'El stock de "%" no puede quedar negativo (actual %, resultado %)',
      v_nombre, v_actual, v_nuevo;
  end if;

  update public.productos
    set stock = v_nuevo
    where id = p_producto_id;

  select coalesce(display_name, email) into v_usuario
    from public.usuarios where id = auth.uid();

  insert into public.stock_movimientos
    (tenant_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
     referencia, usuario_id, usuario_nombre)
  values
    (v_tenant, p_producto_id, p_tipo::movimiento_stock_tipo, v_nuevo - v_actual,
     v_actual, v_nuevo, nullif(trim(coalesce(p_referencia, '')), ''), auth.uid(), v_usuario);

  return jsonb_build_object(
    'producto_id',    p_producto_id,
    'stock_anterior', v_actual,
    'stock_nuevo',    v_nuevo
  );
end $$;

-- ============================================================================
-- 7. RPC: importar_productos
-- Alta/actualización masiva desde una lista de precios. En el kiosko esto era
-- una API route con service_role que hacía 2 queries por fila; acá es una sola
-- llamada por lote, dentro de una transacción y con RLS puesta.
--
-- p_filas: [{ barra, codigo, descripcion, precio, costo, rubro, subrubro,
--             stock, bulto, revisar }]
-- p_estrategia (qué hacer con el stock de los que ya existen):
--   'no_tocar'    → solo actualiza precio/nombre/rubro
--   'reemplazar'  → el stock pasa a ser el del Excel
--   'sumar'       → suma el del Excel al actual
--   'solo_nuevos' → no toca los existentes, solo da de alta los que faltan
-- ============================================================================

create or replace function public.importar_productos(
  p_tenant_id  text,
  p_filas      jsonb,
  p_estrategia text default 'no_tocar'
) returns jsonb
language plpgsql
as $$
declare
  v_fila           jsonb;
  v_barra          text;
  v_codigo         text;
  v_nombre         text;
  v_categoria      text;
  v_precio         numeric;
  v_costo          numeric;
  v_stock          numeric;
  v_bulto          integer;
  v_revisar        boolean;
  v_existente      public.productos%rowtype;
  v_stock_final    numeric;
  v_creados        integer := 0;
  v_actualizados   integer := 0;
  v_omitidos       integer := 0;
  v_con_warnings   integer := 0;
  v_errores        integer := 0;
  v_primer_error   text;
begin
  if not public.es_staff(p_tenant_id) then
    raise exception 'Sin permisos sobre la veterinaria %', p_tenant_id;
  end if;
  if p_estrategia not in ('no_tocar', 'reemplazar', 'sumar', 'solo_nuevos') then
    raise exception 'Estrategia de stock inválida: %', p_estrategia;
  end if;

  for v_fila in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb))
  loop
    v_barra   := nullif(trim(coalesce(v_fila->>'barra',  '')), '');
    v_codigo  := nullif(trim(coalesce(v_fila->>'codigo', '')), '');
    v_nombre  := nullif(trim(coalesce(v_fila->>'descripcion', '')), '');
    v_precio  := coalesce((v_fila->>'precio')::numeric, 0);
    v_costo   := nullif(v_fila->>'costo', '')::numeric;
    v_stock   := coalesce((v_fila->>'stock')::numeric, 0);
    v_bulto   := nullif(v_fila->>'bulto', '')::integer;
    v_revisar := coalesce((v_fila->>'revisar')::boolean, false);

    v_categoria := trim(concat_ws(
      ' / ',
      nullif(trim(coalesce(v_fila->>'rubro',    '')), ''),
      nullif(trim(coalesce(v_fila->>'subrubro', '')), '')
    ));

    -- Una fila sin nombre y sin ningún código no se puede identificar ni mostrar.
    if v_nombre is null and v_barra is null and v_codigo is null then
      v_omitidos := v_omitidos + 1;
      continue;
    end if;
    if v_revisar then
      v_con_warnings := v_con_warnings + 1;
    end if;

    -- Cada fila va en su propio sub-bloque: una que choque (por ejemplo, un
    -- código repetido dentro del mismo Excel) se cuenta como error y se sigue,
    -- en vez de tirar abajo el lote entero de 200.
    begin
      -- Buscar por código de barras primero, después por código interno.
      select * into v_existente from public.productos
        where tenant_id = p_tenant_id and v_barra is not null and codigo_barras = v_barra
        limit 1;
      if not found and v_codigo is not null then
        select * into v_existente from public.productos
          where tenant_id = p_tenant_id and codigo = v_codigo
          limit 1;
      end if;

      if found then
        if p_estrategia = 'solo_nuevos' then
          v_omitidos := v_omitidos + 1;
          continue;
        end if;

        v_stock_final := case p_estrategia
          when 'reemplazar' then v_stock
          when 'sumar'      then v_existente.stock + v_stock
          else                   v_existente.stock
        end;

        update public.productos set
          nombre             = coalesce(v_nombre, v_existente.nombre),
          -- Un precio en 0 en el Excel casi siempre es una celda vacía, no una
          -- decisión de regalar el producto: se conserva el precio anterior.
          precio             = case when v_precio > 0 then v_precio else v_existente.precio end,
          costo              = coalesce(v_costo, v_existente.costo),
          categoria          = coalesce(nullif(v_categoria, ''), v_existente.categoria),
          codigo             = coalesce(v_codigo, v_existente.codigo),
          codigo_barras      = coalesce(v_barra,  v_existente.codigo_barras),
          stock              = greatest(v_stock_final, 0),
          unidades_por_bulto = coalesce(v_bulto, v_existente.unidades_por_bulto),
          revisar            = v_revisar
        where id = v_existente.id;

        v_actualizados := v_actualizados + 1;
      else
        insert into public.productos
          (tenant_id, codigo, codigo_barras, nombre, categoria, precio, costo,
           stock, unidades_por_bulto, revisar)
        values
          (p_tenant_id, v_codigo, v_barra, coalesce(v_nombre, coalesce(v_barra, v_codigo)),
           v_categoria, greatest(v_precio, 0), v_costo,
           greatest(v_stock, 0), v_bulto, v_revisar);

        v_creados := v_creados + 1;
      end if;
    exception when others then
      v_errores := v_errores + 1;
      if v_primer_error is null then
        v_primer_error := coalesce(v_nombre, v_barra, v_codigo) || ': ' || sqlerrm;
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'creados',         v_creados,
    'actualizados',    v_actualizados,
    'omitidos',        v_omitidos + v_errores,
    'conAdvertencias', v_con_warnings,
    'errores',         v_errores,
    'primerError',     v_primer_error
  );
end $$;

-- ============================================================================
-- 8. ROW LEVEL SECURITY
-- Todo es interno de la veterinaria: acá no hay lectura pública como en
-- `tenants` o `turno_config`. Solo staff del tenant (y superadmin).
-- ============================================================================

alter table public.productos           enable row level security;
alter table public.stock_movimientos   enable row level security;
alter table public.producto_auditoria  enable row level security;

drop policy if exists productos_staff on public.productos;
create policy productos_staff on public.productos for all
  using (es_staff(tenant_id)) with check (es_staff(tenant_id));

-- El historial es append-only: se lee y se agrega, nunca se edita ni se borra.
drop policy if exists stock_mov_read   on public.stock_movimientos;
drop policy if exists stock_mov_insert on public.stock_movimientos;
create policy stock_mov_read   on public.stock_movimientos for select
  using (es_staff(tenant_id));
create policy stock_mov_insert on public.stock_movimientos for insert
  with check (es_staff(tenant_id));

-- La auditoría solo la escribe el trigger (security definer). El staff la lee.
drop policy if exists producto_aud_read on public.producto_auditoria;
create policy producto_aud_read on public.producto_auditoria for select
  using (es_staff(tenant_id));

-- ============================================================================
-- FIN
-- ============================================================================
