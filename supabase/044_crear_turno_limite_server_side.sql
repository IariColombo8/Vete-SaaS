-- ============================================================================
-- 044. `crear_turno` confiaba ciegamente en `p_max_turnos_mes`, que manda el
-- cliente desde lib/plans.ts (ver comentario original en 002_turnos_rpc.sql).
-- Cualquiera que llame la RPC directo (bypaseando el frontend) podía mandar
-- `p_max_turnos_mes = null` o un número alto y evitar el límite del plan.
--
-- Se agrega una tabla chica `plan_limites` (espejo de PLANS[].limits.maxTurnosMes
-- en lib/plans.ts — si cambia ahí, actualizar acá también) y se usa el límite
-- MÁS RESTRICTIVO entre el que manda el cliente y el que corresponde al plan
-- real del tenant en `tenants.plan`. No se toca la firma de la función: cero
-- cambios necesarios del lado del cliente, cero riesgo de romper el flujo de
-- reserva de turno que está en uso en producción ahora mismo.
-- ============================================================================

create table if not exists public.plan_limites (
  plan           text primary key,
  max_turnos_mes integer  -- null = ilimitado
);

insert into public.plan_limites (plan, max_turnos_mes) values
  ('basico', 10),
  ('plus', 150),
  ('pro', null)
on conflict (plan) do update set max_turnos_mes = excluded.max_turnos_mes;

alter table public.plan_limites enable row level security;
-- Sin policies = deny-by-default para anon/authenticated; solo la accede
-- crear_turno (security definer) y service_role.

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
  v_status        tenant_status;
  v_plan          text;
  v_plan_limite   integer;
  v_limite_efectivo integer;
  v_count_mes     integer;
  v_numero        integer;
  v_codigo        text;
  v_id            uuid;
  v_primer_nom    text;
  v_masc_nom      text;
  v_fecha         date;
  v_hora          text;
  v_limite_seteado boolean;
begin
  -- Serializa la numeración de este tenant (no bloquea a otros tenants)
  perform pg_advisory_xact_lock(hashtext(p_tenant));

  select status, plan into v_status, v_plan from public.tenants where slug = p_tenant;
  if v_status is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;
  if v_status = 'pausado' then
    raise exception 'TENANT_PAUSED';
  end if;

  select max_turnos_mes, true into v_plan_limite, v_limite_seteado
  from public.plan_limites where plan = v_plan;

  -- Si el plan no está en la tabla (no debería pasar), no agrega restricción
  -- server-side extra y queda solo lo que mande el cliente — fail-open acotado
  -- a un caso que no ocurre con los 3 planes actuales.
  if v_limite_seteado is null then
    v_limite_efectivo := p_max_turnos_mes;
  elsif v_plan_limite is null then
    v_limite_efectivo := p_max_turnos_mes;
  elsif p_max_turnos_mes is null then
    v_limite_efectivo := v_plan_limite;
  else
    v_limite_efectivo := least(p_max_turnos_mes, v_plan_limite);
  end if;

  if v_limite_efectivo is not null then
    -- Rango en vez de date_trunc(columna): así el planner puede usar el índice
    select count(*) into v_count_mes
    from public.turnos
    where tenant_id = p_tenant
      and turno_timestamp >= date_trunc('month', now())
      and turno_timestamp <  date_trunc('month', now()) + interval '1 month';

    if v_count_mes >= v_limite_efectivo then
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
