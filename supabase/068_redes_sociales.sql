-- ============================================================================
-- 068 — Redes sociales de la veterinaria (Configuración → Clínica).
--
-- `redes` guarda lo que escribió el dueño por red: { instagram, facebook }
-- (un link o "@usuario"; `lib/redes.ts` lo normaliza al mostrarlo). Es
-- información pública, como el teléfono: la lee la página de la veterinaria
-- y la edita el staff con la misma policy de `tenants`.
--
-- Idempotente.
-- ============================================================================

alter table public.tenants add column if not exists redes jsonb not null default '{}'::jsonb;

update public.tenants
   set redes = redes || '{"instagram": "https://www.instagram.com/veterinariavipvet/"}'::jsonb
 where slug = 'vipvet';
