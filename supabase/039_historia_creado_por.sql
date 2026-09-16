-- ============================================================================
-- 039 — Quién cargó cada entrada de la historia clínica.
--
-- Hace falta para saber de quién es la firma/sello que va en el comprobante
-- (orden veterinaria) cuando se reimprime más adelante, no solo en el
-- momento en que se generó (ahí ya se sabe: es el usuario logueado).
-- Nullable: los flujos públicos/anónimos (auto-sync al reservar un turno)
-- no tienen un usuario de staff detrás.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
-- ============================================================================

alter table public.historias
  add column if not exists creado_por uuid references public.usuarios(id) on delete set null;

-- ----------------------------------------------------------------------------
-- crear_historia_publica: suma creado_por al insert.
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
    producto_aplicado, creado_por
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
    nullif(p_datos->>'creadoPor', '')::uuid
  )
  returning * into v_resultado;

  return v_resultado;
end $$;

grant execute on function public.crear_historia_publica(text, uuid, jsonb) to anon, authenticated;
