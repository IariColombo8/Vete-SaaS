-- ============================================================================
-- 011 — Trial de 10 días + datos de demo al registrarse
--
-- 1. `tenants.trial_expires_at`: fecha de vencimiento del trial. NULL = sin
--    trial (plan pagado o Básico gratis de siempre).
-- 2. `crear_veterinaria` acepta `p_datos->>'trial_dias'` y calcula el
--    vencimiento en el mismo insert que da de alta el tenant.
-- 3. `seed_demo_data(p_tenant_id)`: carga turnos/productos/ventas de ejemplo.
--    security definer porque inserta en `ventas`/`venta_items`, que no tienen
--    policy de INSERT para el cliente (solo se escriben vía RPC, igual que
--    `registrar_venta`).
--
-- Requiere haber corrido antes `schema.sql`, `003_registro_veterinaria.sql`,
-- `004_productos.sql` y `005_ventas.sql`. Idempotente.
-- ============================================================================

alter table public.tenants add column if not exists trial_expires_at timestamptz;

-- ----------------------------------------------------------------------------
-- 1. `crear_veterinaria`: agrega trial_expires_at al insert
-- ----------------------------------------------------------------------------
create or replace function public.crear_veterinaria(
  p_slug   text,
  p_datos  jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NO_AUTENTICADO';
  end if;

  if p_slug is null or btrim(p_slug) = '' then
    raise exception 'SLUG_INVALIDO';
  end if;

  if exists (select 1 from public.tenants where slug = p_slug) then
    raise exception 'SLUG_TAKEN';
  end if;

  insert into public.tenants (
    slug, nombre, plan, status,
    telefono, email, direccion, ciudad, admin_ids, trial_expires_at
  ) values (
    p_slug,
    nullif(p_datos->>'nombre', ''),
    coalesce((p_datos->>'plan')::tenant_plan, 'basico'),
    'activo',
    p_datos->>'telefono',
    p_datos->>'email',
    p_datos->>'direccion',
    p_datos->>'ciudad',
    coalesce(p_datos->'admin_ids', to_jsonb(array[v_uid::text])),
    case when nullif(p_datos->>'trial_dias', '') is not null
         then now() + ((p_datos->>'trial_dias')::int || ' days')::interval
         else null end
  );

  insert into public.turno_config (tenant_id) values (p_slug)
  on conflict (tenant_id) do nothing;

  update public.usuarios
     set role = 'veterinario', tenant_id = p_slug
   where id = v_uid;

  return p_slug;
end $$;

grant execute on function public.crear_veterinaria(text, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. `seed_demo_data`: turno_config, clientes/mascotas/turnos, productos, ventas
-- ----------------------------------------------------------------------------
create or replace function public.seed_demo_data(
  p_tenant_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cli1 uuid; v_masc1 uuid;
  v_cli2 uuid; v_masc2 uuid;
  v_cli3 uuid; v_masc3 uuid;
  v_prod1 uuid; v_prod2 uuid; v_prod3 uuid; v_prod4 uuid;
  v_prod5 uuid; v_prod6 uuid; v_prod7 uuid; v_prod8 uuid;
  v_venta1 uuid; v_venta2 uuid; v_venta3 uuid;
  v_turno_pasado uuid;
begin
  if not exists (select 1 from public.tenants where slug = p_tenant_id) then
    raise exception 'La veterinaria % no existe', p_tenant_id;
  end if;

  -- turno_config: mascotas, servicios, vacunas
  update public.turno_config set
    mascotas = '[
      {"id":"perro","emoji":"🐶","nombre":"Perro"},
      {"id":"gato","emoji":"🐱","nombre":"Gato"}
    ]'::jsonb,
    servicios = '[
      {"id":"consulta","emoji":"🩺","nombre":"Consulta general","descripcion":"Revisión clínica de rutina","duracionMin":30},
      {"id":"vacunacion","emoji":"💉","nombre":"Vacunación","descripcion":"Aplicación de vacunas","duracionMin":20},
      {"id":"peluqueria","emoji":"✂️","nombre":"Peluquería","descripcion":"Baño y corte","duracionMin":60},
      {"id":"cirugia","emoji":"🏥","nombre":"Cirugía","descripcion":"Procedimientos quirúrgicos","duracionMin":90}
    ]'::jsonb,
    vacunas = '{
      "perro":[{"id":"rabia","nombre":"Antirrábica"},{"id":"quintuple","nombre":"Quíntuple"}],
      "gato":[{"id":"triple","nombre":"Triple felina"}]
    }'::jsonb
  where tenant_id = p_tenant_id;

  -- clientes + mascotas
  insert into public.clientes (tenant_id, nombre, telefono, email, dni, domicilio)
    values (p_tenant_id, 'Juan Pérez', '11-5555-0001', 'juan.perez@demo.com', '30111222', 'Av. Siempre Viva 123')
    returning id into v_cli1;
  insert into public.mascotas (tenant_id, cliente_id, nombre, tipo, edad, raza, peso, slug)
    values (p_tenant_id, v_cli1, 'Firulais', 'Perro', '3 años', 'Labrador', '28 kg', 'firulais-perro')
    returning id into v_masc1;

  insert into public.clientes (tenant_id, nombre, telefono, email, dni, domicilio)
    values (p_tenant_id, 'María Gómez', '11-5555-0002', 'maria.gomez@demo.com', '30222333', 'Belgrano 456')
    returning id into v_cli2;
  insert into public.mascotas (tenant_id, cliente_id, nombre, tipo, edad, raza, peso, slug)
    values (p_tenant_id, v_cli2, 'Michi', 'Gato', '2 años', 'Siamés', '4 kg', 'michi-gato')
    returning id into v_masc2;

  insert into public.clientes (tenant_id, nombre, telefono, email, dni, domicilio)
    values (p_tenant_id, 'Carlos Ruiz', '11-5555-0003', 'carlos.ruiz@demo.com', '30333444', 'San Martín 789')
    returning id into v_cli3;
  insert into public.mascotas (tenant_id, cliente_id, nombre, tipo, edad, raza, peso, slug)
    values (p_tenant_id, v_cli3, 'Toby', 'Perro', '5 años', 'Beagle', '15 kg', 'toby-perro')
    returning id into v_masc3;

  -- turno pasado + historia clínica asociada
  insert into public.turnos (
    tenant_id, cliente_id, mascota_id, cliente_nombre, cliente_telefono, cliente_email,
    mascota_nombre, mascota_tipo, servicio, fecha, hora, turno_timestamp, duracion_min,
    estado, diagnostico, tratamiento
  ) values (
    p_tenant_id, v_cli1, v_masc1, 'Juan Pérez', '11-5555-0001', 'juan.perez@demo.com',
    'Firulais', 'Perro', 'Consulta general', current_date - 7, '10:00',
    (current_date - 7 + time '10:00')::timestamptz, 30, 'completado',
    'Chequeo de rutina sin novedades', 'Se indica continuar con dieta habitual'
  ) returning id into v_turno_pasado;

  insert into public.historias (
    tenant_id, mascota_id, fecha_atencion, motivo, diagnostico, tratamiento, tipo_visita, turno_id
  ) values (
    p_tenant_id, v_masc1, current_date - 7, 'Consulta de rutina',
    'Chequeo de rutina sin novedades', 'Se indica continuar con dieta habitual',
    'turno_programado', v_turno_pasado
  );

  -- turnos próximos
  insert into public.turnos (
    tenant_id, cliente_id, mascota_id, cliente_nombre, cliente_telefono, cliente_email,
    mascota_nombre, mascota_tipo, servicio, fecha, hora, turno_timestamp, duracion_min, estado
  ) values
  (p_tenant_id, v_cli2, v_masc2, 'María Gómez', '11-5555-0002', 'maria.gomez@demo.com',
   'Michi', 'Gato', 'Vacunación', current_date + 2, '11:30',
   (current_date + 2 + time '11:30')::timestamptz, 20, 'confirmado'),
  (p_tenant_id, v_cli3, v_masc3, 'Carlos Ruiz', '11-5555-0003', 'carlos.ruiz@demo.com',
   'Toby', 'Perro', 'Peluquería', current_date + 4, '15:00',
   (current_date + 4 + time '15:00')::timestamptz, 60, 'pendiente'),
  (p_tenant_id, v_cli1, v_masc1, 'Juan Pérez', '11-5555-0001', 'juan.perez@demo.com',
   'Firulais', 'Perro', 'Consulta general', current_date + 6, '09:00',
   (current_date + 6 + time '09:00')::timestamptz, 30, 'pendiente');

  -- productos
  insert into public.productos (tenant_id, nombre, descripcion, categoria, precio, costo, stock, stock_minimo, unidad, marca, linea, peso_kg)
    values (p_tenant_id, 'Royal Canin Adulto', 'Alimento balanceado para perros adultos', 'Alimentos / Perros', 45000, 32000, 20, 5, 'un', 'Royal Canin', 'Adulto', 15)
    returning id into v_prod1;
  insert into public.productos (tenant_id, nombre, descripcion, categoria, precio, costo, stock, stock_minimo, unidad, marca, linea, peso_kg)
    values (p_tenant_id, 'Cat Chow Adulto', 'Alimento balanceado para gatos adultos', 'Alimentos / Gatos', 18000, 12500, 15, 4, 'un', 'Cat Chow', 'Adulto', 8)
    returning id into v_prod2;
  insert into public.productos (tenant_id, nombre, descripcion, categoria, precio, costo, stock, stock_minimo, unidad, oferta_activa, oferta_tipo, oferta_valor)
    values (p_tenant_id, 'Antiparasitario Frontline', 'Pipeta antipulgas y garrapatas', 'Medicamentos', 8500, 5800, 12, 3, 'un', true, 'porcentaje', 15)
    returning id into v_prod3;
  insert into public.productos (tenant_id, nombre, descripcion, categoria, precio, costo, stock, stock_minimo, unidad)
    values (p_tenant_id, 'Shampoo antipulgas', 'Shampoo medicado 250ml', 'Higiene', 4200, 2600, 18, 4, 'un')
    returning id into v_prod4;
  insert into public.productos (tenant_id, nombre, descripcion, categoria, precio, costo, stock, stock_minimo, unidad)
    values (p_tenant_id, 'Correa reforzada', 'Correa de nylon 1.5m', 'Accesorios', 6500, 4000, 10, 2, 'un')
    returning id into v_prod5;
  insert into public.productos (tenant_id, nombre, descripcion, categoria, precio, costo, stock, stock_minimo, unidad)
    values (p_tenant_id, 'Collar isabelino', 'Collar de protección post-cirugía', 'Accesorios', 3800, 2200, 8, 2, 'un')
    returning id into v_prod6;
  insert into public.productos (tenant_id, nombre, descripcion, categoria, precio, costo, stock, stock_minimo, unidad)
    values (p_tenant_id, 'Arena sanitaria', 'Arena aglomerante 4kg', 'Higiene', 5200, 3400, 25, 6, 'un')
    returning id into v_prod7;
  insert into public.productos (tenant_id, nombre, descripcion, categoria, precio, costo, controla_stock, unidad)
    values (p_tenant_id, 'Baño y corte', 'Servicio de peluquería completo', 'Servicios', 9000, null, false, 'un')
    returning id into v_prod8;

  -- ventas ya cerradas, con detalle e impacto en stock (venta 1: prod1; venta 2: prod2+prod4; venta 3: prod3 con oferta 15%)
  insert into public.ventas (tenant_id, numero, cliente_id, cliente_nombre, cliente_telefono, medio_pago, subtotal, descuento, total, vendedor_nombre)
    values (p_tenant_id, 1, v_cli1, 'Juan Pérez', '11-5555-0001', 'efectivo', 45000, 0, 45000, 'Demo')
    returning id into v_venta1;
  insert into public.venta_items (venta_id, tenant_id, producto_id, nombre, marca, presentacion, unidad, cantidad, precio_unitario, subtotal)
    values (v_venta1, p_tenant_id, v_prod1, 'Royal Canin Adulto', 'Royal Canin', '15 kg', 'un', 1, 45000, 45000);

  insert into public.ventas (tenant_id, numero, cliente_id, cliente_nombre, cliente_telefono, medio_pago, subtotal, descuento, total, vendedor_nombre)
    values (p_tenant_id, 2, v_cli2, 'María Gómez', '11-5555-0002', 'debito', 22200, 0, 22200, 'Demo')
    returning id into v_venta2;
  insert into public.venta_items (venta_id, tenant_id, producto_id, nombre, marca, presentacion, unidad, cantidad, precio_unitario, subtotal)
    values
      (v_venta2, p_tenant_id, v_prod2, 'Cat Chow Adulto', 'Cat Chow', '8 kg', 'un', 1, 18000, 18000),
      (v_venta2, p_tenant_id, v_prod4, 'Shampoo antipulgas', '', '', 'un', 1, 4200, 4200);

  insert into public.ventas (tenant_id, numero, cliente_id, cliente_nombre, cliente_telefono, medio_pago, subtotal, descuento, total, vendedor_nombre)
    values (p_tenant_id, 3, v_cli3, 'Carlos Ruiz', '11-5555-0003', 'transferencia', 7225, 0, 7225, 'Demo')
    returning id into v_venta3;
  insert into public.venta_items (venta_id, tenant_id, producto_id, nombre, marca, presentacion, unidad, cantidad, precio_unitario, subtotal)
    values (v_venta3, p_tenant_id, v_prod3, 'Antiparasitario Frontline', '', '', 'un', 1, 7225, 7225);

  update public.productos set stock = stock - 1 where id in (v_prod1, v_prod2, v_prod3, v_prod4);

  insert into public.stock_movimientos (tenant_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia, usuario_nombre)
  values
    (p_tenant_id, v_prod1, 'venta', -1, 20, 19, 'Venta demo #1', 'Demo'),
    (p_tenant_id, v_prod2, 'venta', -1, 15, 14, 'Venta demo #2', 'Demo'),
    (p_tenant_id, v_prod4, 'venta', -1, 18, 17, 'Venta demo #2', 'Demo'),
    (p_tenant_id, v_prod3, 'venta', -1, 12, 11, 'Venta demo #3', 'Demo');
end $$;

grant execute on function public.seed_demo_data(text) to authenticated;
