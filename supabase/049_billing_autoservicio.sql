-- ============================================================================
-- 049 — Suscripción autoservicio (Mercado Pago) y protección del plan
--
-- 1. Las columnas de billing de `tenants` (plan, status, trial_expires_at,
--    mp_*) quedan fuera del alcance del cliente: la policy `tenants_write`
--    deja que cualquier staff actualice la fila, así que hasta ahora un
--    empleado podía ponerse `plan = 'pro'` desde la consola del navegador.
--    Un trigger rechaza esos cambios salvo que vengan del service_role
--    (webhook/cron, `auth.uid()` es null) o de un superadmin (panel global).
-- 2. `pasar_a_basico(p_tenant)`: el dueño elige seguir gratis cuando termina
--    el trial (o da de baja Pro). Única vía legítima desde el cliente para
--    tocar el plan.
-- 3. `billing_eventos`: bitácora de lo que llega del webhook y de lo que hace
--    el cron, para no depurar a ciegas cuando un pago no impacta.
-- 4. Columnas nuevas en `tenants` para el estado de la suscripción y los
--    avisos de trial, así el panel no tiene que pegarle a Mercado Pago para
--    mostrar "próximo cobro".
--
-- Idempotente. Requiere `schema.sql`, `002_turnos_rpc.sql` y `011_trial_demo.sql`.
-- ============================================================================

alter table public.tenants add column if not exists mp_preapproval_status text;
alter table public.tenants add column if not exists mp_next_payment_date timestamptz;
alter table public.tenants add column if not exists mp_payer_email text;
alter table public.tenants add column if not exists trial_aviso_vence_at timestamptz;
alter table public.tenants add column if not exists trial_aviso_vencido_at timestamptz;

-- ----------------------------------------------------------------------------
-- 1. Trigger: columnas de billing solo las cambia el servidor o un superadmin
-- ----------------------------------------------------------------------------
create or replace function public.tenants_proteger_billing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role (webhook, cron, API routes con secret key): sin usuario.
  if auth.uid() is null then
    return new;
  end if;
  if public.es_superadmin() then
    return new;
  end if;

  if new.plan is distinct from old.plan
     or new.status is distinct from old.status
     or new.trial_expires_at is distinct from old.trial_expires_at
     or new.mp_preapproval_id is distinct from old.mp_preapproval_id
     or new.mp_preapproval_status is distinct from old.mp_preapproval_status
     or new.mp_next_payment_date is distinct from old.mp_next_payment_date
     or new.mp_payer_email is distinct from old.mp_payer_email
     or new.trial_aviso_vence_at is distinct from old.trial_aviso_vence_at
     or new.trial_aviso_vencido_at is distinct from old.trial_aviso_vencido_at
  then
    raise exception 'BILLING_PROTEGIDO: el plan y la suscripción se cambian desde la facturación, no a mano';
  end if;

  return new;
end $$;

drop trigger if exists trg_tenants_proteger_billing on public.tenants;
create trigger trg_tenants_proteger_billing
  before update on public.tenants
  for each row execute function public.tenants_proteger_billing();

-- ----------------------------------------------------------------------------
-- 2. billing_eventos
-- ----------------------------------------------------------------------------
create table if not exists public.billing_eventos (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      text references public.tenants(slug) on delete set null,
  origen         text not null,           -- 'webhook' | 'checkout' | 'cron' | 'panel'
  tipo           text not null,           -- 'authorized' | 'cancelled' | 'paused' | 'pending' | ...
  preapproval_id text,
  detalle        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists billing_eventos_tenant_idx on public.billing_eventos (tenant_id, created_at desc);

alter table public.billing_eventos enable row level security;

-- Solo lectura para el dueño; se escribe desde el servidor (service_role) o
-- desde `pasar_a_basico` (security definer).
drop policy if exists billing_eventos_read on public.billing_eventos;
create policy billing_eventos_read on public.billing_eventos
  for select using (
    public.es_superadmin()
    or exists (
      select 1 from public.usuarios u
      where u.id = auth.uid() and u.role = 'veterinario' and u.tenant_id = billing_eventos.tenant_id
    )
  );

-- ----------------------------------------------------------------------------
-- 3. pasar_a_basico: el dueño sigue gratis (fin de trial o baja voluntaria)
-- ----------------------------------------------------------------------------
create or replace function public.pasar_a_basico(p_tenant text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_tenant text;
  v_preapproval text;
begin
  if v_uid is null then
    raise exception 'NO_AUTENTICADO';
  end if;

  select role, tenant_id into v_role, v_tenant from public.usuarios where id = v_uid;
  if v_role is distinct from 'superadmin'
     and not (v_role = 'veterinario' and v_tenant = p_tenant) then
    raise exception 'SIN_PERMISO: solo el dueño de la veterinaria puede cambiar el plan';
  end if;

  select mp_preapproval_id into v_preapproval from public.tenants where slug = p_tenant;
  if v_preapproval is not null and coalesce(
       (select mp_preapproval_status from public.tenants where slug = p_tenant), ''
     ) = 'authorized' then
    -- Con una suscripción cobrando, la baja va por /api/billing/cancelar, que
    -- primero la cancela en Mercado Pago. Si no, seguiría cobrando por un
    -- plan que ya no tiene.
    raise exception 'SUSCRIPCION_ACTIVA: cancelá la suscripción antes de pasar a Básico';
  end if;

  update public.tenants
     set plan = 'basico',
         trial_expires_at = null
   where slug = p_tenant;

  insert into public.billing_eventos (tenant_id, origen, tipo, detalle)
  values (p_tenant, 'panel', 'pasar_a_basico', jsonb_build_object('usuario', v_uid));
end $$;

grant execute on function public.pasar_a_basico(text) to authenticated;
