-- ============================================================================
-- 021 — Auto-sync de historia clínica al reservar turno (público)
--
-- Mismo bug que 020: `createTurno()` crea, best-effort, una entrada en
-- `historias` ("Turno programado: ...") apenas se reserva. La policy
-- `historias_staff` solo deja pasar a `es_staff(tenant_id)`, así que un
-- visitante anónimo sacando turno también rompe acá — quedaba silenciado
-- por el try/catch de createTurno(), pero seguía sin guardarse la entrada.
--
-- Misma solución: función `security definer` (ver 002_turnos_rpc.sql /
-- 020_clientes_publico.sql), pero validando que la mascota pertenezca al
-- tenant antes de insertar, para no poder colgar una historia en un tenant
-- ajeno pasando un mascota_id cualquiera.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
-- ============================================================================

create or replace function public.crear_historia_publica(
  p_tenant     text,
  p_mascota_id uuid,
  p_datos      jsonb
)
returns public.historias
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resultado public.historias;
begin
  if not exists (
    select 1 from public.mascotas
    where id = p_mascota_id and tenant_id = p_tenant
  ) then
    raise exception 'MASCOTA_NOT_FOUND';
  end if;

  insert into public.historias (
    tenant_id, mascota_id, fecha_atencion, motivo, diagnostico, tratamiento,
    observaciones, proxima_visita, archivos, tipo_visita, turno_id
  ) values (
    p_tenant,
    p_mascota_id,
    coalesce(nullif(p_datos->>'fechaAtencion', '')::date, current_date),
    coalesce(p_datos->>'motivo', 'Consulta general'),
    coalesce(p_datos->>'diagnostico', ''),
    coalesce(p_datos->>'tratamiento', '—'),
    coalesce(p_datos->>'observaciones', ''),
    nullif(p_datos->>'proximaVisita', '')::date,
    coalesce(p_datos->'archivos', '[]'::jsonb),
    coalesce((p_datos->>'tipoVisita')::tipo_visita, 'consulta'),
    nullif(p_datos->>'turnoId', '')::uuid
  )
  returning * into v_resultado;

  return v_resultado;
end $$;

grant execute on function public.crear_historia_publica(text, uuid, jsonb) to anon, authenticated;
