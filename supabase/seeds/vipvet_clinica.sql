-- ============================================================================
-- Seed clínico — VipVet: config, clientes, mascotas, turnos e historial
--
-- Llena todo lo que no es mostrador, para poder recorrer el panel con datos
-- en vez de pantallas vacías:
--
--   · config del tenant: horarios, servicios de la página, modalidad
--   · turno_config: tipos de mascota, servicios con duración, vacunas por
--     especie y 2 profesionales con agenda propia
--   · 12 clientes (incluidos los 4 que ya creaba el seed de ventas)
--   · 21 mascotas con su token de libreta y su historia clínica creada
--   · ~150 turnos repartidos en 12 meses hacia atrás y 3 semanas hacia
--     adelante, con todos los estados: pendiente, confirmado, completado y
--     cancelado
--   · ~90 historias clínicas, algunas atadas al turno que las originó
--   · días bloqueados (feriados y una licencia)
--   · recordatorios de vacuna pendientes y ya enviados
--   · 3 libretas públicas listas para abrir por QR
--
-- Ejecutar DESPUÉS de `schema.sql` y `seeds/vipvet_productos.sql` (de ahí sale
-- el tenant), en: Supabase Dashboard → SQL Editor → New query
--
-- ⚠ Escribe las tablas directo, no pasa por la RPC `crear_turno`: esa valida
--   `es_staff()` contra `auth.uid()`, que en el SQL Editor es null. Como
--   consecuencia tampoco corre el chequeo de límite de turnos del plan — es a
--   propósito, son datos de prueba.
--
-- Idempotente FILA POR FILA, y respeta lo que hayas cargado a mano: las
-- mascotas van con `on conflict do nothing` sobre (cliente_id, slug) y los
-- turnos e historias solo se generan para la mascota que todavía no tiene
-- ningún turno. Volver a correrlo no duplica nada.
--
-- (La versión anterior tenía un guard global "si ya hay mascotas, no hago
--  nada". Una sola mascota cargada probando la app alcanzaba para que el seed
--  entero saliera sin escribir una fila, y el `raise notice` que lo avisaba no
--  se ve en el SQL Editor. Por eso parecía que no hacía nada.)
-- ============================================================================

-- ============================================================================
-- 1. CONFIG DE LA VETERINARIA
-- ============================================================================

update public.tenants set
  nombre                 = coalesce(nombre, 'VipVet'),
  telefono               = coalesce(telefono, '3442556677'),
  email                  = coalesce(email, 'contacto@vipvet.com.ar'),
  direccion              = coalesce(direccion, 'Av. Rocamora 1230'),
  ciudad                 = coalesce(ciudad, 'Concepción del Uruguay'),
  descripcion            = coalesce(descripcion,
    'Clínica veterinaria con atención general, vacunación, cirugía y ' ||
    'peluquería. Además, todo para tu mascota en el mismo lugar.'),
  modalidad              = 'ambos',
  min_horas_anticipacion = 2,
  onboarding_completado  = true,
  horarios = case when horarios = '[]'::jsonb then '[
    {"dia": "Lunes a Viernes", "apertura": "09:00", "cierre": "19:00", "cerrado": false,
     "corrido": false, "cierre1": "13:00", "apertura2": "16:00"},
    {"dia": "Sabado",  "apertura": "09:00", "cierre": "13:00", "cerrado": false, "corrido": true},
    {"dia": "Domingo", "apertura": "",      "cierre": "",      "cerrado": true}
  ]'::jsonb else horarios end,
  servicios = case when servicios = '[]'::jsonb then '[
    {"emoji": "🩺", "nombre": "Consulta general",  "descripcion": "Revisión clínica completa de tu mascota"},
    {"emoji": "💉", "nombre": "Vacunación",        "descripcion": "Plan de vacunas al día, perros y gatos"},
    {"emoji": "🏥", "nombre": "Cirugía",           "descripcion": "Castraciones y procedimientos quirúrgicos"},
    {"emoji": "🛁", "nombre": "Peluquería y baño", "descripcion": "Baño, corte y estética"},
    {"emoji": "🚨", "nombre": "Urgencias",         "descripcion": "Atención prioritaria"},
    {"emoji": "🏠", "nombre": "Atención a domicilio", "descripcion": "Vamos a tu casa dentro de la ciudad"}
  ]'::jsonb else servicios end
where slug = 'vipvet';

-- El selector de turnos del sitio público sale de acá. `duracionMin` define
-- cuántos slots ocupa cada servicio: la cirugía bloquea 2 horas, la consulta
-- media hora.
insert into public.turno_config (tenant_id, mascotas, servicios, vacunas, profesionales)
values (
  'vipvet',
  '[
    {"id": "perro",   "emoji": "🐶", "nombre": "Perro"},
    {"id": "gato",    "emoji": "🐱", "nombre": "Gato"},
    {"id": "conejo",  "emoji": "🐰", "nombre": "Conejo"},
    {"id": "ave",     "emoji": "🦜", "nombre": "Ave"}
  ]'::jsonb,
  '[
    {"id": "consulta-general", "emoji": "🩺", "nombre": "Consulta general",  "descripcion": "Examen clínico",             "duracionMin": 30},
    {"id": "vacunacion",       "emoji": "💉", "nombre": "Vacunación",        "descripcion": "Aplicación de vacunas",      "duracionMin": 30},
    {"id": "control",          "emoji": "📋", "nombre": "Control",           "descripcion": "Seguimiento de tratamiento", "duracionMin": 30},
    {"id": "cirugia",          "emoji": "🏥", "nombre": "Cirugía",           "descripcion": "Procedimiento quirúrgico",   "duracionMin": 120},
    {"id": "peluqueria",       "emoji": "🛁", "nombre": "Peluquería y baño", "descripcion": "Baño, corte y estética",     "duracionMin": 60},
    {"id": "urgencia",         "emoji": "🚨", "nombre": "Urgencia",          "descripcion": "Atención prioritaria",       "duracionMin": 60},
    {"id": "domicilio",        "emoji": "🏠", "nombre": "Visita a domicilio","descripcion": "Atención en tu casa",        "duracionMin": 60}
  ]'::jsonb,
  '{
    "perro": [
      {"id": "quintuple",  "nombre": "Quíntuple",            "descripcion": "Moquillo, parvovirus, hepatitis, parainfluenza y leptospirosis"},
      {"id": "sextuple",   "nombre": "Séxtuple",             "descripcion": "Quíntuple + leptospirosis ampliada"},
      {"id": "antirrabica","nombre": "Antirrábica",          "descripcion": "Obligatoria, refuerzo anual"},
      {"id": "tos",        "nombre": "Tos de las perreras",  "descripcion": "Bordetella, recomendada si va a guardería"},
      {"id": "giardia",    "nombre": "Giardia",              "descripcion": "Opcional, según zona"}
    ],
    "gato": [
      {"id": "triple-felina", "nombre": "Triple felina",     "descripcion": "Rinotraqueítis, calicivirus y panleucopenia"},
      {"id": "antirrabica",   "nombre": "Antirrábica",       "descripcion": "Obligatoria, refuerzo anual"},
      {"id": "leucemia",      "nombre": "Leucemia felina",   "descripcion": "Recomendada si sale a la calle"}
    ],
    "conejo": [
      {"id": "mixomatosis", "nombre": "Mixomatosis",         "descripcion": "Refuerzo semestral"}
    ]
  }'::jsonb,
  '[
    {"id": "prof-priscila", "nombre": "Dra. Priscila Ramírez", "activo": true},
    {"id": "prof-martin",   "nombre": "Dr. Martín Alcaraz",    "activo": true}
  ]'::jsonb
)
on conflict (tenant_id) do update set
  mascotas      = excluded.mascotas,
  servicios     = excluded.servicios,
  vacunas       = excluded.vacunas,
  profesionales = excluded.profesionales;

-- ============================================================================
-- 2. CLIENTES
--
-- Los 4 primeros son los mismos que crea `vipvet_ventas.sql` (mismo DNI), así
-- que si ya corriste ese seed las ventas y los turnos caen sobre el mismo
-- cliente y se puede ver su ficha completa.
-- ============================================================================

insert into public.clientes (tenant_id, nombre, telefono, email, dni, domicilio, historial_datos)
values
  ('vipvet','Juan Pérez',        '3442556677','juanperez@gmail.com',       '28455112','Rocamora 450',        '[]'::jsonb),
  ('vipvet','Carla Giménez',     '3442448899','carla.gimenez@gmail.com',   '31200455','9 de Julio 1122',     '[]'::jsonb),
  ('vipvet','Rodrigo Fernández', '3442771122','rodri.fernandez@gmail.com', '25977301','Urquiza 780',         '[]'::jsonb),
  ('vipvet','Marta Suárez',      '3442663344','martasuarez@hotmail.com',   '19788440','Sarmiento 233',       '[]'::jsonb),
  ('vipvet','Lucía Benítez',     '3442990011','lucia.benitez@gmail.com',   '33871220','Almafuerte 615',      '[]'::jsonb),
  ('vipvet','Diego Ferreyra',    '3442112233','diegoferreyra@gmail.com',   '29344188','Los Ceibos 90',       '[]'::jsonb),
  ('vipvet','Sofía Ledesma',     '3442334455','sofi.ledesma@gmail.com',    '38220716','Moreno 1540',         '[]'::jsonb),
  ('vipvet','Héctor Quiroga',    '3442887766','hquiroga@yahoo.com.ar',     '16455093','España 320',          '[]'::jsonb),
  ('vipvet','Valentina Ríos',    '3442445566','valen.rios@gmail.com',      '40188234','Barrio Norte, Mz 4',  '[]'::jsonb),
  ('vipvet','Pablo Costa',       '3442667788','pablocosta@gmail.com',      '27099455','Ruta 39 km 3',        '[]'::jsonb),
  ('vipvet','Nadia Escobar',     '3442223344','nadia.escobar@gmail.com',   '35774100','Estrada 78',          '[]'::jsonb),
  ('vipvet','Ernesto Vallejos',  '3442556699','ernesto.vallejos@gmail.com','12988301','Chacabuco 1201',      '[]'::jsonb)
on conflict (tenant_id, dni) do nothing;

-- Un par de clientes con historial de cambios de datos, que es lo que muestra
-- la solapa "Datos" de la libreta.
update public.clientes
   set historial_datos = jsonb_build_array(
         jsonb_build_object(
           'campo', 'telefono',
           'valorAnterior', '3442000111',
           'valorNuevo', telefono,
           'fechaCambio', (now() - interval '5 months')::text),
         jsonb_build_object(
           'campo', 'domicilio',
           'valorAnterior', 'Colón 55',
           'valorNuevo', domicilio,
           'fechaCambio', (now() - interval '2 months')::text))
 where tenant_id = 'vipvet'
   and dni in ('28455112', '31200455')
   and historial_datos = '[]'::jsonb;

-- ============================================================================
-- 3. MASCOTAS, TURNOS E HISTORIAL
-- ============================================================================

do $$
declare
  c_tenant constant text := 'vipvet';

  -- Servicio, duración y con qué probabilidad sale sorteado.
  c_servicios constant text[] := array[
    'Consulta general','Vacunación','Control','Peluquería y baño','Urgencia',
    'Cirugía','Visita a domicilio'];
  c_duraciones constant int[] := array[30,30,30,60,60,120,60];

  c_profes_id  constant text[] := array['prof-priscila','prof-martin'];
  c_profes_nom constant text[] := array['Dra. Priscila Ramírez','Dr. Martín Alcaraz'];

  c_horas constant text[] := array[
    '09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30',
    '16:00','16:30','17:00','17:30','18:00','18:30'];

  c_motivos_perro constant text[] := array[
    'Control anual','Vacunación','Decaimiento y falta de apetito','Otitis',
    'Cojera de la pata trasera','Vómitos','Dermatitis','Control de peso',
    'Desparasitación','Corte de uñas y baño'];
  c_motivos_gato constant text[] := array[
    'Control anual','Vacunación','No come hace dos días','Estornudos',
    'Bola de pelo','Control post castración','Herida en la oreja','Desparasitación'];

  c_diags constant text[] := array[
    'Estado general bueno, sin hallazgos','Otitis externa bacteriana',
    'Gastroenteritis leve','Dermatitis alérgica por pulgas',
    'Sobrepeso grado 2','Parasitosis intestinal','Conjuntivitis',
    'Gingivitis leve','Cuadro respiratorio alto'];
  c_trats constant text[] := array[
    'Sin tratamiento, control en 6 meses',
    'Gotas óticas cada 12 h por 7 días',
    'Dieta blanda 3 días + protector gástrico',
    'Antipulgas mensual y baño medicado',
    'Plan de alimento light y control de peso mensual',
    'Antiparasitario, repetir a los 15 días',
    'Colirio antibiótico cada 8 h por 5 días',
    'Antibiótico 7 días y control'];

  v_m           record;
  v_cli         record;
  v_i           int;
  v_n           int;
  v_idx         int;
  v_mascota_id  uuid;
  v_turno_id    uuid;

  v_fecha       date;
  v_hora        text;
  v_servicio    text;
  v_duracion    int;
  v_estado      turno_estado;
  v_prof        int;
  v_motivo      text;
  v_vacunas     jsonb;
  v_tipo_vis    tipo_visita;

  v_turnos      int := 0;
  v_historias   int := 0;
  v_mascotas    int := 0;
begin
  if not exists (select 1 from public.tenants where slug = c_tenant) then
    raise exception 'No existe la veterinaria "%". Corré antes seeds/vipvet_productos.sql', c_tenant;
  end if;

  -- NO hay guard global. La versión anterior salía sin hacer nada si existía
  -- aunque fuera UNA mascota, así que una mascota cargada a mano probando la
  -- app alcanzaba para que el seed entero no escribiera nunca. Ahora la
  -- idempotencia es por fila: las mascotas van con `on conflict do nothing` y
  -- los turnos/historias solo se generan para la mascota que todavía no tiene
  -- ninguno. Lo que cargaste a mano queda intacto.

  -- Semilla fija: dos corridas dan exactamente los mismos datos.
  perform setseed(0.17);

  -- ── 3.1 MASCOTAS ──────────────────────────────────────────────────────────
  -- `slug` replica mascotaDocId(nombre, tipo) de lib/supabase/ids.ts:
  -- nombre y tipo en minúscula, sin tildes, separados por guión.
  for v_cli in
    select id, dni, nombre from public.clientes
     where tenant_id = c_tenant order by dni
  loop
    for v_m in
      select * from (values
        ('28455112','Firulais','Perro','8 años','Labrador',      '32 kg'),
        ('28455112','Michi',   'Gato', '3 años','Común europeo', '4,2 kg'),
        ('31200455','Luna',    'Perro','2 años','Caniche',       '6 kg'),
        ('31200455','Simba',   'Gato', '5 años','Siamés',        '5,1 kg'),
        ('31200455','Coco',    'Ave',  '1 año', 'Calopsita',     '90 g'),
        ('25977301','Rocco',   'Perro','5 años','Bulldog francés','12 kg'),
        ('25977301','Nina',    'Perro','7 años','Mestiza',       '18 kg'),
        ('19788440','Pelusa',  'Gato', '11 años','Persa',        '3,8 kg'),
        ('33871220','Thor',    'Perro','3 años','Ovejero alemán','38 kg'),
        ('33871220','Maia',    'Perro','1 año', 'Golden retriever','24 kg'),
        ('29344188','Tomy',    'Perro','9 años','Salchicha',     '9 kg'),
        ('38220716','Nala',    'Gato', '2 años','Común europeo', '3,9 kg'),
        ('38220716','Zeus',    'Perro','4 años','Pitbull',       '28 kg'),
        ('16455093','Duque',   'Perro','12 años','Mestizo',      '21 kg'),
        ('40188234','Copito',  'Conejo','2 años','Mini lop',     '1,8 kg'),
        ('40188234','Mora',    'Gata', '6 años','Común europeo', '4,5 kg'),
        ('27099455','Roma',    'Perro','6 años','Border collie', '19 kg'),
        ('27099455','Pipo',    'Perro','10 años','Mestizo',      '14 kg'),
        ('35774100','Kira',    'Perro','1 año', 'Husky siberiano','20 kg'),
        ('12988301','Lola',    'Perro','14 años','Cocker',       '11 kg'),
        ('12988301','Bigotes', 'Gato', '8 años','Común europeo', '5,5 kg')
      ) as t(dni, nombre, tipo, edad, raza, peso)
      where t.dni = v_cli.dni
    loop
      insert into public.mascotas
        (tenant_id, cliente_id, nombre, tipo, edad, raza, peso, slug, libreta_token)
      values
        (c_tenant, v_cli.id, v_m.nombre, v_m.tipo, v_m.edad, v_m.raza, v_m.peso,
         lower(translate(v_m.nombre, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) || '-' ||
         lower(translate(v_m.tipo,   'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')),
         -- Token del QR. En la app lo genera crypto.randomUUID() sin guiones.
         replace(gen_random_uuid()::text, '-', ''))
      on conflict (cliente_id, slug) do nothing
      returning id into v_mascota_id;

      -- `do nothing` con conflicto no devuelve fila y `returning` deja la
      -- variable en null: la mascota ya existía de una corrida anterior.
      if v_mascota_id is null then
        select id into v_mascota_id
          from public.mascotas
         where cliente_id = v_cli.id
           and slug = lower(translate(v_m.nombre, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) || '-' ||
                      lower(translate(v_m.tipo,   'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'));
        continue when v_mascota_id is null;
      else
        v_mascotas := v_mascotas + 1;
      end if;

      -- La app crea el registro consolidado vacío junto con la mascota
      -- (lib/supabase/mascotas.ts). Se replica para no dejar mascotas sin él.
      insert into public.historia_clinica (mascota_id, tenant_id)
      values (v_mascota_id, c_tenant)
      on conflict (mascota_id) do nothing;
    end loop;
  end loop;

  -- ── 3.2 TURNOS ────────────────────────────────────────────────────────────
  for v_m in
    select m.id, m.nombre, m.tipo, m.cliente_id,
           c.nombre as cli_nombre, c.telefono, c.email, c.dni, c.domicilio
      from public.mascotas m
      join public.clientes c on c.id = m.cliente_id
     where m.tenant_id = c_tenant
     order by m.created_at
  loop
    -- Idempotencia por mascota: si ya tiene turnos no se le agregan más. Eso
    -- deja en paz a la mascota que cargaste a mano y hace que volver a correr
    -- el script no duplique agendas.
    continue when exists (select 1 from public.turnos where mascota_id = v_m.id);

    -- Entre 4 y 10 turnos pasados por mascota, repartidos en 12 meses.
    v_n := 4 + floor(random() * 7)::int;

    for v_i in 1 .. v_n loop
      v_fecha := current_date - (floor(random() * 365)::int);
      -- Domingo cerrado; el sábado solo a la mañana.
      continue when extract(dow from v_fecha) = 0;

      v_hora := c_horas[1 + floor(random() * array_length(c_horas, 1))::int];
      continue when extract(dow from v_fecha) = 6 and v_hora >= '13:00';

      v_idx      := 1 + floor(random() * array_length(c_servicios, 1))::int;
      v_servicio := c_servicios[v_idx];
      v_duracion := c_duraciones[v_idx];
      v_prof     := 1 + floor(random() * 2)::int;

      -- 80% se atendió, 12% se canceló, 8% quedó confirmado sin cerrar (el
      -- clásico "vino, se atendió y nadie tocó el botón").
      v_estado := case
        when random() < 0.80 then 'completado'
        when random() < 0.92 then 'cancelado'
        else 'confirmado'
      end::turno_estado;

      v_motivo := case
        when v_m.tipo ilike 'gat%' then c_motivos_gato[1 + floor(random() * array_length(c_motivos_gato, 1))::int]
        else c_motivos_perro[1 + floor(random() * array_length(c_motivos_perro, 1))::int]
      end;

      -- Solo el turno de vacunación lleva vacunas, y dependen de la especie.
      v_vacunas := case
        when v_servicio <> 'Vacunación' then '[]'::jsonb
        when v_m.tipo ilike 'gat%'      then '["Triple felina","Antirrábica"]'::jsonb
        when v_m.tipo ilike 'conej%'    then '["Mixomatosis"]'::jsonb
        else '["Quíntuple","Antirrábica"]'::jsonb
      end;

      insert into public.turnos
        (tenant_id, cliente_id, mascota_id,
         cliente_nombre, cliente_telefono, cliente_email, cliente_dni, cliente_domicilio,
         mascota_nombre, mascota_tipo, mascota_motivo,
         servicio, fecha, hora, turno_timestamp, duracion_min,
         profesional_id, profesional_nombre, estado, vacunas,
         diagnostico, tratamiento, observaciones, created_at)
      values
        (c_tenant, v_m.cliente_id, v_m.id,
         v_m.cli_nombre, v_m.telefono, v_m.email, v_m.dni, v_m.domicilio,
         v_m.nombre, v_m.tipo, v_motivo,
         v_servicio, v_fecha, v_hora, (v_fecha + v_hora::time), v_duracion,
         c_profes_id[v_prof], c_profes_nom[v_prof], v_estado, v_vacunas,
         case when v_estado = 'completado'
              then c_diags[1 + floor(random() * array_length(c_diags, 1))::int] end,
         case when v_estado = 'completado'
              then c_trats[1 + floor(random() * array_length(c_trats, 1))::int] end,
         case when v_estado = 'cancelado' then 'Cancelado por el cliente' else '' end,
         (v_fecha - interval '3 days') + v_hora::time)
      returning id into v_turno_id;

      v_turnos := v_turnos + 1;

      -- Un turno atendido deja historia clínica. Los de peluquería no: no son
      -- un acto médico y ensucian la libreta.
      if v_estado = 'completado' and v_servicio <> 'Peluquería y baño' then
        v_tipo_vis := case
          when v_servicio = 'Visita a domicilio' then 'visita_programada'
          else 'turno_programado'
        end::tipo_visita;

        insert into public.historias
          (tenant_id, mascota_id, fecha_atencion, motivo, diagnostico, tratamiento,
           observaciones, proxima_visita, tipo_visita, turno_id, created_at)
        values
          (c_tenant, v_m.id, v_fecha, v_motivo,
           c_diags[1 + floor(random() * array_length(c_diags, 1))::int],
           c_trats[1 + floor(random() * array_length(c_trats, 1))::int],
           case when random() < 0.4 then 'La mascota llegó tranquila, se manejó sin bozal.' end,
           case when random() < 0.5 then v_fecha + (30 + floor(random() * 150)::int) end,
           v_tipo_vis, v_turno_id, v_fecha + v_hora::time);

        v_historias := v_historias + 1;
      end if;
    end loop;

    -- ── Turnos futuros: 0 a 2 por mascota, dentro de las próximas 3 semanas.
    for v_i in 1 .. floor(random() * 3)::int loop
      v_fecha := current_date + (1 + floor(random() * 21)::int);
      continue when extract(dow from v_fecha) = 0;

      v_hora := c_horas[1 + floor(random() * array_length(c_horas, 1))::int];
      continue when extract(dow from v_fecha) = 6 and v_hora >= '13:00';

      v_idx      := 1 + floor(random() * array_length(c_servicios, 1))::int;
      v_servicio := c_servicios[v_idx];
      v_duracion := c_duraciones[v_idx];
      v_prof     := 1 + floor(random() * 2)::int;

      -- Los de esta semana ya están confirmados; los de más adelante, no.
      v_estado := case
        when v_fecha <= current_date + 7 and random() < 0.7 then 'confirmado'
        else 'pendiente'
      end::turno_estado;

      insert into public.turnos
        (tenant_id, cliente_id, mascota_id,
         cliente_nombre, cliente_telefono, cliente_email, cliente_dni, cliente_domicilio,
         mascota_nombre, mascota_tipo, mascota_motivo,
         servicio, fecha, hora, turno_timestamp, duracion_min,
         profesional_id, profesional_nombre, estado, vacunas, created_at)
      values
        (c_tenant, v_m.cliente_id, v_m.id,
         v_m.cli_nombre, v_m.telefono, v_m.email, v_m.dni, v_m.domicilio,
         v_m.nombre, v_m.tipo,
         case when v_m.tipo ilike 'gat%'
              then c_motivos_gato[1 + floor(random() * array_length(c_motivos_gato, 1))::int]
              else c_motivos_perro[1 + floor(random() * array_length(c_motivos_perro, 1))::int] end,
         v_servicio, v_fecha, v_hora, (v_fecha + v_hora::time), v_duracion,
         c_profes_id[v_prof], c_profes_nom[v_prof], v_estado,
         case when v_servicio = 'Vacunación' and v_m.tipo ilike 'gat%' then '["Triple felina"]'::jsonb
              when v_servicio = 'Vacunación' then '["Quíntuple"]'::jsonb
              else '[]'::jsonb end,
         now());

      v_turnos := v_turnos + 1;
    end loop;

    -- ── Consultas sueltas, sin turno previo: el que cae por la puerta.
    for v_i in 1 .. floor(random() * 3)::int loop
      v_fecha := current_date - (floor(random() * 500)::int);
      continue when extract(dow from v_fecha) = 0;

      insert into public.historias
        (tenant_id, mascota_id, fecha_atencion, motivo, diagnostico, tratamiento,
         observaciones, tipo_visita, created_at)
      values
        (c_tenant, v_m.id, v_fecha,
         case when v_m.tipo ilike 'gat%'
              then c_motivos_gato[1 + floor(random() * array_length(c_motivos_gato, 1))::int]
              else c_motivos_perro[1 + floor(random() * array_length(c_motivos_perro, 1))::int] end,
         c_diags[1 + floor(random() * array_length(c_diags, 1))::int],
         c_trats[1 + floor(random() * array_length(c_trats, 1))::int],
         case when random() < 0.3 then 'Vino sin turno, se atendió como consulta.' end,
         'consulta'::tipo_visita, v_fecha + time '11:00');

      v_historias := v_historias + 1;
    end loop;
  end loop;

  raise notice 'VipVet: % mascotas, % turnos y % historias generadas.',
    v_mascotas, v_turnos, v_historias;
end $$;

-- ============================================================================
-- 4. DÍAS BLOQUEADOS
-- ============================================================================

insert into public.dias_bloqueados (tenant_id, fecha, motivo)
select 'vipvet', f.fecha, f.motivo
  from (values
    -- 1 de mayo del año en curso. `make_date` devuelve date; si se armara con
    -- date_trunc + interval el VALUES pasaría a ser timestamp y la columna es date.
    (make_date(extract(year from current_date)::int, 5, 1), 'Feriado — Día del Trabajador'),
    (current_date + 9,  'Congreso veterinario — cerrado todo el día'),
    (current_date + 10, 'Congreso veterinario — cerrado todo el día'),
    (current_date + 24, 'Licencia Dra. Priscila'),
    (current_date - 45, 'Feriado')
  ) as f(fecha, motivo)
on conflict (tenant_id, fecha) do nothing;

-- ============================================================================
-- 5. RECORDATORIOS DE VACUNA
--
-- Salen de los turnos de vacunación ya aplicados: la próxima dosis es un año
-- después. Los que ya pasaron quedan marcados como enviados.
-- ============================================================================

insert into public.recordatorios_vacunas
  (tenant_id, cliente_id, mascota_id, mascota_nombre, telefono, vacuna, fecha, enviado)
select
  t.tenant_id,
  t.cliente_id,
  t.mascota_id,
  t.mascota_nombre,
  t.cliente_telefono,
  vac.value #>> '{}',                 -- el elemento del array jsonb como texto
  t.fecha + interval '1 year',
  (t.fecha + interval '1 year') < current_date
from public.turnos t
cross join lateral jsonb_array_elements(t.vacunas) as vac(value)
where t.tenant_id = 'vipvet'
  and t.estado    = 'completado'
  and t.mascota_id is not null
  -- Solo la última aplicación de cada vacuna por mascota: si no, se generan
  -- recordatorios de refuerzos que ya se dieron.
  and t.fecha = (
    select max(t2.fecha) from public.turnos t2
     where t2.mascota_id = t.mascota_id
       and t2.estado = 'completado'
       and t2.vacunas @> jsonb_build_array(vac.value #>> '{}')
  )
  -- Sin clave única que lo impida, volver a correr el script duplicaría cada
  -- recordatorio. Se generan una sola vez.
  and not exists (
    select 1 from public.recordatorios_vacunas r
     where r.mascota_id = t.mascota_id
       and r.vacuna     = vac.value #>> '{}'
  );

-- ============================================================================
-- 6. LIBRETAS PÚBLICAS
--
-- Snapshot congelado que abre el QR. Replica lo que arma
-- `generarLibretaPublica` en lib/supabase/libretas.ts: solo datos de la
-- mascota (nunca del dueño) y las historias que NO vienen de un turno.
-- ============================================================================

insert into public.libretas_publicas (token, tenant_id, mascota_id, mascota, vet_nombre, historias)
select
  m.libreta_token,
  m.tenant_id,
  m.id,
  jsonb_build_object('nombre', m.nombre, 'tipo', m.tipo, 'raza', m.raza, 'edad', m.edad),
  'VipVet',
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'fecha',       h.fecha_atencion,
             'motivo',      coalesce(h.motivo, 'Consulta'),
             'diagnostico', h.diagnostico,
             'tratamiento', h.tratamiento)
           order by h.fecha_atencion desc)
      from (
        select * from public.historias hh
         where hh.mascota_id = m.id
           and hh.tipo_visita <> 'turno_programado'
         order by hh.fecha_atencion desc
         limit 30
      ) h
  ), '[]'::jsonb)
from public.mascotas m
where m.tenant_id = 'vipvet'
  and m.nombre in ('Firulais', 'Luna', 'Pelusa')
  and m.libreta_token is not null
on conflict (token) do nothing;

-- ============================================================================
-- 7. VERIFICACIÓN
--
-- Una sola query: el SQL Editor de Supabase muestra únicamente el resultado
-- del ÚLTIMO select del script. Antes había cuatro acá y por eso veías solo la
-- última — y ninguna te decía que los bloques se habían salteado.
-- ============================================================================

select * from (
  select 1 as orden, 'clientes'          as que, count(*)::text as valor from public.clientes              where tenant_id = 'vipvet'
  union all
  select 2, 'mascotas',                        count(*)::text from public.mascotas              where tenant_id = 'vipvet'
  union all
  select 3, 'turnos',                          count(*)::text from public.turnos                where tenant_id = 'vipvet'
  union all
  select 4, '  · completados',                 count(*)::text from public.turnos                where tenant_id = 'vipvet' and estado = 'completado'
  union all
  select 5, '  · pendientes',                  count(*)::text from public.turnos                where tenant_id = 'vipvet' and estado = 'pendiente'
  union all
  select 6, '  · confirmados',                 count(*)::text from public.turnos                where tenant_id = 'vipvet' and estado = 'confirmado'
  union all
  select 7, '  · cancelados',                  count(*)::text from public.turnos                where tenant_id = 'vipvet' and estado = 'cancelado'
  union all
  select 8, '  · a futuro',                    count(*)::text from public.turnos                where tenant_id = 'vipvet' and fecha >= current_date
  union all
  select 9, 'historias',                       count(*)::text from public.historias             where tenant_id = 'vipvet'
  union all
  select 10, 'historia_clinica',               count(*)::text from public.historia_clinica      where tenant_id = 'vipvet'
  union all
  select 11, 'dias_bloqueados',                count(*)::text from public.dias_bloqueados       where tenant_id = 'vipvet'
  union all
  select 12, 'recordatorios de vacuna',        count(*)::text from public.recordatorios_vacunas where tenant_id = 'vipvet'
  union all
  select 13, 'libretas publicas',              count(*)::text from public.libretas_publicas     where tenant_id = 'vipvet'
  union all
  select 14, 'mascotas SIN turnos (deberia ser 0 o 1)',
             count(*)::text
        from public.mascotas m
       where m.tenant_id = 'vipvet'
         and not exists (select 1 from public.turnos t where t.mascota_id = m.id)
) d
order by orden;

-- ============================================================================
-- LIMPIEZA — para regenerar todo lo clínico desde cero
--
-- Borrar la mascota arrastra sus historias, su historia clínica y su libreta
-- (todas son `on delete cascade`); los turnos quedan con mascota_id en null,
-- por eso se borran aparte y primero.
--
-- ⚠ NO toca productos ni ventas. Los clientes se conservan porque las ventas
--   les apuntan; si también los querés borrar, descomentá la última línea
--   DESPUÉS de haber limpiado las ventas.
-- ============================================================================

-- delete from public.recordatorios_vacunas where tenant_id = 'vipvet';
-- delete from public.turnos               where tenant_id = 'vipvet';
-- delete from public.mascotas             where tenant_id = 'vipvet';
-- delete from public.dias_bloqueados      where tenant_id = 'vipvet';
-- delete from public.clientes             where tenant_id = 'vipvet';
