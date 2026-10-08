-- ============================================================================
-- 045 — Firma del veterinario del tenant, como respaldo para el comprobante.
--
-- Bug real (VipVet): una orden se generó logueado con una cuenta sin ficha de
-- "Mi Firma" (la de soporte/ServiTec). El comprobante tomaba el display_name
-- de esa cuenta como "Médico Veterinario" y salía sin firma ni matrícula, en
-- vez de la del veterinario de la clínica.
--
-- Este RPC devuelve la firma de un miembro del staff del tenant que la tenga
-- completa (nombre, matrícula e imagen), prefiriendo rol `veterinario`. Igual
-- que 041: solo expone lo que va impreso en el papel.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
-- ============================================================================

create or replace function public.obtener_firma_veterinario_tenant(p_tenant_id text)
returns table (
  display_name       text,
  nombre_profesional text,
  especialidad       text,
  matricula          text,
  firma_url          text,
  sello_url          text
)
language sql
stable
security definer
set search_path = public
as $$
  select display_name, nombre_profesional, especialidad, matricula, firma_url, sello_url
  from public.usuarios
  where tenant_id = p_tenant_id
    and role in ('veterinario', 'empleado')
    and coalesce(trim(nombre_profesional), '') <> ''
    and coalesce(trim(matricula), '') <> ''
    and coalesce(firma_url, '') <> ''
  order by (role = 'veterinario') desc, created_at asc
  limit 1
$$;

grant execute on function public.obtener_firma_veterinario_tenant(text) to anon, authenticated;
