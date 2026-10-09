-- ============================================================================
-- 048_gastos_anular.sql — Los gastos se anulan, no se borran
--
-- Igual que las ventas: si un gasto se cargó por error, se anula con un motivo
-- y la fila queda guardada para poder ver qué pasó. Un gasto anulado:
--
--   · no suma en los totales del mes ni en el esperado de la caja;
--   · libera el mes de su gasto fijo, para poder registrar el pago correcto.
--
-- Si el gasto había salido de una caja que YA SE CERRÓ, el arqueo de ese turno
-- queda como se calculó (es historia); la anulación solo afecta lo que viene.
--
-- Reemplaza `eliminar_gasto` (047) por `anular_gasto`, y redefine
-- `registrar_gasto` y `cerrar_caja` para que ignoren los anulados.
-- Requiere haber corrido antes `047_gastos.sql`.
-- ============================================================================

-- ============================================================================
-- 1. COLUMNAS DE ANULACIÓN
-- ============================================================================

alter table public.gastos add column if not exists anulado_at          timestamptz;
alter table public.gastos add column if not exists anulado_motivo      text;
alter table public.gastos add column if not exists anulado_por         uuid references auth.users(id) on delete set null;
alter table public.gastos add column if not exists anulado_por_nombre  text;

alter table public.gastos drop constraint if exists gastos_anulado_ck;
alter table public.gastos add  constraint gastos_anulado_ck check (
  (anulado_at is null and anulado_motivo is null)
  or
  (anulado_at is not null and length(trim(coalesce(anulado_motivo, ''))) > 0)
);

-- Un gasto fijo se paga una sola vez por mes, sin contar los pagos anulados.
drop index if exists public.idx_gastos_fijo_mes;
create unique index if not exists idx_gastos_fijo_mes
  on public.gastos (gasto_fijo_id, mes)
  where gasto_fijo_id is not null and anulado_at is null;

-- ============================================================================
-- 2. RPC: anular_gasto (reemplaza eliminar_gasto)
-- ============================================================================

drop function if exists public.eliminar_gasto(uuid);

create or replace function public.anular_gasto(
  p_gasto_id uuid,
  p_motivo   text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant   text;
  v_caja_id  uuid;
  v_anulado  timestamptz;
  v_usuario  text;
begin
  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Escribí el motivo de la anulación';
  end if;

  select tenant_id, caja_id, anulado_at into v_tenant, v_caja_id, v_anulado
    from public.gastos where id = p_gasto_id
    for update;

  if not found then
    raise exception 'El gasto no existe';
  end if;
  if not public.es_staff(v_tenant) then
    raise exception 'No tenés permiso sobre esta veterinaria';
  end if;
  if v_anulado is not null then
    raise exception 'El gasto ya está anulado';
  end if;

  -- Si la caja sigue abierta, se bloquea para que la anulación no se cruce
  -- con un cierre que está calculando el esperado en este momento.
  if v_caja_id is not null then
    perform 1 from public.cajas where id = v_caja_id for update;
  end if;

  select coalesce(display_name, email) into v_usuario
    from public.usuarios where id = auth.uid();

  update public.gastos set
    anulado_at         = now(),
    anulado_motivo     = trim(p_motivo),
    anulado_por        = auth.uid(),
    anulado_por_nombre = v_usuario
  where id = p_gasto_id;
end $$;

-- ============================================================================
-- 3. registrar_gasto — el chequeo de "ya pagado" ignora los anulados
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
                where gasto_fijo_id = p_gasto_fijo_id and mes = p_mes
                  and anulado_at is null) then
      raise exception 'Ese gasto fijo ya figura pagado en ese mes';
    end if;
  end if;

  if v_desc = '' then
    raise exception 'Falta la descripción del gasto';
  end if;

  if coalesce(p_descontar_caja, false) then
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
-- 4. cerrar_caja — los gastos anulados no se restan del esperado
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

  select
    coalesce(sum(total) filter (where medio_pago = 'efectivo'), 0),
    coalesce(sum(total), 0),
    count(*)
  into v_efectivo, v_total, v_cantidad
  from public.ventas
  where caja_id = p_caja_id and estado = 'completada';

  select coalesce(sum(vp.monto), 0) into v_efectivo_mixto
    from public.venta_pagos vp
    join public.ventas v on v.id = vp.venta_id
    where v.caja_id = p_caja_id and v.estado = 'completada'
      and v.medio_pago = 'mixto' and vp.medio_pago = 'efectivo';

  -- Gastos pagados con plata del cajón, sin los anulados.
  select coalesce(sum(monto), 0) into v_gastos
    from public.gastos where caja_id = p_caja_id and anulado_at is null;

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
-- FIN
-- ============================================================================
