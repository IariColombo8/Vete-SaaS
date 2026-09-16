-- ============================================================================
-- 035 — Notas clínicas privadas.
--
-- El veterinario puede cargar una nota que solo ve el staff (por defecto,
-- al agregarla desde el panel) o marcarla visible para que el cliente la vea
-- en "Mi Historia". Default `false` (visible) para no ocultar de golpe las
-- entradas ya cargadas — el toggle de "privada" lo decide el staff nota por
-- nota, hacia adelante.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
-- ============================================================================

alter table public.historias
  add column if not exists es_privada boolean not null default false;

-- ----------------------------------------------------------------------------
-- crear_historia_publica: suma es_privada al insert.
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
    observaciones, proxima_visita, archivos, tipo_visita, turno_id, es_privada
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
    coalesce((p_datos->>'esPrivada')::boolean, false)
  )
  returning * into v_resultado;

  return v_resultado;
end $$;

grant execute on function public.crear_historia_publica(text, uuid, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- obtener_historias_publico: el cliente solo ve las que no son privadas.
-- ----------------------------------------------------------------------------
create or replace function public.obtener_historias_publico(
  p_tenant text,
  p_mascota_id uuid
)
returns setof public.historias
language sql
stable
security definer
set search_path = public
as $$
  select h.* from public.historias h
  join public.mascotas m on m.id = h.mascota_id
  where m.tenant_id = p_tenant and h.mascota_id = p_mascota_id and h.es_privada = false
  order by h.fecha_atencion desc
$$;

grant execute on function public.obtener_historias_publico(text, uuid) to anon, authenticated;
