-- ============================================================================
-- Seed de catálogo — VipVet
--
-- Carga el catálogo completo de la veterinaria: alimentos balanceados, snacks,
-- paseo, comederos, descanso, higiene, juguetes, accesorios, veterinaria y
-- servicios. 152 productos en 33 rubros.
--
-- Ejecutar DESPUÉS de `schema.sql` y `004_productos.sql`, en:
--   Supabase Dashboard → SQL Editor → New query
--
-- Idempotente: los productos se insertan con `on conflict do nothing` sobre
-- (tenant_id, codigo). Volver a correrlo NO pisa precios ni stock que hayas
-- editado a mano — solo agrega lo que falte.
--
-- ⚠ Los precios y costos son valores de referencia para arrancar. Ajustalos
--   con la importación de la lista de tu proveedor (Productos → Importar).
-- ============================================================================

-- ============================================================================
-- 1. LA VETERINARIA
-- ============================================================================

insert into public.tenants (slug, nombre, plan, status, modalidad, slogan)
values (
  'vipvet',
  'VipVet',
  'pro',          -- Productos requiere plan Plus o Pro
  'activo',
  'local',
  'Todo para tu mascota, en un solo lugar'
)
on conflict (slug) do update
  -- Si la veterinaria ya existía, solo se asegura el plan: el resto de su
  -- configuración (fotos, horarios, teléfono) no se toca.
  set plan = 'pro'
  where public.tenants.plan = 'basico';

-- ============================================================================
-- 2. PRODUCTOS
--
-- Convención de código:  RUBRO-MARCA/TIPO-VARIANTE
--   ALB = alimento balanceado · SNK = snacks · PAS = paseo · COM = comederos
--   DES = descanso · HIG = higiene · JUG = juguetes · ACC = accesorios
--   VET = veterinaria · SRV = servicios
--
-- `unidad = 'kg'` marca los productos que se venden a granel con balanza.
-- `unidades_por_bulto` es cuántas unidades trae el bulto cerrado del proveedor.
-- ============================================================================

insert into public.productos
  (tenant_id, codigo, nombre, descripcion, categoria, precio, costo,
   stock, stock_minimo, unidad, unidades_por_bulto)
values

-- ── ALIMENTOS BALANCEADOS · OLD PRINCE ──────────────────────────────────────
('vipvet','ALB-OP-ADU-15','Old Prince Adulto Razas Medianas y Grandes 15 kg','Alimento super premium para perros adultos. Bolsa de 15 kg.','Alimentos / Perro',52000,38000,8,3,'un',null),
('vipvet','ALB-OP-ADU-3','Old Prince Adulto Razas Medianas y Grandes 3 kg','Alimento super premium para perros adultos. Bolsa de 3 kg.','Alimentos / Perro',14500,10500,12,4,'un',null),
('vipvet','ALB-OP-CAC-15','Old Prince Cachorro Razas Medianas y Grandes 15 kg','Alimento super premium para cachorros en crecimiento. Bolsa de 15 kg.','Alimentos / Perro',56000,41000,6,3,'un',null),
('vipvet','ALB-OP-CAC-3','Old Prince Cachorro 3 kg','Alimento super premium para cachorros. Bolsa de 3 kg.','Alimentos / Perro',15500,11300,10,4,'un',null),
('vipvet','ALB-OP-EQU-15','Old Prince Equilibrium Adulto 15 kg','Línea Equilibrium, fórmula de alta digestibilidad. Bolsa de 15 kg.','Alimentos / Perro',68000,50000,5,2,'un',null),
('vipvet','ALB-OP-SEN-15','Old Prince Senior 15 kg','Alimento para perros mayores de 7 años. Bolsa de 15 kg.','Alimentos / Perro',54000,39500,4,2,'un',null),

-- ── ALIMENTOS BALANCEADOS · KONGO ───────────────────────────────────────────
('vipvet','ALB-KG-ADU-22','Kongo Adulto 22 kg','Alimento para perros adultos. Bolsa de 22 kg.','Alimentos / Perro',38000,27500,10,4,'un',null),
('vipvet','ALB-KG-ADU-15','Kongo Adulto 15 kg','Alimento para perros adultos. Bolsa de 15 kg.','Alimentos / Perro',27500,20000,12,4,'un',null),
('vipvet','ALB-KG-CAC-15','Kongo Cachorro 15 kg','Alimento para cachorros. Bolsa de 15 kg.','Alimentos / Perro',30000,22000,8,3,'un',null),
('vipvet','ALB-KG-GRANEL','Kongo Adulto a granel','Alimento Kongo adulto suelto, se vende por kilo con balanza.','Alimentos / Granel',2100,1550,45,10,'kg',null),

-- ── ALIMENTOS BALANCEADOS · KONGO GOLD ──────────────────────────────────────
('vipvet','ALB-KGG-ADU-22','Kongo Gold Adulto 22 kg','Línea Gold, mayor porcentaje de proteína animal. Bolsa de 22 kg.','Alimentos / Perro',49000,36000,7,3,'un',null),
('vipvet','ALB-KGG-ADU-15','Kongo Gold Adulto 15 kg','Línea Gold para perros adultos. Bolsa de 15 kg.','Alimentos / Perro',35500,26000,9,3,'un',null),
('vipvet','ALB-KGG-CAC-15','Kongo Gold Cachorro 15 kg','Línea Gold para cachorros. Bolsa de 15 kg.','Alimentos / Perro',38000,28000,6,3,'un',null),
('vipvet','ALB-KGG-GRANEL','Kongo Gold a granel','Alimento Kongo Gold suelto, se vende por kilo con balanza.','Alimentos / Granel',2600,1900,38,10,'kg',null),

-- ── ALIMENTOS BALANCEADOS · PRO PLAN ────────────────────────────────────────
('vipvet','ALB-PP-ADU-15','Pro Plan Adulto Razas Medianas 15 kg','Alimento super premium con OptiHealth. Bolsa de 15 kg.','Alimentos / Perro',78000,58000,6,2,'un',null),
('vipvet','ALB-PP-ADU-3','Pro Plan Adulto Razas Medianas 3 kg','Alimento super premium. Bolsa de 3 kg.','Alimentos / Perro',21000,15500,10,4,'un',null),
('vipvet','ALB-PP-CAC-15','Pro Plan Cachorro Razas Medianas 15 kg','Alimento super premium para cachorros. Bolsa de 15 kg.','Alimentos / Perro',82000,61000,4,2,'un',null),
('vipvet','ALB-PP-SEN-15','Pro Plan Adulto 7+ 15 kg','Alimento para perros adultos mayores. Bolsa de 15 kg.','Alimentos / Perro',80000,59500,3,2,'un',null),
('vipvet','ALB-PP-GAT-75','Pro Plan Gato Adulto 7,5 kg','Alimento super premium para gatos adultos. Bolsa de 7,5 kg.','Alimentos / Gato',62000,46000,5,2,'un',null),
('vipvet','ALB-PP-GAT-3','Pro Plan Gato Adulto 3 kg','Alimento super premium para gatos adultos. Bolsa de 3 kg.','Alimentos / Gato',29000,21500,8,3,'un',null),

-- ── ALIMENTOS BALANCEADOS · VITAL CAN ───────────────────────────────────────
('vipvet','ALB-VC-ADU-20','Vital Can Adulto 20 kg','Alimento premium para perros adultos. Bolsa de 20 kg.','Alimentos / Perro',58000,42500,7,3,'un',null),
('vipvet','ALB-VC-CAC-20','Vital Can Cachorro 20 kg','Alimento premium para cachorros. Bolsa de 20 kg.','Alimentos / Perro',62000,45500,5,2,'un',null),
('vipvet','ALB-VC-NAT-15','Vital Can Natural Recipe Adulto 15 kg','Línea Natural Recipe, sin colorantes ni conservantes artificiales. 15 kg.','Alimentos / Perro',71000,52500,4,2,'un',null),
('vipvet','ALB-VC-GAT-8','Vital Can Gato Adulto 8 kg','Alimento premium para gatos adultos. Bolsa de 8 kg.','Alimentos / Gato',44000,32000,6,2,'un',null),

-- ── ALIMENTOS BALANCEADOS · CRIADORES ───────────────────────────────────────
('vipvet','ALB-CR-ADU-22','Criadores Adulto 22 kg','Alimento de uso diario para perros adultos. Bolsa de 22 kg.','Alimentos / Perro',34000,24500,14,5,'un',null),
('vipvet','ALB-CR-CAC-22','Criadores Cachorro 22 kg','Alimento de uso diario para cachorros. Bolsa de 22 kg.','Alimentos / Perro',37000,27000,9,4,'un',null),
('vipvet','ALB-CR-GRANEL','Criadores Adulto a granel','Alimento Criadores suelto, se vende por kilo con balanza.','Alimentos / Granel',1850,1350,60,15,'kg',null),
('vipvet','ALB-CR-GAT-10','Criadores Gato Adulto 10 kg','Alimento de uso diario para gatos adultos. Bolsa de 10 kg.','Alimentos / Gato',26000,19000,7,3,'un',null),

-- ── ALIMENTOS BALANCEADOS · MIX ─────────────────────────────────────────────
('vipvet','ALB-MX-ADU-22','Mix Adulto 22 kg','Alimento económico para perros adultos. Bolsa de 22 kg.','Alimentos / Perro',29000,21000,16,5,'un',null),
('vipvet','ALB-MX-CAC-22','Mix Cachorro 22 kg','Alimento económico para cachorros. Bolsa de 22 kg.','Alimentos / Perro',31500,23000,10,4,'un',null),
('vipvet','ALB-MX-GRANEL','Mix Adulto a granel','Alimento Mix suelto, se vende por kilo con balanza. El más económico.','Alimentos / Granel',1600,1150,75,20,'kg',null),

-- ── ALIMENTOS BALANCEADOS · WHISKAS ─────────────────────────────────────────
('vipvet','ALB-WK-GAT-10','Whiskas Gato Adulto Carne 10 kg','Alimento seco para gatos adultos, sabor carne. Bolsa de 10 kg.','Alimentos / Gato',42000,31000,6,2,'un',null),
('vipvet','ALB-WK-GAT-3','Whiskas Gato Adulto Pescado 3 kg','Alimento seco para gatos adultos, sabor pescado. Bolsa de 3 kg.','Alimentos / Gato',15500,11500,11,4,'un',null),
('vipvet','ALB-WK-GAT-1500','Whiskas Gato Adulto 1,5 kg','Alimento seco para gatos adultos. Bolsa de 1,5 kg.','Alimentos / Gato',8900,6500,14,5,'un',null),
('vipvet','ALB-WK-SAC-85','Whiskas sachet 85 g','Alimento húmedo en sobre, 85 g. Se vende por unidad.','Alimentos / Gato',1350,950,48,12,'un',15),

-- ── ALIMENTOS · CACHORROS / LACTANCIA ───────────────────────────────────────
('vipvet','ALB-SUS-LAC-500','Sustituto lácteo para cachorros 500 g','Leche maternizada en polvo para cachorros huérfanos o en destete. Pote 500 g.','Alimentos / Cachorros',18500,13500,6,2,'un',null),
('vipvet','ALB-SUS-LAC-200','Sustituto lácteo para cachorros 200 g','Leche maternizada en polvo. Pote 200 g.','Alimentos / Cachorros',9200,6700,8,3,'un',null),
('vipvet','ALB-MAM-BIB','Mamadera con tetinas para cachorros','Kit de mamadera 60 ml con tetinas de repuesto.','Alimentos / Cachorros',6500,4500,7,2,'un',null),

-- ── SNACKS Y GOLOSINAS ──────────────────────────────────────────────────────
('vipvet','SNK-CC-HUE-15','Hueso de cuero crudo 15 cm','Hueso masticable de cuero crudo prensado, 15 cm. Unidad.','Snacks / Perro',2400,1650,40,10,'un',25),
('vipvet','SNK-CC-HUE-20','Hueso de cuero crudo 20 cm','Hueso masticable de cuero crudo prensado, 20 cm. Unidad.','Snacks / Perro',3600,2500,28,8,'un',20),
('vipvet','SNK-CC-NUD-10','Nudo de cuero crudo 10 cm','Nudo masticable de cuero crudo, 10 cm. Unidad.','Snacks / Perro',1500,1000,55,15,'un',50),
('vipvet','SNK-CC-TIR-100','Tiras de cuero crudo x 100 g','Tiras finas de cuero crudo para masticar. Paquete de 100 g.','Snacks / Perro',3200,2200,22,6,'un',null),
('vipvet','SNK-CC-GRANEL','Cuero crudo a granel','Snacks de cuero crudo surtidos, se venden por kilo.','Snacks / Granel',9800,7000,12,3,'kg',null),
('vipvet','SNK-BAR-PER-5','Barritas masticables perro x 5 u','Barritas blandas sabor carne. Paquete de 5 unidades.','Snacks / Perro',2900,2000,30,8,'un',null),
('vipvet','SNK-GOL-MIX-200','Golosinas surtidas x 200 g','Mix de galletitas y premios para entrenamiento. Paquete de 200 g.','Snacks / Perro',3400,2400,25,8,'un',null),
('vipvet','SNK-GOL-DEN','Snack dental para perro x 7 u','Barritas dentales que ayudan a reducir el sarro. Paquete de 7 unidades.','Snacks / Perro',5200,3700,18,6,'un',null),
('vipvet','SNK-WK-TEM-40','Whiskas Temptations 40 g','Snack crocante relleno para gatos. Paquete de 40 g.','Snacks / Gato',2800,2000,32,10,'un',12),
('vipvet','SNK-WK-TEM-85','Whiskas Temptations 85 g','Snack crocante relleno para gatos. Paquete de 85 g.','Snacks / Gato',4600,3300,20,6,'un',12),

-- ── PASEO · CORREAS DE NYLON ────────────────────────────────────────────────
('vipvet','PAS-COR-NY-ROJ','Correa de nylon roja 2 cm x 1,20 m','Correa de nylon reforzado con mosquetón metálico. Color rojo.','Paseo / Correas',6800,4600,6,2,'un',null),
('vipvet','PAS-COR-NY-AZU','Correa de nylon azul 2 cm x 1,20 m','Correa de nylon reforzado con mosquetón metálico. Color azul.','Paseo / Correas',6800,4600,7,2,'un',null),
('vipvet','PAS-COR-NY-NEG','Correa de nylon negra 2 cm x 1,20 m','Correa de nylon reforzado con mosquetón metálico. Color negro.','Paseo / Correas',6800,4600,8,2,'un',null),
('vipvet','PAS-COR-NY-VER','Correa de nylon verde 2 cm x 1,20 m','Correa de nylon reforzado con mosquetón metálico. Color verde.','Paseo / Correas',6800,4600,5,2,'un',null),
('vipvet','PAS-COR-NY-ROS','Correa de nylon rosa 2 cm x 1,20 m','Correa de nylon reforzado con mosquetón metálico. Color rosa.','Paseo / Correas',6800,4600,5,2,'un',null),
('vipvet','PAS-COR-NY-CEL','Correa de nylon celeste 2 cm x 1,20 m','Correa de nylon reforzado con mosquetón metálico. Color celeste.','Paseo / Correas',6800,4600,4,2,'un',null),
('vipvet','PAS-COR-NY-EXT','Correa extensible 5 m hasta 25 kg','Correa retráctil con traba y mango ergonómico. Hasta 25 kg.','Paseo / Correas',22000,15500,4,1,'un',null),

-- ── PASEO · CORREAS Y CADENAS ───────────────────────────────────────────────
('vipvet','PAS-COR-CAD-P','Correa de cadena chica','Correa de eslabones metálicos con manija de cuero. Perros chicos.','Paseo / Correas',7500,5200,4,2,'un',null),
('vipvet','PAS-COR-CAD-M','Correa de cadena mediana','Correa de eslabones metálicos con manija de cuero. Perros medianos.','Paseo / Correas',9200,6400,5,2,'un',null),
('vipvet','PAS-COR-CAD-G','Correa de cadena grande','Correa de eslabones metálicos reforzada. Perros grandes.','Paseo / Correas',11500,8000,4,2,'un',null),
('vipvet','PAS-CAD-ATA-3','Cadena para atar 3 m','Cadena galvanizada de 3 m con mosquetones en ambos extremos.','Paseo / Cadenas',12500,8800,3,1,'un',null),
('vipvet','PAS-CAD-ATA-5','Cadena para atar 5 m','Cadena galvanizada de 5 m con mosquetones en ambos extremos.','Paseo / Cadenas',18500,13000,3,1,'un',null),

-- ── PASEO · COLLARES ────────────────────────────────────────────────────────
('vipvet','PAS-COL-NY-P','Collar de nylon regulable chico','Collar de nylon con hebilla plástica y anilla. Cuello 20-30 cm.','Paseo / Collares',3800,2500,10,3,'un',null),
('vipvet','PAS-COL-NY-M','Collar de nylon regulable mediano','Collar de nylon con hebilla plástica y anilla. Cuello 30-45 cm.','Paseo / Collares',4400,2900,12,3,'un',null),
('vipvet','PAS-COL-NY-G','Collar de nylon regulable grande','Collar de nylon reforzado con hebilla y anilla. Cuello 45-65 cm.','Paseo / Collares',5200,3500,9,3,'un',null),
('vipvet','PAS-COL-CAD-AHO','Collar de cadena tipo ahorque','Collar de eslabones metálicos para adiestramiento.','Paseo / Collares',5800,4000,6,2,'un',null),
('vipvet','PAS-COL-GAT-CAS','Collar para gato con cascabel','Collar de nylon con hebilla de seguridad y cascabel.','Paseo / Collares',2900,1900,14,4,'un',null),

-- ── PASEO · ARNESES Y PECHERAS ──────────────────────────────────────────────
('vipvet','PAS-ARN-NY-P','Arnés de nylon chico','Arnés en H regulable de nylon. Perros hasta 8 kg.','Paseo / Pecheras',7900,5400,6,2,'un',null),
('vipvet','PAS-ARN-NY-M','Arnés de nylon mediano','Arnés en H regulable de nylon. Perros de 8 a 20 kg.','Paseo / Pecheras',9500,6500,7,2,'un',null),
('vipvet','PAS-ARN-NY-G','Arnés de nylon grande','Arnés en H regulable de nylon reforzado. Perros de más de 20 kg.','Paseo / Pecheras',11800,8200,5,2,'un',null),
('vipvet','PAS-PEC-ACO-M','Pechera acolchada mediana','Pechera tipo chaleco con acolchado interior. Perros medianos.','Paseo / Pecheras',14500,10000,4,2,'un',null),
('vipvet','PAS-PEC-REF-M','Pechera reflectiva mediana','Pechera con bandas reflectivas para paseos nocturnos. Talle M.','Paseo / Pecheras',15900,11000,4,2,'un',null),
('vipvet','PAS-PEC-REF-G','Pechera reflectiva grande','Pechera con bandas reflectivas para paseos nocturnos. Talle G.','Paseo / Pecheras',17500,12200,3,1,'un',null),

-- ── COMEDEROS Y BEBEDEROS · PLÁSTICO ────────────────────────────────────────
('vipvet','COM-PLA-VER','Plato plástico verde 500 ml','Comedero plástico resistente con base antideslizante. Color verde.','Comederos / Plástico',2600,1700,12,4,'un',24),
('vipvet','COM-PLA-ROJ','Plato plástico rojo 500 ml','Comedero plástico resistente con base antideslizante. Color rojo.','Comederos / Plástico',2600,1700,12,4,'un',24),
('vipvet','COM-PLA-AZU','Plato plástico azul 500 ml','Comedero plástico resistente con base antideslizante. Color azul.','Comederos / Plástico',2600,1700,14,4,'un',24),
('vipvet','COM-PLA-AMA','Plato plástico amarillo 500 ml','Comedero plástico resistente con base antideslizante. Color amarillo.','Comederos / Plástico',2600,1700,10,4,'un',24),
('vipvet','COM-PLA-VIO','Plato plástico violeta 500 ml','Comedero plástico resistente con base antideslizante. Color violeta.','Comederos / Plástico',2600,1700,9,4,'un',24),
('vipvet','COM-PLA-DOB','Comedero doble plástico','Bandeja con dos recipientes: uno para alimento y otro para agua.','Comederos / Plástico',6900,4700,6,2,'un',null),
('vipvet','COM-PLA-1000','Plato plástico grande 1 L','Comedero plástico de 1 litro para perros grandes. Colores surtidos.','Comederos / Plástico',3900,2600,8,3,'un',12),

-- ── COMEDEROS Y BEBEDEROS · ACERO INOXIDABLE ────────────────────────────────
('vipvet','COM-ACE-12','Bowl de acero inoxidable 12 cm','Comedero de acero inoxidable, diámetro 12 cm. Ideal gatos y cachorros.','Comederos / Acero',4200,2800,10,3,'un',null),
('vipvet','COM-ACE-16','Bowl de acero inoxidable 16 cm','Comedero de acero inoxidable, diámetro 16 cm. Perros chicos.','Comederos / Acero',5800,3900,9,3,'un',null),
('vipvet','COM-ACE-20','Bowl de acero inoxidable 20 cm','Comedero de acero inoxidable, diámetro 20 cm. Perros medianos.','Comederos / Acero',7900,5400,7,2,'un',null),
('vipvet','COM-ACE-24','Bowl de acero inoxidable 24 cm','Comedero de acero inoxidable, diámetro 24 cm. Perros grandes.','Comederos / Acero',10500,7200,5,2,'un',null),
('vipvet','COM-ACE-ANT-18','Bowl de acero con base antideslizante 18 cm','Comedero de acero inoxidable con aro de goma en la base. 18 cm.','Comederos / Acero',9200,6300,6,2,'un',null),
('vipvet','COM-BEB-AUT-2','Bebedero automático 2 L','Dispensador de agua por gravedad, capacidad 2 litros.','Comederos / Bebederos',12500,8600,4,2,'un',null),

-- ── CAMAS Y DESCANSO ────────────────────────────────────────────────────────
('vipvet','DES-COL-CH','Colchoneta acolchada chica 50x40 cm','Colchoneta con relleno de vellón y funda lavable. Diseños surtidos.','Descanso / Colchonetas',13500,9200,5,2,'un',null),
('vipvet','DES-COL-ME','Colchoneta acolchada mediana 70x50 cm','Colchoneta con relleno de vellón y funda lavable. Diseños surtidos.','Descanso / Colchonetas',18900,13000,4,2,'un',null),
('vipvet','DES-COL-GR','Colchoneta acolchada grande 90x65 cm','Colchoneta con relleno de vellón y funda lavable. Diseños surtidos.','Descanso / Colchonetas',26500,18500,3,1,'un',null),
('vipvet','DES-ALM-RED-ME','Almohadón redondo mediano 60 cm','Almohadón circular con borde elevado. Diseños surtidos.','Descanso / Colchonetas',21000,14500,3,1,'un',null),
('vipvet','DES-CAM-IGL-CH','Cama tipo iglú chica','Cama cerrada tipo cueva para gatos y perros chicos.','Descanso / Camas',29500,20500,2,1,'un',null),
('vipvet','DES-MAN-POL','Manta polar para mascota 80x60 cm','Manta suave de polar, lavable. Colores surtidos.','Descanso / Mantas',7500,5000,8,3,'un',null),

-- ── HIGIENE · SHAMPOO Y COSMÉTICA ───────────────────────────────────────────
('vipvet','HIG-SHA-NEU-500','Shampoo neutro 500 ml','Shampoo de uso frecuente, pH neutro para perros y gatos. 500 ml.','Higiene / Shampoo',7200,4900,10,3,'un',12),
('vipvet','HIG-SHA-ANT-500','Shampoo antipulgas 500 ml','Shampoo con acción insecticida contra pulgas y garrapatas. 500 ml.','Higiene / Shampoo',9800,6800,8,3,'un',12),
('vipvet','HIG-SHA-BLA-500','Shampoo para pelo blanco 500 ml','Shampoo realzador de brillo para pelajes claros. 500 ml.','Higiene / Shampoo',8900,6100,6,2,'un',12),
('vipvet','HIG-SHA-CAC-250','Shampoo para cachorros 250 ml','Fórmula suave sin lágrimas para cachorros. 250 ml.','Higiene / Shampoo',6500,4400,7,3,'un',12),
('vipvet','HIG-ACO-500','Acondicionador para mascotas 500 ml','Acondicionador desenredante posterior al baño. 500 ml.','Higiene / Shampoo',8200,5600,5,2,'un',12),
('vipvet','HIG-COL-100','Colonia para mascotas 100 ml','Colonia suave sin alcohol para después del baño. 100 ml.','Higiene / Cosmética',5400,3600,9,3,'un',null),

-- ── HIGIENE · LIMPIEZA Y SANITARIOS ─────────────────────────────────────────
('vipvet','HIG-LIM-DES-1L','Eliminador de olores 1 L','Desinfectante y neutralizador de olores para ambientes con mascotas. 1 L.','Higiene / Limpieza',8600,5900,7,3,'un',null),
('vipvet','HIG-LIM-EDU-500','Educador sanitario en spray 500 ml','Spray que atrae a la mascota al lugar elegido para hacer sus necesidades.','Higiene / Limpieza',7400,5000,6,2,'un',null),
('vipvet','HIG-LIM-REP-500','Repelente educador "no aquí" 500 ml','Spray repelente para evitar que la mascota orine en un lugar. 500 ml.','Higiene / Limpieza',7400,5000,5,2,'un',null),
('vipvet','HIG-PAN-DOG-30','Paños Dog Pet tapa piso x 30 u','Paños absorbentes descartables para cachorros. Paquete de 30 unidades.','Higiene / Pañales',16500,11500,8,3,'un',null),
('vipvet','HIG-PAN-DOG-8','Paños Dog Pet tapa piso x 8 u','Paños absorbentes descartables para cachorros. Paquete de 8 unidades.','Higiene / Pañales',5900,4000,12,4,'un',null),
('vipvet','HIG-PAN-DES-M','Pañal descartable perro talle M x 10','Pañales descartables con cinta ajustable. Talle M, 10 unidades.','Higiene / Pañales',11500,8000,5,2,'un',null),
('vipvet','HIG-PAN-DES-G','Pañal descartable perro talle G x 10','Pañales descartables con cinta ajustable. Talle G, 10 unidades.','Higiene / Pañales',13200,9200,4,2,'un',null),
('vipvet','HIG-PIE-GAT-4','Piedras sanitarias para gato 4 kg','Piedras absorbentes aglutinantes para bandeja sanitaria. Bolsa de 4 kg.','Higiene / Gato',9500,6600,10,4,'un',null),
('vipvet','HIG-PIE-GAT-10','Piedras sanitarias para gato 10 kg','Piedras absorbentes aglutinantes para bandeja sanitaria. Bolsa de 10 kg.','Higiene / Gato',20500,14300,5,2,'un',null),
('vipvet','HIG-BAN-GAT','Bandeja sanitaria para gato con borde','Bandeja plástica con borde alto y pala incluida.','Higiene / Gato',11900,8200,4,2,'un',null),

-- ── HIGIENE · CUIDADO ───────────────────────────────────────────────────────
('vipvet','HIG-CEP-DIE','Cepillo dental con pasta','Kit de cepillo dental y pasta dentífrica sabor carne para mascotas.','Higiene / Cuidado',6800,4600,6,2,'un',null),
('vipvet','HIG-CEP-PEL-M','Cepillo para pelo mediano','Cepillo de cerdas metálicas con puntas protegidas.','Higiene / Cuidado',5900,4000,7,3,'un',null),
('vipvet','HIG-COR-UNA','Corta uñas para mascotas','Alicate corta uñas de acero con tope de seguridad.','Higiene / Cuidado',7200,4900,5,2,'un',null),

-- ── JUGUETES ────────────────────────────────────────────────────────────────
('vipvet','JUG-PEL-CHI','Pelota de goma chica','Pelota de goma maciza, 5 cm. Colores surtidos.','Juguetes / Perro',2200,1400,20,6,'un',36),
('vipvet','JUG-PEL-MED','Pelota de goma mediana','Pelota de goma maciza, 7 cm. Colores surtidos.','Juguetes / Perro',3100,2000,18,6,'un',24),
('vipvet','JUG-PEL-GRA','Pelota de goma grande','Pelota de goma maciza, 9 cm. Colores surtidos.','Juguetes / Perro',4300,2900,12,4,'un',24),
('vipvet','JUG-PEL-SON','Pelota con chifle','Pelota de goma con sonido al morder. Colores surtidos.','Juguetes / Perro',3800,2500,15,5,'un',24),
('vipvet','JUG-PEL-TEN-3','Pelotas de tenis x 3','Pack de 3 pelotas de tenis para perros.','Juguetes / Perro',5600,3800,10,4,'un',null),
('vipvet','JUG-GOM-HUE','Hueso de goma','Hueso de goma resistente para morder. Colores surtidos.','Juguetes / Perro',4500,3000,14,5,'un',24),
('vipvet','JUG-GOM-MOR','Mordillo de goma','Mordillo dentado de goma flexible. Colores surtidos.','Juguetes / Perro',3900,2600,16,5,'un',24),
('vipvet','JUG-SOG-NUD','Soga con nudos','Soga de algodón trenzado con nudos en los extremos.','Juguetes / Perro',4100,2700,13,5,'un',null),
('vipvet','JUG-PEL-COL','Peluche con sonido colgante','Peluche con chifle para exhibidor. Modelos surtidos.','Juguetes / Perro',5200,3500,18,6,'un',null),
('vipvet','JUG-GAT-RAT-2','Ratón de peluche para gato x 2','Pack de 2 ratones de peluche con catnip.','Juguetes / Gato',3200,2100,14,5,'un',null),
('vipvet','JUG-GAT-VAR','Varita con plumas para gato','Caña de juego con plumas y cascabel.','Juguetes / Gato',4600,3100,11,4,'un',null),
('vipvet','JUG-GAT-PEL-3','Pelotas con cascabel para gato x 3','Pack de 3 pelotitas livianas con cascabel.','Juguetes / Gato',2800,1800,16,5,'un',null),

-- ── ACCESORIOS ──────────────────────────────────────────────────────────────
('vipvet','ACC-RAS-GAT-CH','Rascador para gato chico','Rascador de cartón corrugado con base. 40 cm.','Accesorios / Gato',12500,8600,4,2,'un',null),
('vipvet','ACC-RAS-GAT-TOR','Rascador torre para gato','Torre rascadora de sisal con plataformas y cucha. 90 cm.','Accesorios / Gato',68000,48000,2,1,'un',null),
('vipvet','ACC-JAU-PAJ-CH','Jaula tipo pajarera chica','Jaula metálica para aves pequeñas con comederos y palo. 25x25x35 cm.','Accesorios / Jaulas',24500,17000,3,1,'un',null),
('vipvet','ACC-JAU-PAJ-ME','Jaula tipo pajarera mediana','Jaula metálica para aves con bandeja extraíble. 35x30x45 cm.','Accesorios / Jaulas',36500,25500,2,1,'un',null),
('vipvet','ACC-REC-API-3','Recipientes plásticos apilables x 3','Set de 3 recipientes herméticos apilables para guardar alimento. Colores surtidos.','Accesorios / Varios',15900,11000,5,2,'un',null),
('vipvet','ACC-REC-HER-5','Recipiente hermético para alimento 5 kg','Contenedor plástico con tapa a presión para 5 kg de balanceado.','Accesorios / Varios',18500,12800,4,2,'un',null),
('vipvet','ACC-TRA-MAS-CH','Transportadora chica','Transportadora plástica con puerta metálica. Hasta 8 kg.','Accesorios / Varios',34500,24000,3,1,'un',null),

-- ── VETERINARIA · ANTIPARASITARIOS ──────────────────────────────────────────
('vipvet','VET-API-PER-10','Antiparasitario interno perro hasta 10 kg','Comprimido antiparasitario de amplio espectro. Dosis para perros de hasta 10 kg.','Veterinaria / Antiparasitarios',4800,3200,25,8,'un',null),
('vipvet','VET-API-PER-25','Antiparasitario interno perro hasta 25 kg','Comprimido antiparasitario de amplio espectro. Dosis para perros de hasta 25 kg.','Veterinaria / Antiparasitarios',7200,4900,20,6,'un',null),
('vipvet','VET-API-PER-50','Antiparasitario interno perro hasta 50 kg','Comprimido antiparasitario de amplio espectro. Dosis para perros de hasta 50 kg.','Veterinaria / Antiparasitarios',10500,7200,12,4,'un',null),
('vipvet','VET-API-GAT','Antiparasitario interno gato','Comprimido antiparasitario de amplio espectro para gatos.','Veterinaria / Antiparasitarios',5400,3600,18,6,'un',null),
('vipvet','VET-PIP-PER-CH','Pipeta antipulgas perro chico','Pipeta de aplicación externa contra pulgas y garrapatas. Perros hasta 10 kg.','Veterinaria / Antiparasitarios',8900,6100,15,5,'un',null),
('vipvet','VET-PIP-PER-ME','Pipeta antipulgas perro mediano','Pipeta de aplicación externa contra pulgas y garrapatas. Perros de 10 a 25 kg.','Veterinaria / Antiparasitarios',10500,7200,14,5,'un',null),
('vipvet','VET-PIP-PER-GR','Pipeta antipulgas perro grande','Pipeta de aplicación externa contra pulgas y garrapatas. Perros de más de 25 kg.','Veterinaria / Antiparasitarios',12800,8800,10,4,'un',null),
('vipvet','VET-PIP-GAT','Pipeta antipulgas gato','Pipeta de aplicación externa contra pulgas para gatos.','Veterinaria / Antiparasitarios',8200,5600,12,4,'un',null),
('vipvet','VET-COL-ANT-P','Collar antipulgas perro','Collar de liberación prolongada contra pulgas y garrapatas.','Veterinaria / Antiparasitarios',15500,10800,8,3,'un',null),
('vipvet','VET-COL-ANT-G','Collar antipulgas gato','Collar de liberación prolongada contra pulgas para gatos.','Veterinaria / Antiparasitarios',13200,9200,7,3,'un',null),

-- ── VETERINARIA · VACUNAS (requieren cadena de frío) ────────────────────────
('vipvet','VET-VAC-QUI','Vacuna quíntuple canina (dosis)','Dosis de vacuna quíntuple para caninos. Conservar refrigerada entre 2 y 8 °C.','Veterinaria / Vacunas',14500,9800,10,4,'un',null),
('vipvet','VET-VAC-SEX','Vacuna séxtuple canina (dosis)','Dosis de vacuna séxtuple para caninos. Conservar refrigerada entre 2 y 8 °C.','Veterinaria / Vacunas',17500,12000,8,3,'un',null),
('vipvet','VET-VAC-ANT','Vacuna antirrábica (dosis)','Dosis de vacuna antirrábica para caninos y felinos. Conservar refrigerada.','Veterinaria / Vacunas',9800,6500,14,5,'un',null),
('vipvet','VET-VAC-TRI-GAT','Vacuna triple felina (dosis)','Dosis de vacuna triple para felinos. Conservar refrigerada entre 2 y 8 °C.','Veterinaria / Vacunas',16800,11500,7,3,'un',null),

-- ── VETERINARIA · OTROS ─────────────────────────────────────────────────────
('vipvet','VET-CUR-HER-100','Cicatrizante en spray 100 ml','Spray cicatrizante y repelente de moscas para heridas superficiales.','Veterinaria / Curaciones',9500,6500,8,3,'un',null),
('vipvet','VET-CUR-GAS','Gasas y vendas — kit de curación','Kit con gasas estériles, venda autoadhesiva y antiséptico.','Veterinaria / Curaciones',7800,5300,6,2,'un',null),
('vipvet','VET-VIT-SUP-60','Suplemento vitamínico x 60 comprimidos','Complejo vitamínico y mineral para perros y gatos. 60 comprimidos.','Veterinaria / Suplementos',13500,9300,6,2,'un',null),
('vipvet','VET-CON-ART-60','Condroprotector x 60 comprimidos','Suplemento para articulaciones con condroitina y glucosamina. 60 comprimidos.','Veterinaria / Suplementos',24500,17000,4,2,'un',null),

-- ── SERVICIOS (no llevan stock) ─────────────────────────────────────────────
('vipvet','SRV-APL-VAC','Aplicación de vacuna','Aplicación de la dosis por el profesional. La vacuna se cobra aparte.','Servicios',5000,0,0,0,'un',null),
('vipvet','SRV-BAN-CH','Baño perro chico','Baño completo con secado y perfume. Perros de hasta 10 kg.','Servicios',12000,0,0,0,'un',null),
('vipvet','SRV-BAN-ME','Baño perro mediano','Baño completo con secado y perfume. Perros de 10 a 25 kg.','Servicios',16000,0,0,0,'un',null),
('vipvet','SRV-BAN-GR','Baño perro grande','Baño completo con secado y perfume. Perros de más de 25 kg.','Servicios',21000,0,0,0,'un',null),
('vipvet','SRV-COR-UNA','Corte de uñas','Corte y limado de uñas.','Servicios',4500,0,0,0,'un',null),
('vipvet','SRV-CON-VET','Consulta veterinaria','Consulta clínica general.','Servicios',18000,0,0,0,'un',null)

-- Re-ejecutar el script no pisa nada: solo agrega los códigos que falten.
on conflict (tenant_id, codigo) where codigo is not null and codigo <> ''
do nothing;

-- ============================================================================
-- 3. SERVICIOS: no llevan stock
-- ============================================================================

update public.productos
  set controla_stock = false, costo = null
  where tenant_id = 'vipvet' and categoria = 'Servicios';

-- ============================================================================
-- 4. VENCIMIENTOS
-- Solo lo que realmente vence: vacunas, medicamentos y lácteos.
-- Fechas relativas a hoy, así el seed no queda viejo.
-- ============================================================================

update public.productos set fecha_vencimiento = current_date + interval '20 days'
  where tenant_id = 'vipvet' and codigo = 'VET-VAC-ANT';       -- vence pronto: aparece en el aviso
update public.productos set fecha_vencimiento = current_date + interval '4 months'
  where tenant_id = 'vipvet' and codigo in ('VET-VAC-QUI','VET-VAC-SEX','VET-VAC-TRI-GAT');
update public.productos set fecha_vencimiento = current_date + interval '8 months'
  where tenant_id = 'vipvet' and categoria = 'Veterinaria / Antiparasitarios';
update public.productos set fecha_vencimiento = current_date + interval '6 months'
  where tenant_id = 'vipvet' and categoria = 'Alimentos / Cachorros';
update public.productos set fecha_vencimiento = current_date + interval '10 months'
  where tenant_id = 'vipvet' and categoria in ('Veterinaria / Curaciones','Veterinaria / Suplementos');

-- ============================================================================
-- 5. OFERTAS DE EJEMPLO
-- Una de cada tipo, para que se vea cómo funcionan los tres modos.
-- ============================================================================

-- Monto fijo: $6.000 off en el Pro Plan grande
update public.productos
  set oferta_activa = true, oferta_tipo = 'monto', oferta_valor = 6000
  where tenant_id = 'vipvet' and codigo = 'ALB-PP-ADU-15';

-- Porcentaje: 15% off en shampoo antipulgas
update public.productos
  set oferta_activa = true, oferta_tipo = 'porcentaje', oferta_valor = 15
  where tenant_id = 'vipvet' and codigo = 'HIG-SHA-ANT-500';

-- Combo 3x: tres huesos de cuero crudo de 15 cm por $6.000 (en vez de $7.200)
update public.productos
  set oferta_activa = true, oferta_tipo = 'combo', oferta_valor = 6000, oferta_cantidad = 3
  where tenant_id = 'vipvet' and codigo = 'SNK-CC-HUE-15';

-- Combo 2x1: llevás dos pelotas chicas, pagás una
update public.productos
  set oferta_activa = true, oferta_tipo = 'combo', oferta_valor = 2200, oferta_cantidad = 2
  where tenant_id = 'vipvet' and codigo = 'JUG-PEL-CHI';

-- ============================================================================
-- 6. FOTOS  (opcional — ver la nota de abajo)
--
-- Este bloque NO inventa URLs de internet: arma la URL pública del bucket de
-- Storage a partir del código del producto. Para que las fotos se vean hay que
-- subir los archivos a:   veterinarias/vipvet/productos/<CODIGO>.jpg
--
-- Poné abajo la URL de tu proyecto (Supabase → Settings → API → Project URL)
-- y descomentá el update. Si lo dejás vacío, los productos quedan sin foto y
-- la app muestra un ícono en su lugar.
-- ============================================================================

do $$
declare
  -- Ej: 'https://abcdefghijkl.supabase.co'
  v_proyecto text := '';
begin
  if v_proyecto = '' then
    raise notice 'Fotos omitidas: completá v_proyecto en el bloque 6 si querés cargarlas.';
    return;
  end if;

  update public.productos
    set imagen_url = v_proyecto
      || '/storage/v1/object/public/veterinarias/vipvet/productos/'
      || codigo || '.jpg'
    where tenant_id = 'vipvet' and imagen_url is null;
end $$;

-- ============================================================================
-- 7. RESUMEN
-- ============================================================================

select
  categoria,
  count(*)                                          as productos,
  count(*) filter (where oferta_activa)             as en_oferta,
  count(*) filter (where fecha_vencimiento is not null) as con_vencimiento
from public.productos
where tenant_id = 'vipvet'
group by categoria
order by categoria;
