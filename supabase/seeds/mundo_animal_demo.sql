-- ============================================================================
-- Seed de demostración — Mundo Animal: clientes, mascotas, turnos e historial
--
-- Hoy = 2026-08-25. Genera:
--   · 12 clientes con su mascota (incluida Iaridni Colombo / Nix, caso nuevo)
--   · 6 turnos del 23/08 (antiayer), 7 del 24/08 (ayer) y 5 del 25/08 (hoy):
--     los 18 quedan "completado" con su historia clínica cargada
--   · Los 3 primeros turnos (23/08) llevan adjuntos: radiografía, estudios de
--     sangre y cartilla de vacunación
--   · 8 turnos del 26/08 (mañana), en "pendiente" — todavía no pasaron
--
-- Ejecutar DESPUÉS de crear el tenant "mundo-animal" (ver
-- seeds/crear_mundo_animal.sql). Idempotente por (tenant_id, dni) en clientes
-- y por (cliente_id, slug) en mascotas; los turnos e historias sí se
-- duplicarían si se corre dos veces — pensado para correr una sola vez.
-- ============================================================================

-- ============================================================================
-- 1. TURNO_CONFIG (tipos de mascota / servicios / vacunas del selector público)
-- ============================================================================

insert into public.turno_config (tenant_id, mascotas, servicios, vacunas, profesionales)
values (
  'mundo-animal',
  '[
    {"id": "perro",  "emoji": "🐶", "nombre": "Perro"},
    {"id": "gato",   "emoji": "🐱", "nombre": "Gato"},
    {"id": "conejo", "emoji": "🐰", "nombre": "Conejo"},
    {"id": "ave",    "emoji": "🦜", "nombre": "Ave"}
  ]'::jsonb,
  '[
    {"id": "consulta-general", "emoji": "🩺", "nombre": "Consulta general", "descripcion": "Examen clínico",        "duracionMin": 30},
    {"id": "vacunacion",       "emoji": "💉", "nombre": "Vacunación",       "descripcion": "Aplicación de vacunas", "duracionMin": 30},
    {"id": "control",          "emoji": "📋", "nombre": "Control",          "descripcion": "Seguimiento",           "duracionMin": 30},
    {"id": "cirugia",          "emoji": "🏥", "nombre": "Cirugía",          "descripcion": "Procedimiento quirúrgico","duracionMin": 120}
  ]'::jsonb,
  '{
    "perro": [{"id": "sextuple", "nombre": "Séxtuple", "descripcion": "Refuerzo anual"}],
    "gato":  [{"id": "triple-felina", "nombre": "Triple felina", "descripcion": "Refuerzo anual"}]
  }'::jsonb,
  '[{"id": "prof-general", "nombre": "Dr/a. de guardia", "activo": true}]'::jsonb
)
on conflict (tenant_id) do update set
  mascotas  = excluded.mascotas,
  servicios = excluded.servicios,
  vacunas   = excluded.vacunas;

-- ============================================================================
-- 2. CLIENTES
-- ============================================================================

insert into public.clientes (tenant_id, nombre, telefono, email, dni, domicilio)
values
  ('mundo-animal', 'Marcos Duarte',      '3456400111', 'marcosduarte@gmail.com',   '30111222', 'Belgrano 120'),
  ('mundo-animal', 'Iaridni Colombo',    '3456402057', 'iaricolombo8@gmail.com',   '44196057', 'San Martín 850'),
  ('mundo-animal', 'Lucía Fernández',    '3456403321', 'luciafernandez@gmail.com', '28654321', 'Alberdi 45'),
  ('mundo-animal', 'Braian Sosa',        '3456404456', 'braiansosa@gmail.com',     '35789456', 'Urquiza 230'),
  ('mundo-animal', 'Valentina Ríos',     '3456405789', 'valentinarios@gmail.com',  '40123789', 'Mitre 310'),
  ('mundo-animal', 'Nahuel Acosta',      '3456406123', 'nahuelacosta@gmail.com',   '33456123', 'Sarmiento 78'),
  ('mundo-animal', 'Camila Benítez',     '3456407543', 'camilabenitez@gmail.com',  '29876543', 'Rivadavia 512'),
  ('mundo-animal', 'Emiliano Godoy',     '3456408567', 'emilianogodoy@gmail.com',  '41234567', 'España 99'),
  ('mundo-animal', 'Florencia Paz',      '3456409123', 'florenciapaz@gmail.com',   '27890123', 'Corrientes 640'),
  ('mundo-animal', 'Matías Ibarra',      '3456410432', 'matiasibarra@gmail.com',   '38765432', 'Entre Ríos 15'),
  ('mundo-animal', 'Rocío Medina',       '3456411987', 'rociomedina@gmail.com',    '31654987', 'Las Heras 205'),
  ('mundo-animal', 'Agustín Leiva',      '3456412210', 'agustinleiva@gmail.com',   '26543210', '25 de Mayo 88')
on conflict (tenant_id, dni) do nothing;

-- ============================================================================
-- 3. MASCOTAS
-- ============================================================================

insert into public.mascotas (tenant_id, cliente_id, nombre, tipo, edad, raza, peso, slug, libreta_token)
select 'mundo-animal', c.id, m.nombre, m.tipo, m.edad, m.raza, m.peso,
       lower(m.nombre) || '-' || m.tipo,
       encode(gen_random_bytes(12), 'hex')
from public.clientes c
join (values
  ('30111222', 'Rocco',  'perro',  '4 años',   'Labrador',      '28 kg'),
  ('44196057', 'Nix',    'gato',   '7 meses',  'Mestiza',       '2.5 kg'),
  ('28654321', 'Coco',   'perro',  '6 años',   'Caniche',       '9 kg'),
  ('35789456', 'Michi',  'gato',   '3 años',   'Siamés',        '4 kg'),
  ('40123789', 'Toby',   'perro',  '2 años',   'Beagle',        '12 kg'),
  ('33456123', 'Pepa',   'conejo', '1 año',    'Mini lop',      '1.8 kg'),
  ('29876543', 'Thor',   'perro',  '5 años',   'Ovejero alemán','32 kg'),
  ('41234567', 'Salem',  'gato',   '4 años',   'Común europeo', '5 kg'),
  ('27890123', 'Luna',   'perro',  '8 años',   'Golden retriever','27 kg'),
  ('38765432', 'Simón',  'gato',   '2 años',   'Común europeo', '4.5 kg'),
  ('31654987', 'Bruno',  'perro',  '1 año',    'Bóxer',         '20 kg'),
  ('26543210', 'Kiwi',   'ave',    '3 años',   'Cotorra',       '100 g')
) as m(dni, nombre, tipo, edad, raza, peso) on m.dni = c.dni
where c.tenant_id = 'mundo-animal'
on conflict (cliente_id, slug) do nothing;

insert into public.historia_clinica (mascota_id, tenant_id)
select mo.id, 'mundo-animal' from public.mascotas mo where mo.tenant_id = 'mundo-animal'
on conflict (mascota_id) do nothing;

-- ============================================================================
-- 4. TURNOS PASADOS (completados, con historia clínica)
--
-- Antiayer 23/08 (6), ayer 24/08 (7), hoy 25/08 (5) = 18 turnos completados.
-- Los primeros 3 (23/08) llevan adjuntos.
-- ============================================================================

with datos as (
  select * from (values
    -- fecha,        hora,    dni_cliente, servicio,              motivo,                          diagnostico,                                  tratamiento,                                          observaciones,                                   archivos
    ('2026-08-23'::date, '09:00', '28654321', 'Consulta general', 'Cojera en pata trasera',        'Distensión leve de ligamento',              'Reposo 7 días + antiinflamatorio (Meloxicam)',      'Mejoró notoriamente al 4to día. Control en 15 días.', array['https://picsum.photos/seed/rx-coco/900/650.jpg']),
    ('2026-08-23'::date, '10:00', '30111222', 'Control',           'Chequeo prequirúrgico',         'Apto para cirugía, hemograma dentro de rango','Se programa castración para la semana próxima',      'Sin hallazgos de riesgo.',                      array['https://www.orimi.com/pdf-test.pdf']),
    ('2026-08-23'::date, '11:00', '35789456', 'Vacunación',        'Refuerzo anual',                'Sano, al día con el calendario',            'Triple felina + antiparasitario interno',            'Se entrega cartilla actualizada.',              array['https://picsum.photos/seed/cartilla-michi/900/650.jpg']),
    ('2026-08-23'::date, '15:00', '40123789', 'Consulta general', 'Vómitos ocasionales',            'Gastritis leve por ingesta de pasto',       'Dieta blanda 48hs + protector gástrico',             'Buena evolución esperada.',                      array[]::text[]),
    ('2026-08-23'::date, '16:00', '33456123', 'Consulta general', 'Falta de apetito',              'Estasis gastrointestinal leve',             'Motilizador digestivo + fibra en la dieta',          'Se recomienda aumentar heno en la dieta diaria.',array[]::text[]),
    ('2026-08-23'::date, '17:00', '29876543', 'Control',           'Control post-operatorio',       'Cicatrización correcta',                    'Retiro de puntos realizado',                         'Alta definitiva.',                              array[]::text[]),

    ('2026-08-24'::date, '09:00', '41234567', 'Consulta general', 'Estornudos y secreción ocular', 'Rinitis viral leve',                        'Antibiótico + suero fisiológico ocular',             'Aislar de otros gatos 5 días.',                 array[]::text[]),
    ('2026-08-24'::date, '10:00', '27890123', 'Control',           'Control de artrosis',           'Artrosis coxofemoral estable',              'Continúa condroprotector mensual',                   'Buena movilidad para su edad.',                 array[]::text[]),
    ('2026-08-24'::date, '11:00', '38765432', 'Vacunación',        'Refuerzo anual',                'Sano',                                       'Triple felina',                                      'Sin reacciones adversas.',                      array[]::text[]),
    ('2026-08-24'::date, '12:00', '31654987', 'Consulta general', 'Picazón intensa',                'Dermatitis alérgica a picadura de pulga',   'Antihistamínico + pipeta antiparasitaria',           'Bañar con shampoo dermatológico cada 7 días.',  array[]::text[]),
    ('2026-08-24'::date, '15:00', '26543210', 'Consulta general', 'Plumaje opaco',                 'Déficit nutricional leve',                  'Suplemento vitamínico en el agua',                   'Revisar dieta de semillas, incorporar frutas.', array[]::text[]),
    ('2026-08-24'::date, '16:00', '30111222', 'Control',           'Control post-vacunación',       'Sin reacciones, buen estado general',       'Ninguno',                                            'Próxima vacuna en 12 meses.',                   array[]::text[]),
    ('2026-08-24'::date, '17:00', '28654321', 'Control',           'Control de evolución de cojera','Recuperación completa',                     'Alta del tratamiento',                               'Puede retomar actividad física normal.',        array[]::text[]),

    ('2026-08-25'::date, '09:00', '40123789', 'Consulta general', 'Diarrea leve',                  'Parasitosis intestinal leve',               'Antiparasitario + probiótico',                       'Repetir análisis de materia fecal en 15 días.', array[]::text[]),
    ('2026-08-25'::date, '10:00', '33456123', 'Control',           'Control de peso',               'Peso adecuado para la edad',                'Continúa dieta actual',                              'Sin observaciones.',                            array[]::text[]),
    ('2026-08-25'::date, '11:00', '44196057', 'Consulta general', 'Vómitos y decaimiento hace 2 días', 'Parasitosis intestinal con anemia leve (posible por carga de pulgas y ambiente callejero previo a la adopción)', 'Antiparasitario de amplio espectro + hierro oral + dieta de recuperación por 5 días', 'Nix llegó adoptada de la calle hace 2 semanas. Buen apetito pese al cuadro. Se cita control en 7 días para repetir hemograma.', array[]::text[]),
    ('2026-08-25'::date, '15:00', '29876543', 'Vacunación',        'Refuerzo anual',                'Sano',                                       'Séxtuple',                                            'Sin reacciones.',                               array[]::text[]),
    ('2026-08-25'::date, '16:00', '41234567', 'Control',           'Control de rinitis',            'Cuadro resuelto',                            'Finaliza tratamiento antibiótico',                   'Alta.',                                          array[]::text[])
  ) as t(fecha, hora, dni_cliente, servicio, motivo, diagnostico, tratamiento, observaciones, archivos)
),
turnos_ins as (
  insert into public.turnos (
    tenant_id, cliente_id, mascota_id,
    cliente_nombre, cliente_telefono, cliente_email, cliente_dni, cliente_domicilio,
    mascota_nombre, mascota_tipo, mascota_motivo,
    servicio, fecha, hora, turno_timestamp, estado,
    diagnostico, tratamiento, observaciones
  )
  select
    'mundo-animal', c.id, mo.id,
    c.nombre, c.telefono, c.email, c.dni, c.domicilio,
    mo.nombre, mo.tipo, d.motivo,
    d.servicio, d.fecha, d.hora, (d.fecha + d.hora::time)::timestamptz, 'completado',
    d.diagnostico, d.tratamiento, d.observaciones
  from datos d
  join public.clientes c on c.tenant_id = 'mundo-animal' and c.dni = d.dni_cliente
  join public.mascotas mo on mo.cliente_id = c.id
  returning id, mascota_id, fecha, diagnostico, tratamiento, observaciones
)
insert into public.historias (tenant_id, mascota_id, fecha_atencion, motivo, diagnostico, tratamiento, observaciones, archivos, tipo_visita, turno_id)
select 'mundo-animal', tu.mascota_id, tu.fecha, d.motivo, tu.diagnostico, tu.tratamiento, tu.observaciones,
       to_jsonb(d.archivos), 'consulta', tu.id
from turnos_ins tu
join datos d on d.fecha = tu.fecha and d.diagnostico = tu.diagnostico;

-- ============================================================================
-- 5. TURNOS DE MAÑANA (26/08) — pendientes, todavía no pasaron
-- ============================================================================

with datos as (
  select * from (values
    ('09:00', '41234567', 'Consulta general', 'Control anual'),
    ('10:00', '27890123', 'Consulta general', 'Chequeo geriátrico'),
    ('11:00', '38765432', 'Vacunación',       'Refuerzo anual'),
    ('12:00', '31654987', 'Control',          'Control dermatitis'),
    ('15:00', '26543210', 'Consulta general', 'Control de plumaje'),
    ('16:00', '30111222', 'Control',          'Control post-cirugía'),
    ('17:00', '28654321', 'Consulta general', 'Dolor al masticar'),
    ('18:00', '35789456', 'Control',          'Control de peso')
  ) as t(hora, dni_cliente, servicio, motivo)
)
insert into public.turnos (
  tenant_id, cliente_id, mascota_id,
  cliente_nombre, cliente_telefono, cliente_email, cliente_dni, cliente_domicilio,
  mascota_nombre, mascota_tipo, mascota_motivo,
  servicio, fecha, hora, turno_timestamp, estado
)
select
  'mundo-animal', c.id, mo.id,
  c.nombre, c.telefono, c.email, c.dni, c.domicilio,
  mo.nombre, mo.tipo, d.motivo,
  d.servicio, '2026-08-26'::date, d.hora, ('2026-08-26'::date + d.hora::time)::timestamptz, 'pendiente'
from datos d
join public.clientes c on c.tenant_id = 'mundo-animal' and c.dni = d.dni_cliente
join public.mascotas mo on mo.cliente_id = c.id;

-- Verificación
select fecha, estado, count(*) from public.turnos where tenant_id = 'mundo-animal' group by fecha, estado order by fecha;
select nombre, tipo from public.mascotas where tenant_id = 'mundo-animal' order by nombre;
