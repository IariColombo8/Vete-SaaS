-- ============================================================================
-- 047_gastos.sql — Gastos del negocio (fijos mensuales y por única vez)
--
--   · `gastos_fijos`        — la "plantilla" de un gasto que se repite todos
--                             los meses (alquiler, luz, sueldo, internet).
--   · `gastos_fijos_montos` — el monto de un gasto fijo para UN mes puntual,
--                             cuando ese mes no es el de siempre ("la luz de
--                             octubre vino $48.000"). Sin fila, vale el monto
--                             base de la plantilla.
--   · `gastos`              — lo que efectivamente se pagó. Un gasto por única
--                             vez es directamente una fila acá; un gasto fijo
--                             genera una fila por mes cuando se marca pagado.
--
-- Tres decisiones:
--
-- 1. Pagar congela el monto. La fila de `gastos` guarda cuánto se pagó, así que
--    cambiar después el monto base de la plantilla no reescribe los meses que
--    ya se pagaron.
--
-- 2. "Descontarlo de la caja" es una pregunta al registrar: si la respuesta es
--    sí, el gasto se imputa a la caja abierta (`caja_id`) y `cerrar_caja` lo
--    resta del efectivo esperado. Se registra por RPC (`registrar_gasto`) para
--    que el `caja_id` lo asigne la base, con la caja bloqueada: desde el
--    cliente no se puede colgar un gasto de una caja ya cerrada.
--
-- 3. Un gasto fijo se paga una sola vez por mes (índice único parcial).
--
-- Requiere haber corrido antes `005_ventas.sql` y `014d_integracion_mixto_ctacte.sql`.
-- ============================================================================

-- ============================================================================
-- 1. GASTOS FIJOS (plantilla mensual)
-- ============================================================================

create table if not exists public.gastos_fijos (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        text not null references public.tenants(slug) on delete cascade,

  descripcion      text not null,
  categoria        text not null default '',
  monto            numeric(12,2) not null,      -- monto base, el de todos los meses
  dia_vencimiento  smallint,                    -- opcional, solo informativo

  -- Primer mes en que corre y, si se dio de baja, último mes (inclusive).
  -- Siempre el día 1 del mes.
  desde_mes        date not null,
  hasta_mes        date,

  created_at       timestamptz not null default now(),

  constraint gastos_fijos_monto_ck  check (monto > 0),
  constraint gastos_fijos_dia_ck    check (dia_vencimiento is null or dia_vencimiento between 1 and 31),
  constraint gastos_fijos_desde_ck  check (extract(day from desde_mes) = 1),
  constraint gastos_fijos_hasta_ck  check (hasta_mes is null or (extract(day from hasta_mes) = 1 and hasta_mes >= desde_mes)),
  constraint gastos_fijos_desc_ck   check (length(trim(descripcion)) > 0)
);

create index if not exists idx_gastos_fijos_tenant
  on public.gastos_fijos (tenant_id, desde_mes);

-- ============================================================================
-- 2. MONTO DE UN GASTO FIJO PARA UN MES PUNTUAL
-- ============================================================================

create table if not exists public.gastos_fijos_montos (
  gasto_fijo_id  uuid not null references public.gastos_fijos(id) on delete cascade,
  tenant_id      text not null references public.tenants(slug) on delete cascade,
  mes            date not null,
  monto          numeric(12,2) not null,

  primary key (gasto_fijo_id, mes),
  constraint gastos_fijos_montos_monto_ck check (monto > 0),
  constraint gastos_fijos_montos_mes_ck   check (extract(day from mes) = 1)
);

create index if not exists idx_gastos_fijos_montos_tenant
  on public.gastos_fijos_montos (tenant_id, mes);

-- ============================================================================
-- 3. GASTOS (lo efectivamente pagado)
-- ============================================================================

create table if not exists public.gastos (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              text not null references public.tenants(slug) on delete cascade,

  descripcion            text not null,
  categoria              text not null default '',
  monto                  numeric(12,2) not null,
  fecha                  date not null default current_date,

  -- Si viene de un gasto fijo: de cuál y a qué mes corresponde. Si se borra la
  -- plantilla, el pago histórico queda (con su descripción congelada).
  gasto_fijo_id          uuid references public.gastos_fijos(id) on delete set null,
  mes                    date,

  -- Caja de la que salió la plata. Null = se pagó por otro lado.
  caja_id                uuid references public.cajas(id) on delete set null,

  registrado_por         uuid references auth.users(id) on delete set null,
  registrado_por_nombre  text,
  observaciones          text not null default '',
  created_at             timestamptz not null default now(),

  constraint gastos_monto_ck check (monto > 0),
  constraint gastos_mes_ck   check (mes is null or extract(day from mes) = 1),
  constraint gastos_desc_ck  check (length(trim(descripcion)) > 0)
);

create index if not exists idx_gastos_fecha
  on public.gastos (tenant_id, fecha desc);

create index if not exists idx_gastos_caja
  on public.gastos (caja_id) where caja_id is not null;

-- Un gasto fijo se paga una sola vez por mes.
create unique index if not exists idx_gastos_fijo_mes
  on public.gastos (gasto_fijo_id, mes) where gasto_fijo_id is not null;

-- ============================================================================
-- 4. CAJAS: total de gastos pagados con plata del cajón
-- ============================================================================

alter table public.cajas add column if not exists total_gastos numeric(12,2) not null default 0;

-- ============================================================================
-- 5. RPC: registrar_gasto
-- ============================================================================

create or replace function public.registrar_gasto(
  p_tenant_id       text,
  p_descripcion     text,
  p_categoria       text,
  p_monto           numeric,
  p_fecha           date,
  p_descontar_caja  boolean,
  p_gasto_fijo_id   uuid default null,
  p_mes             date default null,
  p_observaciones   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario  text;
  v_caja_id  uuid;
  v_id       uuid;
  v_desc     text;
  v_cat      text;
begin
  if not public.es_staff(p_tenant_id) then
    raise exception 'No tenés permiso sobre esta veterinaria';
  end if;

  if p_monto is null or p_monto = 'NaN'::numeric or p_monto <= 0 then
    raise exception 'El monto del gasto no es válido';
  end if;

  v_desc := trim(coalesce(p_descripcion, ''));
  v_cat  := trim(coalesce(p_categoria, ''));

  if p_gasto_fijo_id is not null then
    if p_mes is null or extract(day from p_mes) <> 1 then
      raise exception 'Falta indicar a qué mes corresponde el pago';
    end if;

    select case when v_desc = '' then descripcion else v_desc end,
           case when v_cat  = '' then categoria   else v_cat  end
      into v_desc, v_cat
      from public.gastos_fijos
     where id = p_gasto_fijo_id and tenant_id = p_tenant_id;

    if not found then
      raise exception 'El gasto fijo no existe';
    end if;

    if exists (select 1 from public.gastos
                where gasto_fijo_id = p_gasto_fijo_id and mes = p_mes) then
      raise exception 'Ese gasto fijo ya figura pagado en ese mes';
    end if;
  end if;

  if v_desc = '' then
    raise exception 'Falta la descripción del gasto';
  end if;

  if coalesce(p_descontar_caja, false) then
    -- Bloquea la caja: si alguien la está cerrando en este momento, el gasto
    -- espera y después falla con "no hay caja abierta" en vez de colarse en un
    -- arqueo que ya se calculó.
    select id into v_caja_id
      from public.cajas
     where tenant_id = p_tenant_id and estado = 'abierta'
     for update;

    if not found then
      raise exception 'No hay ninguna caja abierta para descontar el gasto';
    end if;
  end if;

  select coalesce(display_name, email) into v_usuario
    from public.usuarios where id = auth.uid();

  insert into public.gastos
    (tenant_id, descripcion, categoria, monto, fecha, gasto_fijo_id, mes,
     caja_id, registrado_por, registrado_por_nombre, observaciones)
  values
    (p_tenant_id, v_desc, v_cat, p_monto, coalesce(p_fecha, current_date),
     p_gasto_fijo_id, case when p_gasto_fijo_id is null then null else p_mes end,
     v_caja_id, auth.uid(), v_usuario, trim(coalesce(p_observaciones, '')))
  returning id into v_id;

  return jsonb_build_object('gasto_id', v_id, 'caja_id', v_caja_id);
end $$;

-- ============================================================================
-- 6. RPC: eliminar_gasto
--
-- Un gasto imputado a una caja ya cerrada no se borra: el arqueo de ese turno
-- quedó calculado con él adentro y borrarlo dejaría un cierre que no cuadra.
-- ============================================================================

create or replace function public.eliminar_gasto(p_gasto_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant  text;
  v_caja_id uuid;
begin
  select tenant_id, caja_id into v_tenant, v_caja_id
    from public.gastos where id = p_gasto_id;

  if not found then
    raise exception 'El gasto no existe';
  end if;
  if not public.es_staff(v_tenant) then
    raise exception 'No tenés permiso sobre esta veterinaria';
  end if;

  if v_caja_id is not null then
    perform 1 from public.cajas where id = v_caja_id and estado = 'abierta' for update;
    if not found then
      raise exception 'Ese gasto se descontó de una caja que ya se cerró: no se puede borrar';
    end if;
  end if;

  delete from public.gastos where id = p_gasto_id;
end $$;

-- ============================================================================
-- 7. cerrar_caja — resta del esperado los gastos pagados con la caja
--
-- Mismo cuerpo que en 014d_integracion_mixto_ctacte.sql, más `v_gastos`.
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
  v_gastos         numeric;
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

  -- La pata en efectivo de los pagos "mixto" del turno.
  select coalesce(sum(vp.monto), 0) into v_efectivo_mixto
    from public.venta_pagos vp
    join public.ventas v on v.id = vp.venta_id
    where v.caja_id = p_caja_id and v.estado = 'completada'
      and v.medio_pago = 'mixto' and vp.medio_pago = 'efectivo';

  -- Gastos pagados con plata del cajón durante el turno.
  select coalesce(sum(monto), 0) into v_gastos
    from public.gastos where caja_id = p_caja_id;

  v_efectivo := v_efectivo + v_efectivo_mixto;
  v_otros    := greatest(v_total - v_efectivo, 0);
  v_esperado := v_inicial + v_efectivo - v_gastos;

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
    total_gastos       = v_gastos,
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
    'cantidad_ventas', v_cantidad,
    'total_gastos',    v_gastos
  );
end $$;

-- ============================================================================
-- 8. ROW LEVEL SECURITY
--
-- Las plantillas y los montos por mes los edita el staff directo. Los pagos
-- (`gastos`) son de lectura: se insertan y se borran por RPC, para que el
-- vínculo con la caja no se pueda tocar a mano.
-- ============================================================================

alter table public.gastos_fijos        enable row level security;
alter table public.gastos_fijos_montos enable row level security;
alter table public.gastos              enable row level security;

drop policy if exists gastos_fijos_staff on public.gastos_fijos;
create policy gastos_fijos_staff on public.gastos_fijos for all
  using (es_staff(tenant_id))
  with check (es_staff(tenant_id));

drop policy if exists gastos_fijos_montos_staff on public.gastos_fijos_montos;
create policy gastos_fijos_montos_staff on public.gastos_fijos_montos for all
  using (es_staff(tenant_id))
  with check (
    es_staff(tenant_id)
    -- El monto puntual tiene que colgar de una plantilla del mismo tenant.
    and exists (select 1 from public.gastos_fijos g
                 where g.id = gasto_fijo_id and g.tenant_id = gastos_fijos_montos.tenant_id)
  );

drop policy if exists gastos_read on public.gastos;
create policy gastos_read on public.gastos for select
  using (es_staff(tenant_id));

-- ============================================================================
-- FIN
-- ============================================================================
