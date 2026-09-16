-- ============================================================================
-- 040 — Combinar vacuna+medicamento+desparasitación en una sola entrada.
--
-- Antes "Agregar vacuna, medicamento o desparasitación" creaba UNA historia
-- por ítem: cargar 3 cosas en la misma consulta dejaba 3 tarjetas sueltas en
-- el historial ("Vacuna: X ... Medicamento: Y ... Desparasitación: Z...").
-- Ahora es una sola historia con tipo_visita = 'aplicacion' y el detalle de
-- cada ítem va en `aplicaciones` (jsonb), para no perder la distinción por
-- tipo que sigue haciendo falta en las tablas de vacunación/desparasitación
-- de la libreta en PDF.
--
-- Las filas viejas con tipo_visita 'vacuna'/'medicamento'/'desparasitacion'
-- (de antes de este cambio) no se migran ni se tocan: siguen mostrándose
-- como estaban. Solo lo nuevo usa 'aplicacion'.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
-- ============================================================================

alter type tipo_visita add value if not exists 'aplicacion';

alter table public.historias
  add column if not exists aplicaciones jsonb not null default '[]'::jsonb;

-- ----------------------------------------------------------------------------
-- crear_historia_publica: suma aplicaciones al insert.
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
    producto_aplicado, creado_por, aplicaciones
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
    p_datos->>'productoAplicado',
    nullif(p_datos->>'creadoPor', '')::uuid,
    coalesce(p_datos->'aplicaciones', '[]'::jsonb)
  )
  returning * into v_resultado;

  return v_resultado;
end $$;

grant execute on function public.crear_historia_publica(text, uuid, jsonb) to anon, authenticated;
