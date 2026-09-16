-- ============================================================================
-- 037 — Registrar vacunas, medicamentos y desparasitación desde la Libreta.
--
-- Hasta ahora la única forma de dejar constancia de una vacuna era tildarla
-- en un turno (`turnos.vacunas`). Esto agrega 3 tipos de historia nuevos
-- ("vacuna", "medicamento", "desparasitacion") con el nombre del producto
-- aplicado (buscado en el catálogo, ej. "Triple Felina") y reusa
-- `proxima_visita` ya existente para la próxima dosis/aplicación, sin crear
-- una tabla nueva.
--
-- `ALTER TYPE ... ADD VALUE IF NOT EXISTS` es idempotente desde PG 12.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
-- ============================================================================

alter type tipo_visita add value if not exists 'vacuna';
alter type tipo_visita add value if not exists 'medicamento';
alter type tipo_visita add value if not exists 'desparasitacion';

alter table public.historias
  add column if not exists producto_aplicado text;

-- ----------------------------------------------------------------------------
-- crear_historia_publica: suma producto_aplicado al insert.
-- ----------------------------------------------------------------------------
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
    observaciones, proxima_visita, archivos, tipo_visita, turno_id, es_privada,
    producto_aplicado
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
    nullif(p_datos->>'turnoId', '')::uuid,
    coalesce((p_datos->>'esPrivada')::boolean, false),
    p_datos->>'productoAplicado'
  )
  returning * into v_resultado;

  return v_resultado;
end $$;

grant execute on function public.crear_historia_publica(text, uuid, jsonb) to anon, authenticated;
