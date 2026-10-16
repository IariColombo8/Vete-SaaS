-- ============================================================================
-- 063 — Los recordatorios automáticos salen por email.
--
-- Se descartó la API de WhatsApp de Meta (cobra por mensaje). El cron manda
-- el recordatorio por email (Gmail de la veterinaria o Resend) y lo registra
-- con canal 'email'. 'whatsapp' queda permitido por los ya enviados así.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
-- ============================================================================

alter table public.recordatorios_vacunas drop constraint if exists recordatorios_canal_ck;
alter table public.recordatorios_vacunas
  -- email = lo mandó el cron; manual = el veterinario con wa.me; whatsapp = histórico (API de Meta)
  add constraint recordatorios_canal_ck check (canal is null or canal in ('email', 'manual', 'whatsapp'));
