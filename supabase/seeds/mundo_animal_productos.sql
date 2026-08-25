-- ============================================================================
-- Seed de productos — Mundo Animal: 10 alimentos, 10 medicamentos (con
-- vencimiento) y 10 accesorios, para probar el módulo de Productos/POS.
-- ============================================================================

-- 1. Alimentos
insert into public.productos (tenant_id, nombre, descripcion, categoria, precio, costo, stock, stock_minimo, unidad)
values
  ('mundo-animal', 'Royal Canin Adulto 15kg',      'Alimento balanceado perro adulto raza mediana', 'Alimento / Perro', 68000, 48000, 12, 3, 'un'),
  ('mundo-animal', 'Royal Canin Cachorro 15kg',     'Alimento balanceado cachorro',                  'Alimento / Perro', 71000, 50000, 8,  3, 'un'),
  ('mundo-animal', 'Pro Plan Gato Adulto 7.5kg',    'Alimento balanceado gato adulto',                'Alimento / Gato',  42000, 29000, 10, 3, 'un'),
  ('mundo-animal', 'Pro Plan Gatito 7.5kg',         'Alimento balanceado gatitos',                    'Alimento / Gato',  44000, 31000, 6,  2, 'un'),
  ('mundo-animal', 'Dog Chow Adulto 21kg',          'Alimento económico perro adulto',                'Alimento / Perro', 39000, 27000, 15, 4, 'un'),
  ('mundo-animal', 'Cat Chow Adulto 8kg',           'Alimento económico gato adulto',                 'Alimento / Gato',  27000, 18500, 9,  3, 'un'),
  ('mundo-animal', 'Alimento suelto perro x kg',    'Balanceado a granel para perro',                 'Alimento / Perro', 2600,  1700,  85, 15,'kg'),
  ('mundo-animal', 'Alimento suelto gato x kg',     'Balanceado a granel para gato',                  'Alimento / Gato',  3100,  2050,  60, 15,'kg'),
  ('mundo-animal', 'Heno de alfalfa 1kg',           'Alimento para conejos y roedores',                'Alimento / Otros', 3800,  2400,  20, 5, 'un'),
  ('mundo-animal', 'Mix de semillas para aves 500g','Alimento para aves ornamentales',                 'Alimento / Otros', 2900,  1900,  18, 5, 'un')
on conflict do nothing;

-- 2. Medicamentos (todos con fecha de vencimiento)
insert into public.productos (tenant_id, nombre, descripcion, categoria, precio, costo, stock, stock_minimo, unidad, fecha_vencimiento)
values
  ('mundo-animal', 'Meloxicam 15mg x10 comp.',        'Antiinflamatorio no esteroideo',       'Medicamento', 5200,  3400, 25, 5, 'un', '2027-03-15'),
  ('mundo-animal', 'Amoxicilina 500mg x10 comp.',     'Antibiótico de amplio espectro',       'Medicamento', 6100,  4000, 30, 5, 'un', '2026-11-30'),
  ('mundo-animal', 'Drontal Plus (antiparasitario)',  'Antiparasitario interno perro',        'Medicamento', 4300,  2800, 40, 8, 'un', '2027-06-01'),
  ('mundo-animal', 'Pipeta antipulgas perro 10-25kg', 'Antiparasitario externo',              'Medicamento', 8900,  6100, 22, 5, 'un', '2026-09-20'),
  ('mundo-animal', 'Pipeta antipulgas gato',          'Antiparasitario externo felino',       'Medicamento', 7600,  5200, 18, 5, 'un', '2026-09-20'),
  ('mundo-animal', 'Suero fisiológico 500ml',         'Solución para lavajes e hidratación',  'Medicamento', 3200,  2100, 15, 4, 'un', '2028-01-10'),
  ('mundo-animal', 'Protector gástrico (Omeprazol)',  'Para gastritis y protección digestiva','Medicamento', 4700,  3100, 20, 5, 'un', '2026-12-05'),
  ('mundo-animal', 'Vacuna Séxtuple canina',          'Refuerzo anual perro',                 'Medicamento', 9800,  6900, 14, 4, 'un', '2026-10-12'),
  ('mundo-animal', 'Vacuna Triple felina',            'Refuerzo anual gato',                  'Medicamento', 9200,  6400, 12, 4, 'un', '2026-10-12'),
  ('mundo-animal', 'Antihistamínico (Cetirizina)',    'Para alergias y dermatitis',            'Medicamento', 3900,  2500, 16, 4, 'un', '2027-02-28')
on conflict do nothing;

-- 3. Accesorios
insert into public.productos (tenant_id, nombre, descripcion, categoria, precio, costo, stock, stock_minimo, unidad)
values
  ('mundo-animal', 'Correa reforzada 1.5m',       'Correa nylon reforzado, todos los tamaños', 'Accesorio', 8500,  5200, 15, 4, 'un'),
  ('mundo-animal', 'Collar antipulgas perro',     'Collar repelente 8 meses de duración',       'Accesorio', 6200,  3900, 20, 5, 'un'),
  ('mundo-animal', 'Cucha mediana acolchada',     'Cucha para perros medianos',                  'Accesorio', 24000, 16000, 6,  2, 'un'),
  ('mundo-animal', 'Arenero para gatos',          'Arenero plástico con bordes altos',           'Accesorio', 12500, 8200,  9,  3, 'un'),
  ('mundo-animal', 'Transportadora chica',        'Transportadora plástica hasta 8kg',           'Accesorio', 32000, 22000, 5,  2, 'un'),
  ('mundo-animal', 'Comedero doble acero',        'Comedero + bebedero acero inoxidable',        'Accesorio', 9800,  6100, 14, 4, 'un'),
  ('mundo-animal', 'Rascador para gatos',          'Rascador con poste de sisal',                  'Accesorio', 18500, 12500, 7,  2, 'un'),
  ('mundo-animal', 'Juguete mordillo perro',       'Juguete de goma resistente',                   'Accesorio', 4200,  2600, 25, 6, 'un'),
  ('mundo-animal', 'Shampoo dermatológico 250ml',  'Shampoo para pieles sensibles',                'Accesorio', 7900,  5000, 12, 4, 'un'),
  ('mundo-animal', 'Jaula para ave mediana',       'Jaula con comedero y percha',                  'Accesorio', 28500, 19000, 4,  2, 'un')
on conflict do nothing;

-- Verificación
select categoria, count(*), sum(stock) as stock_total
from public.productos where tenant_id = 'mundo-animal'
group by categoria order by categoria;
