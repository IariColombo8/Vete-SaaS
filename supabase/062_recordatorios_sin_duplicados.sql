-- ============================================================================
-- 062 — Un solo recordatorio activo por mascota y vacuna.
--
-- Con la 060 quedaban duplicados en dos casos (vistos en producción):
--  · La misma vacuna aplicada dos veces (26/12/2025 y 13/01/2026): el
--    recordatorio de la primera no se cerraba porque "cumplido" solo miraba
--    si vencía dentro de los 90 días de la nueva aplicación.
--  · Un recordatorio manual (botón de la Libreta) para la misma dosis que el
--    automático, con unos días de diferencia.
--
-- Reglas nuevas en sincronizar_recordatorios_historia:
--  1. Una aplicación cierra (cumplido) los recordatorios automáticos que
--     salen de aplicaciones ANTERIORES de esa vacuna, venzan cuando venzan.
--     La regla de 90 días de la 060 queda solo para los manuales: aplicada
--     a los automáticos, una dosis vieja cerraba el recordatorio de una
--     dosis posterior (planes de cachorro). Se reparan los afectados.
--  2. Si se carga tarde una historia vieja y ya hay una aplicación más nueva
--     de esa vacuna, su recordatorio nace cumplido.
--  3. Un manual activo de la misma vacuna a ≤ 60 días de un automático se
--     cancela (el automático manda: sigue los cambios de la historia). Si el
--     manual ya se había avisado, el automático queda como avisado.
--
-- Al final re-sincroniza todas las historias con aplicaciones para limpiar
-- los duplicados existentes. Ejecutar en: Supabase → SQL Editor. Idempotente.
-- ============================================================================

-- ¿La historia aplicó esa vacuna/desparasitación? (aplicaciones o fila vieja)
create or replace function public.historia_aplica(h public.historias, p_nombre text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when h.tipo_visita::text = 'aplicacion' and jsonb_typeof(h.aplicaciones) = 'array' then exists (
      select 1 from jsonb_array_elements(h.aplicaciones) a
       where jsonb_typeof(a) = 'object'
         and a->>'tipo' in ('vacuna', 'desparasitacion')
         and lower(btrim(a->>'nombre')) = lower(btrim(p_nombre)))
    when h.tipo_visita::text in ('vacuna', 'desparasitacion') then
      lower(btrim(coalesce(h.producto_aplicado, ''))) = lower(btrim(p_nombre))
    else false
  end
$$;

create or replace function public.sincronizar_recordatorios_historia(
  h       public.historias,
  p_desde date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items          jsonb := '[]'::jsonb;
  v_cliente        uuid;
  v_mascota_nombre text;
  v_telefono       text;
begin
  -- Ítems aplicados en la historia: [{tipo, nombre, proxima}]
  if h.tipo_visita::text = 'aplicacion' and jsonb_typeof(h.aplicaciones) = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'tipo',    a->>'tipo',
             'nombre',  btrim(a->>'nombre'),
             'proxima', case when a->>'proxima' ~ '^\d{4}-\d{2}-\d{2}$' then a->>'proxima' end)), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(h.aplicaciones) a
     where jsonb_typeof(a) = 'object'
       and a->>'tipo' in ('vacuna', 'desparasitacion')
       and coalesce(btrim(a->>'nombre'), '') <> '';
  elsif h.tipo_visita::text in ('vacuna', 'desparasitacion')
        and coalesce(btrim(h.producto_aplicado), '') <> '' then
    v_items := jsonb_build_array(jsonb_build_object(
      'tipo', h.tipo_visita::text,
      'nombre', btrim(h.producto_aplicado),
      'proxima', to_char(h.proxima_visita, 'YYYY-MM-DD')));
  end if;

  -- 1. Automáticos de esta historia que ya no corresponden (se sacó el ítem o
  --    la próxima dosis). Los ya avisados quedan como registro.
  delete from public.recordatorios_vacunas r
   where r.historia_id = h.id
     and r.estado in ('pendiente', 'fallido')
     and not exists (
       select 1 from jsonb_array_elements(v_items) i
        where lower(i->>'nombre') = lower(r.vacuna) and i->>'proxima' is not null);

  -- 2. Crear / actualizar. El teléfono es una copia de respaldo: el cron usa
  --    el del cliente al momento de enviar.
  if exists (select 1 from jsonb_array_elements(v_items) i where i->>'proxima' is not null) then
    select m.cliente_id, m.nombre, c.telefono
      into v_cliente, v_mascota_nombre, v_telefono
      from public.mascotas m
      left join public.clientes c on c.id = m.cliente_id
     where m.id = h.mascota_id;

    insert into public.recordatorios_vacunas as r (
      tenant_id, cliente_id, mascota_id, historia_id, mascota_nombre, telefono,
      vacuna, tipo, fecha, origen
    )
    select distinct on (lower(i->>'nombre'))
           h.tenant_id, v_cliente, h.mascota_id, h.id,
           coalesce(v_mascota_nombre, ''), coalesce(v_telefono, ''),
           i->>'nombre', i->>'tipo', (i->>'proxima')::date, 'auto'
      from jsonb_array_elements(v_items) i
     where i->>'proxima' is not null
       and (p_desde is null or (i->>'proxima')::date >= p_desde)
     order by lower(i->>'nombre'), (i->>'proxima') desc
    on conflict (historia_id, lower(vacuna)) where historia_id is not null
    do update set
      tipo         = excluded.tipo,
      fecha        = excluded.fecha,
      estado       = case when r.fecha <> excluded.fecha then 'pendiente' else r.estado end,
      canal        = case when r.fecha <> excluded.fecha then null else r.canal end,
      enviado_at   = case when r.fecha <> excluded.fecha then null else r.enviado_at end,
      intentos     = case when r.fecha <> excluded.fecha then 0 else r.intentos end,
      ultimo_error = case when r.fecha <> excluded.fecha then null else r.ultimo_error end;
  end if;

  -- 3. Manual de la misma dosis (≤ 60 días de diferencia). Va antes del
  --    cumplido: si no, el paso siguiente cierra el manual ya avisado y el
  --    automático se mandaría de nuevo. Si ya se avisó, el
  --    automático hereda el aviso; si no, el manual se cancela.
  update public.recordatorios_vacunas a
     set estado = 'enviado', canal = m.canal, enviado_at = m.enviado_at
    from public.recordatorios_vacunas m
   where a.historia_id = h.id
     and a.estado in ('pendiente', 'fallido')
     and m.mascota_id = h.mascota_id
     and m.historia_id is null
     and m.estado = 'enviado'
     and lower(m.vacuna) = lower(a.vacuna)
     and abs(m.fecha - a.fecha) <= 60;

  update public.recordatorios_vacunas m
     set estado = 'cancelado'
    from public.recordatorios_vacunas a
   where a.historia_id = h.id
     and a.estado in ('pendiente', 'fallido', 'enviado')
     and m.mascota_id = h.mascota_id
     and m.historia_id is null
     and m.estado in ('pendiente', 'fallido')
     and lower(m.vacuna) = lower(a.vacuna)
     and abs(m.fecha - a.fecha) <= 60;

  -- 4. Aplicar la vacuna cumple los recordatorios previos de esa vacuna:
  --    · automáticos: solo los de una aplicación ANTERIOR (vengan cuando
  --      vengan). Nunca los de una más nueva: en un plan de cachorro la
  --      primera dosis no puede cerrar el recordatorio de la tercera.
  --    · manuales: los cargados antes de esta historia que vencían hasta 90
  --      días después de aplicar.
  update public.recordatorios_vacunas r
     set estado = 'cumplido'
   where r.mascota_id = h.mascota_id
     and r.tenant_id = h.tenant_id
     and (r.historia_id is null or r.historia_id <> h.id)
     and r.estado in ('pendiente', 'fallido', 'enviado')
     and lower(r.vacuna) in (select lower(i->>'nombre') from jsonb_array_elements(v_items) i)
     and (
       exists (
         select 1 from public.historias ho
          where ho.id = r.historia_id
            and (ho.fecha_atencion, ho.created_at) < (h.fecha_atencion, h.created_at))
       or (r.historia_id is null
           and r.created_at < h.created_at
           and r.fecha <= h.fecha_atencion + 90)
     );

  -- 5. Historia vieja cargada tarde: si ya hay una aplicación más nueva de la
  --    misma vacuna, el recordatorio de esta nace cumplido.
  update public.recordatorios_vacunas r
     set estado = 'cumplido'
   where r.historia_id = h.id
     and r.estado in ('pendiente', 'fallido')
     and exists (
       select 1 from public.historias hn
        where hn.mascota_id = h.mascota_id
          and hn.id <> h.id
          and (hn.fecha_atencion, hn.created_at) > (h.fecha_atencion, h.created_at)
          and public.historia_aplica(hn, r.vacuna));
end $$;

revoke all on function public.sincronizar_recordatorios_historia(public.historias, date) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Reparación: la regla de 90 días de la 060 también cerraba automáticos de
-- una dosis POSTERIOR (al editar o re-sincronizar una historia vieja). Se
-- reabren los automáticos cumplidos que no tienen una aplicación más nueva.
-- ----------------------------------------------------------------------------
update public.recordatorios_vacunas r
   set estado = 'pendiente'
 where r.origen = 'auto'
   and r.estado = 'cumplido'
   and not exists (
     select 1
       from public.historias ho
       join public.historias hn on hn.mascota_id = ho.mascota_id and hn.id <> ho.id
      where ho.id = r.historia_id
        and (hn.fecha_atencion, hn.created_at) > (ho.fecha_atencion, ho.created_at)
        and public.historia_aplica(hn, r.vacuna));

-- ----------------------------------------------------------------------------
-- Limpieza de lo existente: re-sincroniza en orden de atención. Los pasos de
-- cumplido/cancelado corren para todas; con el mismo p_desde que el backfill
-- de la 060, no se crean recordatorios de vencimientos de hace más de 30 días.
-- ----------------------------------------------------------------------------
do $$
declare
  v_h public.historias;
begin
  for v_h in
    select * from public.historias
     where tipo_visita::text in ('aplicacion', 'vacuna', 'desparasitacion')
     order by fecha_atencion, created_at
  loop
    begin
      perform public.sincronizar_recordatorios_historia(v_h, current_date - 30);
    exception when others then
      raise warning '[recordatorios] limpieza historia %: %', v_h.id, sqlerrm;
    end;
  end loop;
end $$;
