-- ============================================================================
-- 051 — Los dos planes son pagos (Básico $50.000 / Pro $80.000)
--
-- 1. Se elimina `pasar_a_basico`: existía para "seguir gratis con Básico" y
--    ya no hay plan gratis. Sin suscripción activa el panel queda en solo
--    lectura (`trial_expires_at` en el pasado) hasta contratar uno; eso lo
--    escribe el servidor en `lib/billing/aplicar-estado.ts`.
-- 2. `tenants.mp_preapproval_pendiente`: id del checkout iniciado y todavía
--    no pagado. Va aparte de `mp_preapproval_id` (la suscripción vigente) para
--    que un cambio de plan no pise la que está cobrando antes de que la nueva
--    se autorice; recién ahí se cancela la vieja.
--
-- Idempotente. Requiere `049_billing_autoservicio.sql`.
-- ============================================================================

drop function if exists public.pasar_a_basico(text);

alter table public.tenants add column if not exists mp_preapproval_pendiente text;

-- El trigger de protección tiene que cubrir la columna nueva.
create or replace function public.tenants_proteger_billing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
  then
    raise exception 'BILLING_PROTEGIDO: el plan y la suscripción se cambian desde la facturación, no a mano';
  end if;

  return new;
end $$;
