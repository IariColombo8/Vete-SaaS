-- ============================================================================
-- 060 — Recordatorios de vacunas automáticos.
--
-- Antes el recordatorio se cargaba a mano con el botón de la Libreta, aparte
-- de la "próxima dosis" que el veterinario ya completa al cargar la vacuna en
-- la historia: doble carga, y en la práctica no se hacía. Ahora un trigger en
-- `historias` crea/actualiza el recordatorio a partir de esa próxima dosis
-- (mismo criterio que la auditoría de precios: que no dependa de acordarse).
--
--  · Vacunas y desparasitaciones, de `aplicaciones` (040) y de las filas
--    viejas con tipo_visita 'vacuna'/'desparasitacion' (037).
--  · Corregir la fecha en la historia re-arma el recordatorio.
--  · Aplicar la vacuna de nuevo marca 'cumplido' el recordatorio previo de esa
--    vacuna para esa mascota: no se le escribe al dueño por algo que ya hizo.
--  · `enviado` (boolean) pasa a `estado`. `enviado` se sigue manteniendo por
--    trigger para que el cron viejo funcione entre esta migración y el deploy.
--
-- Si algo del trigger falla, la historia se guarda igual (solo se loguea un
-- warning): perder un recordatorio es mucho menos grave que no poder cargar la
-- historia clínica.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Idempotente.
-- ============================================================================

alter table public.recordatorios_vacunas
  add column if not exists historia_id  uuid references public.historias(id) on delete cascade,
  add column if not exists tipo         text not null default 'vacuna',
  add column if not exists origen       text not null default 'manual',
  add column if not exists estado       text not null default 'pendiente',
  add column if not exists canal        text,
  add column if not exists enviado_at   timestamptz,
  add column if not exists intentos     integer not null default 0,
  add column if not exists ultimo_error text,
  add column if not exists updated_at   timestamptz not null default now();

do $$ begin
  alter table public.recordatorios_vacunas
    add constraint recordatorios_tipo_ck   check (tipo in ('vacuna', 'desparasitacion'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.recordatorios_vacunas
    add constraint recordatorios_origen_ck check (origen in ('auto', 'manual'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.recordatorios_vacunas
    add constraint recordatorios_estado_ck check (estado in ('pendiente', 'enviado', 'fallido', 'cumplido', 'cancelado'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.recordatorios_vacunas
    -- whatsapp = lo mandó el cron por la API de Meta; manual = el veterinario con wa.me
    add constraint recordatorios_canal_ck  check (canal is null or canal in ('whatsapp', 'manual'));
exception when duplicate_object then null; end $$;

-- Los que ya se habían mandado.
update public.recordatorios_vacunas
   set estado = 'enviado', canal = coalesce(canal, 'whatsapp')
 where enviado and estado = 'pendiente';

-- Un recordatorio automático por ítem de la historia (upsert del trigger).
create unique index if not exists recordatorios_historia_item_uk
  on public.recordatorios_vacunas(historia_id, lower(vacuna))
  where historia_id is not null;

-- Cron y tarjeta del Dashboard: lo que todavía hay que avisar.
create index if not exists recordatorios_por_avisar_idx
  on public.recordatorios_vacunas(tenant_id, fecha)
  where estado in ('pendiente', 'fallido');

-- "Cumplido": buscar los de la misma vacuna para la mascota.
create index if not exists recordatorios_mascota_vacuna_idx
  on public.recordatorios_vacunas(mascota_id, lower(vacuna));

-- ----------------------------------------------------------------------------
-- estado ↔ enviado, y updated_at.
-- ----------------------------------------------------------------------------
create or replace function public.recordatorios_sincronizar_enviado()
returns trigger language plpgsql as $$
begin
  -- Código viejo que solo conoce `enviado` (cron anterior a este deploy).
  if tg_op = 'UPDATE' and new.enviado is distinct from old.enviado and new.estado = old.estado then
    new.estado := case when new.enviado then 'enviado' else 'pendiente' end;
    if new.enviado then
      new.canal := coalesce(new.canal, 'whatsapp');
      new.enviado_at := coalesce(new.enviado_at, now());
    end if;
  end if;
  -- El cron viejo filtra `enviado = false`: solo tiene que ver lo que falta avisar.
  new.enviado := new.estado not in ('pendiente', 'fallido');
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists recordatorios_enviado on public.recordatorios_vacunas;
create trigger recordatorios_enviado
  before insert or update on public.recordatorios_vacunas
  for each row execute function public.recordatorios_sincronizar_enviado();

-- ----------------------------------------------------------------------------
-- Núcleo: recordatorios a partir de una historia.
-- `p_desde`: solo crea los de próxima dosis >= esa fecha (para el backfill).
-- ----------------------------------------------------------------------------
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
       -- Ya lo había cargado a mano con el botón: no duplicar.
       and not exists (
         select 1 from public.recordatorios_vacunas m
          where m.mascota_id = h.mascota_id and m.historia_id is null
            and lower(m.vacuna) = lower(i->>'nombre')
            and m.fecha = (i->>'proxima')::date)
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

  -- 3. Aplicar la vacuna cumple los recordatorios previos de esa vacuna. El
  --    tope de 90 días evita que una aplicación vieja cargada tarde cierre el
  --    recordatorio del refuerzo siguiente.
  update public.recordatorios_vacunas r
     set estado = 'cumplido'
   where r.mascota_id = h.mascota_id
     and r.tenant_id = h.tenant_id
     and (r.historia_id is null or r.historia_id <> h.id)
     and r.estado in ('pendiente', 'fallido', 'enviado')
     and r.fecha <= h.fecha_atencion + 90
     and lower(r.vacuna) in (select lower(i->>'nombre') from jsonb_array_elements(v_items) i);
end $$;

revoke all on function public.sincronizar_recordatorios_historia(public.historias, date) from public, anon, authenticated;

create or replace function public.historias_recordatorios_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.sincronizar_recordatorios_historia(new);
  exception when others then
    raise warning '[recordatorios] historia %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists historias_recordatorios on public.historias;
create trigger historias_recordatorios
  after insert or update of aplicaciones, proxima_visita, producto_aplicado, tipo_visita, fecha_atencion, mascota_id
  on public.historias
  for each row execute function public.historias_recordatorios_trigger();

-- ----------------------------------------------------------------------------
-- Backfill: vacunas ya cargadas con próxima dosis desde hace 30 días en
-- adelante. En orden de atención, para que "cumplido" se resuelva bien.
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
      raise warning '[recordatorios] backfill historia %: %', v_h.id, sqlerrm;
    end;
  end loop;
end $$;
