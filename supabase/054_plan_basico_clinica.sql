-- ============================================================================
-- 054 — Plan Básico = la clínica completa
--
-- El Básico tenía tope de 10 turnos/mes y 1 usuario: no alcanzaba ni para una
-- semana de una clínica chica. Pasa a turnos ilimitados y hasta 2 usuarios
-- (espejo de PLANS.basico.limits en lib/plans.ts — si cambia ahí, actualizar
-- acá también).
--
-- 1. `plan_limites` (044): básico sin tope de turnos. Sin esto `crear_turno`
--    seguiría cortando en 10 aunque el código ya no mande límite.
-- 2. Nueva columna `max_usuarios` y trigger en `invitaciones`: el tope de
--    usuarios lo valida la base, no solo el formulario de Equipo. Cuenta el
--    dueño + cada invitación (pendiente o aceptada).
--
-- Idempotente. Requiere `044_crear_turno_limite_server_side.sql`.
-- ============================================================================

alter table public.plan_limites add column if not exists max_usuarios integer; -- null = ilimitado

insert into public.plan_limites (plan, max_turnos_mes, max_usuarios) values
  ('basico', null, 2),
  ('plus',   null, null),  -- plan eliminado, la app lo trata como pro
  ('pro',    null, null)
on conflict (plan) do update
  set max_turnos_mes = excluded.max_turnos_mes,
      max_usuarios   = excluded.max_usuarios;

create or replace function public.invitaciones_limite_usuarios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max   integer;
  v_usados integer;
begin
  select pl.max_usuarios into v_max
  from public.tenants t
  join public.plan_limites pl on pl.plan = t.plan::text
  where t.slug = new.tenant_id;

  if v_max is null then
    return new;
  end if;

  -- Dos invitaciones simultáneas no pueden pasar las dos el conteo.
  perform pg_advisory_xact_lock(hashtext('invitaciones:' || new.tenant_id));

  -- createInvitacion es un upsert por (tenant_id, email) y el BEFORE INSERT
  -- corre igual cuando termina en update: reinvitar al mismo email no ocupa
  -- un lugar nuevo, así que se lo excluye del conteo.
  select count(*) + 1 into v_usados   -- + 1: el dueño
  from public.invitaciones
  where tenant_id = new.tenant_id
    and lower(email) <> lower(new.email);

  if v_usados >= v_max then
    raise exception 'PLAN_USER_LIMIT'
      using hint = 'El plan del tenant no admite más usuarios.';
  end if;

  return new;
end;
$$;

drop trigger if exists invitaciones_limite_usuarios on public.invitaciones;
create trigger invitaciones_limite_usuarios
  before insert on public.invitaciones
  for each row execute function public.invitaciones_limite_usuarios();
