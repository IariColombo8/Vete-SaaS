-- ============================================================================
-- 061 — Próximas vacunas en "Mi historia" (vista del cliente, sin sesión).
--
-- `recordatorios_vacunas` es solo de staff por RLS (tiene teléfonos). Esta RPC
-- devuelve lo mínimo para mostrarle al dueño: vacuna, tipo y fecha. Mismo
-- criterio de acceso que `obtener_historias_publico` (tenant + id de mascota).
--
--  · Una fila por vacuna, la más próxima: si quedaron dos recordatorios de la
--    misma vacuna (manual + automático), el cliente no ve la vacuna repetida.
--  · No muestra las que salen de una historia privada (035).
--  · Vencidas hace más de 60 días no se muestran.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
-- ============================================================================

create or replace function public.obtener_proximas_vacunas_publico(
  p_tenant     text,
  p_mascota_id uuid
)
returns table (vacuna text, tipo text, fecha date)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (lower(r.vacuna)) r.vacuna, r.tipo, r.fecha
    from public.recordatorios_vacunas r
    left join public.historias h on h.id = r.historia_id
   where r.tenant_id = p_tenant
     and r.mascota_id = p_mascota_id
     and r.estado in ('pendiente', 'enviado', 'fallido')
     and r.fecha >= current_date - 60
     and coalesce(h.es_privada, false) = false
   order by lower(r.vacuna), r.fecha
$$;

grant execute on function public.obtener_proximas_vacunas_publico(text, uuid) to anon, authenticated;
