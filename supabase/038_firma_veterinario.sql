-- ============================================================================
-- 038 — Firma digital del veterinario, para el comprobante/orden veterinaria.
--
-- Es del profesional, no del tenant: cada veterinario carga la suya en
-- Configuración → "Mi firma" y solo edita su propia fila (RLS
-- `usuarios_self_update`, ya existente). El sello es una imagen aparte
-- porque en la práctica es un elemento visual distinto de la firma
-- manuscrita, no la misma imagen recortada.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
-- ============================================================================

alter table public.usuarios
  add column if not exists firma_url text,
  add column if not exists sello_url text,
  add column if not exists nombre_profesional text,
  add column if not exists matricula text,
  add column if not exists especialidad text not null default 'Médico Veterinario';
