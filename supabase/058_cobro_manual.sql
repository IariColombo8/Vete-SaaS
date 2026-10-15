-- ============================================================================
-- 058 — Veterinarias que pagan en efectivo (o transferencia) directo a VetPanel
--
-- No todas pagan con la suscripción de Mercado Pago: algunas le pagan en mano
-- al superadmin. Para esas:
--
-- 1. `tenants.cobro_manual`: la veterinaria paga por fuera de MP. Lo cambia
--    solo el superadmin (se suma a `tenants_proteger_billing`).
-- 2. `pagos_manuales`: un pago por mes (`periodo` = día 1 del mes que paga),
--    con monto, medio, fecha y nota. No se borra: se anula con motivo, y el
--    índice único solo cuenta los vigentes, así el mes se puede volver a
--    registrar.
--
-- El mes se paga del 1 al 10. Desde el 7, si no hay pago, el panel de la
-- veterinaria muestra un aviso y el cron de billing manda un email (uno por
-- mes, registrado en `billing_eventos` como `aviso_pago_manual`). Pasado el
-- 10 el panel sigue funcionando: el atraso solo se marca.
--
-- Idempotente.
-- ============================================================================

alter table public.tenants add column if not exists cobro_manual boolean not null default false;

create table if not exists public.pagos_manuales (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        text not null references public.tenants(slug) on delete cascade,
  periodo          date not null check (extract(day from periodo) = 1),
  monto            numeric(12,2) not null check (monto > 0),
  medio            text not null default 'efectivo' check (medio in ('efectivo', 'transferencia', 'otro')),
  pagado_el        date not null default ((now() at time zone 'America/Argentina/Buenos_Aires')::date),
  nota             text,
  registrado_por   uuid references public.usuarios(id) on delete set null,
  created_at       timestamptz not null default now(),
  anulado_at       timestamptz,
  anulado_por      uuid references public.usuarios(id) on delete set null,
  motivo_anulacion text,
  check ((anulado_at is null) = (motivo_anulacion is null))
);

create unique index if not exists pagos_manuales_mes_vigente
  on public.pagos_manuales(tenant_id, periodo) where anulado_at is null;
create index if not exists pagos_manuales_tenant_idx on public.pagos_manuales(tenant_id, periodo desc);

alter table public.pagos_manuales enable row level security;

-- El equipo de la veterinaria ve sus pagos (Configuración → Plan y el aviso);
-- el superadmin, todos.
drop policy if exists pagos_manuales_lectura on public.pagos_manuales;
create policy pagos_manuales_lectura on public.pagos_manuales
  for select to authenticated using (public.es_staff(tenant_id));

drop policy if exists pagos_manuales_alta on public.pagos_manuales;
create policy pagos_manuales_alta on public.pagos_manuales
  for insert to authenticated with check (public.es_superadmin());

-- Update solo para anular: el monto y el mes de un pago no se corrigen, se
-- anula y se vuelve a cargar.
drop policy if exists pagos_manuales_anulacion on public.pagos_manuales;
create policy pagos_manuales_anulacion on public.pagos_manuales
  for update to authenticated using (public.es_superadmin()) with check (public.es_superadmin());

create or replace function public.pagos_manuales_solo_anular()
returns trigger language plpgsql as $$
begin
  if old.anulado_at is not null then
    raise exception 'PAGO_YA_ANULADO';
  end if;
  if new.tenant_id <> old.tenant_id or new.periodo <> old.periodo or new.monto <> old.monto
     or new.medio <> old.medio or new.pagado_el <> old.pagado_el
     or new.registrado_por is distinct from old.registrado_por then
    raise exception 'PAGO_INMUTABLE' using hint = 'Un pago no se edita: se anula y se vuelve a registrar.';
  end if;
  return new;
end $$;

drop trigger if exists pagos_manuales_solo_anular on public.pagos_manuales;
create trigger pagos_manuales_solo_anular before update on public.pagos_manuales
  for each row execute function public.pagos_manuales_solo_anular();

-- `cobro_manual` se suma a los campos de billing protegidos.
create or replace function public.tenants_proteger_billing()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
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
     or new.mp_preapproval_pendiente is distinct from old.mp_preapproval_pendiente
     or new.mp_preapproval_status is distinct from old.mp_preapproval_status
     or new.mp_next_payment_date is distinct from old.mp_next_payment_date
     or new.mp_payer_email is distinct from old.mp_payer_email
     or new.trial_aviso_vence_at is distinct from old.trial_aviso_vence_at
     or new.trial_aviso_vencido_at is distinct from old.trial_aviso_vencido_at
     or new.cobro_manual is distinct from old.cobro_manual
  then
    raise exception 'BILLING_PROTEGIDO: el plan y la suscripción se cambian desde la facturación, no a mano';
  end if;

  return new;
end $function$;
