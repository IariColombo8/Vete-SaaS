-- ============================================================================
-- Seed complementario — VipVet: alimentos con marca / línea / peso
--
-- Corrige lo que faltaba en `vipvet_productos.sql`: los alimentos estaban
-- cargados como productos sueltos, sin `marca`, `linea` ni `peso_kg`. El
-- selector guiado del mostrador (components/admin/pos/alimento-selector.tsx)
-- agrupa por marca → línea → presentación, así que sin esos campos mostraba
-- "Todavía no hay alimentos con marca cargada".
--
-- Además agrega 13 alimentos más (Royal Canin, Eukanuba, Excellent) para que
-- el selector tenga varias marcas y se note el agrupamiento.
--
-- (El bloque de imágenes que traía este archivo se dio de baja — ver la
--  sección 3 y `vipvet_borrar_imagenes.sql`.)
--
-- Ejecutar DESPUÉS de `004_productos.sql`, `005_ventas.sql` (de ahí salen las
-- columnas marca/linea/peso_kg) y `seeds/vipvet_productos.sql`, en:
--   Supabase Dashboard → SQL Editor → New query
--
-- Idempotente: los updates son por código y los inserts van con
-- `on conflict do nothing`.
-- ============================================================================

-- ============================================================================
-- 1. ALIMENTOS NUEVOS
--
-- Ya vienen con marca/línea/peso; los de abajo se completan por update.
-- ============================================================================

insert into public.productos
  (tenant_id, codigo, nombre, descripcion, categoria, precio, costo,
   stock, stock_minimo, unidad, unidades_por_bulto, marca, linea, peso_kg)
values
-- ── ROYAL CANIN ─────────────────────────────────────────────────────────────
('vipvet','ALB-RC-MED-ADU-15','Royal Canin Medium Adult 15 kg','Alimento para perros adultos de razas medianas (11 a 25 kg). Bolsa de 15 kg.','Alimentos / Perro',96000,72000,5,2,'un',null,'Royal Canin','Medium Adult',15),
('vipvet','ALB-RC-MED-ADU-3','Royal Canin Medium Adult 3 kg','Alimento para perros adultos de razas medianas. Bolsa de 3 kg.','Alimentos / Perro',25500,19000,9,3,'un',null,'Royal Canin','Medium Adult',3),
('vipvet','ALB-RC-MED-PUP-15','Royal Canin Medium Puppy 15 kg','Alimento para cachorros de razas medianas hasta los 12 meses. Bolsa de 15 kg.','Alimentos / Perro',99000,74500,4,2,'un',null,'Royal Canin','Medium Puppy',15),
('vipvet','ALB-RC-MINI-ADU-3','Royal Canin Mini Adult 3 kg','Alimento para perros adultos de razas pequeñas (hasta 10 kg). Bolsa de 3 kg.','Alimentos / Perro',27000,20200,10,3,'un',null,'Royal Canin','Mini Adult',3),
('vipvet','ALB-RC-GAT-ADU-75','Royal Canin Feline Adult 7,5 kg','Alimento para gatos adultos de 1 a 7 años. Bolsa de 7,5 kg.','Alimentos / Gato',78000,58500,4,2,'un',null,'Royal Canin','Feline Adult',7.5),
('vipvet','ALB-RC-GAT-ADU-15','Royal Canin Feline Adult 1,5 kg','Alimento para gatos adultos. Bolsa de 1,5 kg.','Alimentos / Gato',21500,16000,12,4,'un',null,'Royal Canin','Feline Adult',1.5),
-- Dieta veterinaria: mismo producto, línea aparte para no mezclarla con la común.
('vipvet','ALB-RC-VET-URI-3','Royal Canin Urinary S/O Feline 3 kg','Dieta veterinaria para disolución de cálculos de estruvita en gatos. Bolsa de 3 kg. Venta bajo indicación profesional.','Alimentos / Dietas veterinarias',64000,48000,3,1,'un',null,'Royal Canin','Veterinary Diet Urinary',3),
('vipvet','ALB-RC-VET-GAS-2','Royal Canin Gastrointestinal Canine 2 kg','Dieta veterinaria para trastornos digestivos en perros. Bolsa de 2 kg. Venta bajo indicación profesional.','Alimentos / Dietas veterinarias',48000,36000,3,1,'un',null,'Royal Canin','Veterinary Diet Gastrointestinal',2),

-- ── EUKANUBA ────────────────────────────────────────────────────────────────
('vipvet','ALB-EK-ADU-15','Eukanuba Adult Medium Breed 15 kg','Alimento premium para perros adultos de razas medianas. Bolsa de 15 kg.','Alimentos / Perro',88000,66000,4,2,'un',null,'Eukanuba','Adult Medium Breed',15),
('vipvet','ALB-EK-PUP-15','Eukanuba Puppy Medium Breed 15 kg','Alimento premium para cachorros de razas medianas. Bolsa de 15 kg.','Alimentos / Perro',91000,68500,3,2,'un',null,'Eukanuba','Puppy Medium Breed',15),

-- ── EXCELLENT ───────────────────────────────────────────────────────────────
('vipvet','ALB-EX-ADU-15','Excellent Adulto 15 kg','Alimento premium nacional para perros adultos. Bolsa de 15 kg.','Alimentos / Perro',46000,33500,8,3,'un',null,'Excellent','Adulto',15),
('vipvet','ALB-EX-CAC-15','Excellent Cachorro 15 kg','Alimento premium nacional para cachorros. Bolsa de 15 kg.','Alimentos / Perro',49000,35800,6,3,'un',null,'Excellent','Cachorro',15),
('vipvet','ALB-EX-GRANEL','Excellent Adulto a granel','Excellent Adulto fraccionado, se vende por kilo con balanza.','Alimentos / Granel',3100,2250,40,10,'kg',null,'Excellent','Adulto',null)

-- El índice único de `codigo` es parcial (varios productos sin código no chocan
-- entre sí), así que hay que repetirle el predicado: sin él Postgres no puede
-- inferir el índice y falla con "no unique or exclusion constraint matching".
on conflict (tenant_id, codigo) where codigo is not null and codigo <> ''
do nothing;

-- ============================================================================
-- 2. MARCA / LÍNEA / PESO DE LOS ALIMENTOS QUE YA ESTABAN
--
-- El selector agrupa marca → línea → presentación, así que dos bolsas de la
-- misma línea con distinto peso tienen que compartir `linea` y diferenciarse
-- por `peso_kg`. Los productos a granel van con `peso_kg` en null: su
-- presentación es "por kg" y el precio se lee como precio por kilo.
-- ============================================================================

update public.productos p
   set marca   = d.marca,
       linea   = d.linea,
       peso_kg = d.peso_kg
  from (values
    -- codigo,                marca,          linea,                                peso_kg
    ('ALB-OP-ADU-15',        'Old Prince',   'Adulto Razas Medianas y Grandes',    15::numeric),
    ('ALB-OP-ADU-3',         'Old Prince',   'Adulto Razas Medianas y Grandes',    3),
    ('ALB-OP-CAC-15',        'Old Prince',   'Cachorro Razas Medianas y Grandes',  15),
    ('ALB-OP-CAC-3',         'Old Prince',   'Cachorro Razas Medianas y Grandes',  3),
    ('ALB-OP-EQU-15',        'Old Prince',   'Equilibrium Adulto',                 15),
    ('ALB-OP-SEN-15',        'Old Prince',   'Senior',                             15),

    ('ALB-KG-ADU-22',        'Kongo',        'Adulto',                             22),
    ('ALB-KG-ADU-15',        'Kongo',        'Adulto',                             15),
    ('ALB-KG-CAC-15',        'Kongo',        'Cachorro',                           15),
    ('ALB-KG-GRANEL',        'Kongo',        'Adulto',                             null),

    -- Gold es una línea de Kongo, no una marca aparte: así queda debajo de
    -- Kongo en el selector en vez de duplicar la marca.
    ('ALB-KGG-ADU-22',       'Kongo',        'Gold Adulto',                        22),
    ('ALB-KGG-ADU-15',       'Kongo',        'Gold Adulto',                        15),
    ('ALB-KGG-CAC-15',       'Kongo',        'Gold Cachorro',                      15),
    ('ALB-KGG-GRANEL',       'Kongo',        'Gold Adulto',                        null),

    ('ALB-PP-ADU-15',        'Pro Plan',     'Adulto Razas Medianas',              15),
    ('ALB-PP-ADU-3',         'Pro Plan',     'Adulto Razas Medianas',              3),
    ('ALB-PP-CAC-15',        'Pro Plan',     'Cachorro Razas Medianas',            15),
    ('ALB-PP-SEN-15',        'Pro Plan',     'Adulto 7+',                          15),
    ('ALB-PP-GAT-75',        'Pro Plan',     'Gato Adulto',                        7.5),
    ('ALB-PP-GAT-3',         'Pro Plan',     'Gato Adulto',                        3),

    ('ALB-VC-ADU-20',        'Vital Can',    'Adulto',                             20),
    ('ALB-VC-CAC-20',        'Vital Can',    'Cachorro',                           20),
    ('ALB-VC-NAT-15',        'Vital Can',    'Natural Recipe Adulto',              15),
    ('ALB-VC-GAT-8',         'Vital Can',    'Gato Adulto',                        8),

    ('ALB-CR-ADU-22',        'Criadores',    'Adulto',                             22),
    ('ALB-CR-CAC-22',        'Criadores',    'Cachorro',                           22),
    ('ALB-CR-GRANEL',        'Criadores',    'Adulto',                             null),
    ('ALB-CR-GAT-10',        'Criadores',    'Gato Adulto',                        10),

    ('ALB-MX-ADU-22',        'Mix',          'Adulto',                             22),
    ('ALB-MX-CAC-22',        'Mix',          'Cachorro',                           22),
    ('ALB-MX-GRANEL',        'Mix',          'Adulto',                             null),

    ('ALB-WK-GAT-10',        'Whiskas',      'Gato Adulto Carne',                  10),
    ('ALB-WK-GAT-3',         'Whiskas',      'Gato Adulto Pescado',                3),
    ('ALB-WK-GAT-1500',      'Whiskas',      'Gato Adulto',                        1.5),
    ('ALB-WK-SAC-85',        'Whiskas',      'Sachet',                             0.085),

    ('ALB-SUS-LAC-500',      'Sustituto',    'Leche maternizada',                  0.5),
    ('ALB-SUS-LAC-200',      'Sustituto',    'Leche maternizada',                  0.2)
  ) as d(codigo, marca, linea, peso_kg)
 where p.tenant_id = 'vipvet'
   and p.codigo    = d.codigo;

-- ============================================================================
-- 3. IMÁGENES — DESACTIVADO
--
-- Acá había un update que llenaba `imagen_url` con placeholders de
-- picsum.photos. Quedaron fotos al azar sin relación con una veterinaria, así
-- que se dieron de baja: ver `vipvet_borrar_imagenes.sql`, que limpia las que
-- hayan quedado de una corrida anterior.
--
-- Sin imagen, la grilla dibuja el icono de caja, que es preferible a una foto
-- equivocada. Para cargar las de verdad: Productos → editar → URL de imagen,
-- o un update contra tu bucket de Supabase Storage.
-- ============================================================================

-- ============================================================================
-- 4. VERIFICACIÓN
-- ============================================================================

-- Cómo va a verse el selector del mostrador: una fila por marca → línea.
select marca,
       linea,
       count(*)                                    as presentaciones,
       string_agg(
         coalesce(peso_kg::text || ' kg', 'por kg'),
         ' · ' order by peso_kg nulls last
       )                                           as pesos
  from public.productos
 where tenant_id = 'vipvet'
   and activo
   and marca is not null and marca <> ''
 group by marca, linea
 order by marca, linea;

-- Alimentos que quedaron SIN marca: no aparecen en el selector guiado, solo en
-- el buscador. Tiene que dar 0 filas.
select codigo, nombre, categoria
  from public.productos
 where tenant_id = 'vipvet'
   and categoria like 'Alimentos%'
   and (marca is null or marca = '')
 order by codigo;
