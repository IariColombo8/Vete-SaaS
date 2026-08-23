-- ============================================================================
-- 002 — Numeración de turnos + límite de plan (atómico)
--
-- Reemplaza el `runTransaction` de Firestore sobre config/contadores.
-- En Firestore el contador era un doc aparte que se podía desincronizar;
-- acá el número sale de la propia tabla, así que no hay dos fuentes de verdad.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
-- ============================================================================

-- ID de suscripción de Mercado Pago (lo escribe el webhook de billing)
alter table public.tenants add column if not exists mp_preapproval_id text;

-- Número correlativo por tenant + código legible (ex "12_Juan_Firulais")
alter table public.turnos add column if not exists numero integer;
alter table public.turnos add column if not exists codigo text;

do $$ begin
  alter table public.turnos add constraint turnos_tenant_numero_uk unique (tenant_id, numero);
exception when duplicate_object then null; end $$;

-- Nota: no hay índice sobre date_trunc('month', turno_timestamp). `date_trunc`
-- con timestamptz es STABLE (depende del TimeZone de la sesión), no IMMUTABLE,
-- así que Postgres lo rechaza en un índice. Las consultas de abajo usan un
-- rango [inicio_mes, inicio_mes + 1 mes), que es sargable y aprovecha el índice
-- `turnos_tenant_ts_idx` ya creado en schema.sql.

-- ----------------------------------------------------------------------------
-- crear_turno: numera, valida plan y estado, e inserta. Todo en una transacción.
--
-- `p_max_turnos_mes` lo manda el cliente desde `lib/plans.ts` (fuente de verdad
-- de los límites, para no duplicar el catálogo de planes en SQL).
-- null = ilimitado.
--
-- Errores: TENANT_PAUSED | PLAN_LIMIT_REACHED  (mismos strings que hoy)
-- ----------------------------------------------------------------------------
create or replace function public.crear_turno(
  p_tenant           text,
  p_max_turnos_mes   integer,
  p_datos            jsonb
)
returns table (id uuid, codigo text, numero integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status      tenant_status;
  v_count_mes   integer;
  v_numero      integer;
  v_codigo      text;
  v_id          uuid;
  v_primer_nom  text;
  v_masc_nom    text;
  v_fecha       date;
  v_hora        text;
begin
  -- Serializa la numeración de este tenant (no bloquea a otros tenants)
  perform pg_advisory_xact_lock(hashtext(p_tenant));

  select status into v_status from public.tenants where slug = p_tenant;
  if v_status is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;
  if v_status = 'pausado' then
    raise exception 'TENANT_PAUSED';
  end if;

  if p_max_turnos_mes is not null then
    -- Rango en vez de date_trunc(columna): así el planner puede usar el índice
    select count(*) into v_count_mes
    from public.turnos
    where tenant_id = p_tenant
      and turno_timestamp >= date_trunc('month', now())
      and turno_timestamp <  date_trunc('month', now()) + interval '1 month';

    if v_count_mes >= p_max_turnos_mes then
      raise exception 'PLAN_LIMIT_REACHED';
    end if;
  end if;

  select coalesce(max(t.numero), 0) + 1 into v_numero
  from public.turnos t where t.tenant_id = p_tenant;

  v_primer_nom := split_part(coalesce(nullif(p_datos->>'cliente_nombre',''), 'Cliente'), ' ', 1);
  v_masc_nom   := coalesce(nullif(p_datos->>'mascota_nombre',''), 'Mascota');
  v_codigo     := v_numero || '_' || v_primer_nom || '_' || v_masc_nom;

  v_fecha := (p_datos->>'fecha')::date;
  v_hora  := coalesce(p_datos->>'hora', '');

  insert into public.turnos (
    tenant_id, cliente_id, mascota_id,
    cliente_nombre, cliente_telefono, cliente_email, cliente_dni, cliente_domicilio,
    mascota_nombre, mascota_tipo, mascota_motivo,
    servicio, fecha, hora, turno_timestamp, duracion_min,
    profesional_id, profesional_nombre, estado, vacunas,
    numero, codigo
  ) values (
    p_tenant,
    nullif(p_datos->>'cliente_id','')::uuid,
    nullif(p_datos->>'mascota_id','')::uuid,
    coalesce(p_datos->>'cliente_nombre',''),
    coalesce(p_datos->>'cliente_telefono',''),
    coalesce(p_datos->>'cliente_email',''),
    p_datos->>'cliente_dni',
    p_datos->>'cliente_domicilio',
    coalesce(p_datos->>'mascota_nombre',''),
    coalesce(p_datos->>'mascota_tipo',''),
    p_datos->>'mascota_motivo',
    p_datos->>'servicio',
    v_fecha,
    v_hora,
    -- fecha + hora como instante, para ordenar igual que turno.timestamp
    (v_fecha::text || ' ' || coalesce(nullif(v_hora,''), '00:00'))::timestamptz,
    coalesce((p_datos->>'duracion_min')::integer, 60),
    p_datos->>'profesional_id',
    p_datos->>'profesional_nombre',
    coalesce((p_datos->>'estado')::turno_estado, 'pendiente'),
    coalesce(p_datos->'vacunas', '[]'::jsonb),
    v_numero,
    v_codigo
  )
  returning turnos.id into v_id;

  return query select v_id, v_codigo, v_numero;
end $$;

grant execute on function public.crear_turno(text, integer, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- turnos_del_mes: reemplaza getTurnosDelMes (leía config/contadores.turnosMes)
-- ----------------------------------------------------------------------------
create or replace function public.turnos_del_mes(p_tenant text)
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.turnos
  where tenant_id = p_tenant
    and turno_timestamp >= date_trunc('month', now())
    and turno_timestamp <  date_trunc('month', now()) + interval '1 month'
$$;

grant execute on function public.turnos_del_mes(text) to anon, authenticated;
