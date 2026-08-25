# Demo gratis con trial Pro de 10 días — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al registrarse en `/registro`, cualquiera recibe automáticamente el plan Pro por 10 días con datos de ejemplo precargados (turnos, productos, ventas); al vencer el trial el panel pasa a solo lectura con un aviso para contactar a ServiTec.

**Architecture:** Una columna `trial_expires_at` en `tenants` + una función SQL `seed_demo_data` invocada una sola vez al registrarse. El vencimiento se calcula en el cliente (`getTrialStatus` en `lib/plans.ts`) y gatea la UI vía un `ReadOnlyContext` que envuelve el panel; los botones de mutación se deshabilitan cuando está vencido. `/superadmin` gana controles para extender o quitar el trial.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS + RPC en plpgsql), React Context, Vitest.

Spec de referencia: `docs/superpowers/specs/2026-08-25-demo-gratis-trial-pro-design.md`

---

### Task 1: Columna `trial_expires_at` + `crear_veterinaria` con soporte de trial

**Files:**
- Create: `supabase/011_trial_demo.sql`

- [ ] **Step 1: Escribir la migración — columna, `crear_veterinaria` actualizada y `seed_demo_data`**

```sql
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
```

- [ ] **Step 2: Correr la migración en Supabase**

Pegar el contenido completo de `supabase/011_trial_demo.sql` en Supabase
Dashboard → SQL Editor → New query, y ejecutar. Verificar que no tira error
(es idempotente, se puede re-correr).

- [ ] **Step 3: Verificar manualmente con una veterinaria de prueba**

En el SQL Editor:

```sql
select crear_veterinaria('demo-plan-test', '{"nombre":"Demo Plan Test","plan":"pro","trial_dias":"10"}'::jsonb);
select trial_expires_at, plan from tenants where slug = 'demo-plan-test';
select seed_demo_data('demo-plan-test');
select count(*) from turnos where tenant_id = 'demo-plan-test';        -- 4
select count(*) from productos where tenant_id = 'demo-plan-test';     -- 8
select count(*) from ventas where tenant_id = 'demo-plan-test';        -- 3
delete from tenants where slug = 'demo-plan-test'; -- limpieza (cascada)
```

Expected: `trial_expires_at` ≈ now() + 10 días, `plan = 'pro'`, y los 3
counts de arriba.

- [ ] **Step 4: Commit**

```bash
git add supabase/011_trial_demo.sql
git commit -m "feat: trial Pro de 10 dias y seed de datos demo al registrarse"
```

---

### Task 2: `TenantConfig.trialExpiresAt` en la capa de tipos y datos

**Files:**
- Modify: `lib/supabase/types.ts:100-127` (interface `TenantConfig`)
- Modify: `lib/supabase/tenants.ts:16-76` (`aConfig` / `aFila`)

- [ ] **Step 1: Agregar el campo al tipo**

En `lib/supabase/types.ts`, dentro de `TenantConfig` (después de la línea
`onboardingCompletado?: boolean`):

```ts
  onboardingCompletado?: boolean
  /** Vencimiento del trial de plan Pro. null/undefined = sin trial. */
  trialExpiresAt?: string | null
```

- [ ] **Step 2: Mapear la columna en `aConfig`**

En `lib/supabase/tenants.ts`, dentro de `aConfig` (después de la línea
`onboardingCompletado: (fila.onboarding_completado as boolean) ?? false,`):

```ts
    onboardingCompletado: (fila.onboarding_completado as boolean) ?? false,
    trialExpiresAt: (fila.trial_expires_at as string) ?? undefined,
```

- [ ] **Step 3: Mapear la columna en `aFila`**

En `lib/supabase/tenants.ts`, dentro del objeto `mapa` de `aFila` (después de
`onboardingCompletado: "onboarding_completado",`):

```ts
    onboardingCompletado: "onboarding_completado",
    trialExpiresAt: "trial_expires_at",
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `trialExpiresAt`.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/types.ts lib/supabase/tenants.ts
git commit -m "feat: mapear trialExpiresAt en TenantConfig"
```

---

### Task 3: `getTrialStatus` en `lib/plans.ts`

**Files:**
- Modify: `lib/plans.ts` (agregar al final del archivo)
- Modify: `lib/plans.test.ts` (agregar tests)

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `lib/plans.test.ts`:

```ts
import { getTrialStatus } from "./plans"

describe("getTrialStatus", () => {
  it("sin trial_expires_at: no está en trial", () => {
    const status = getTrialStatus({ plan: "basico", trialExpiresAt: undefined })
    expect(status).toEqual({ enTrial: false, vencido: false, diasRestantes: null })
  })

  it("con vencimiento futuro: en trial, no vencido", () => {
    const futuro = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
    const status = getTrialStatus({ plan: "pro", trialExpiresAt: futuro })
    expect(status.enTrial).toBe(true)
    expect(status.vencido).toBe(false)
    expect(status.diasRestantes).toBeGreaterThanOrEqual(4)
    expect(status.diasRestantes).toBeLessThanOrEqual(5)
  })

  it("con vencimiento pasado: en trial y vencido", () => {
    const pasado = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const status = getTrialStatus({ plan: "pro", trialExpiresAt: pasado })
    expect(status.enTrial).toBe(true)
    expect(status.vencido).toBe(true)
    expect(status.diasRestantes).toBe(0)
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run lib/plans.test.ts`
Expected: FAIL — `getTrialStatus` no está exportado de `./plans`.

- [ ] **Step 3: Implementar `getTrialStatus`**

Agregar al final de `lib/plans.ts`:

```ts
export interface TrialStatus {
  /** El tenant tiene un vencimiento de trial asignado. */
  enTrial: boolean
  /** enTrial && ya pasó la fecha. */
  vencido: boolean
  /** Días enteros restantes (0 si ya venció, null si no está en trial). */
  diasRestantes: number | null
}

/** Estado del trial de un tenant a partir de su `trialExpiresAt`. */
export function getTrialStatus(
  config: Pick<TenantConfig, "trialExpiresAt">,
): TrialStatus {
  if (!config.trialExpiresAt) {
    return { enTrial: false, vencido: false, diasRestantes: null }
  }

  const vencimiento = new Date(config.trialExpiresAt).getTime()
  const restanteMs = vencimiento - Date.now()
  const vencido = restanteMs <= 0
  const diasRestantes = vencido ? 0 : Math.ceil(restanteMs / (24 * 60 * 60 * 1000))

  return { enTrial: true, vencido, diasRestantes }
}
```

Y agregar el import de `TenantConfig` al principio del archivo si no está:

```ts
import type { TenantConfig } from "./supabase/types"
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/plans.test.ts`
Expected: PASS — todos los tests, incluidos los 3 nuevos de `getTrialStatus`.

- [ ] **Step 5: Commit**

```bash
git add lib/plans.ts lib/plans.test.ts
git commit -m "feat: agregar getTrialStatus a lib/plans"
```

---

### Task 4: `createTenant()` con `trialDias` y llamada a `seed_demo_data`

**Files:**
- Modify: `lib/supabase/tenants.ts:188-220` (`createTenant`)

- [ ] **Step 1: Extender la firma y el payload de `createTenant`**

Reemplazar la función completa en `lib/supabase/tenants.ts`:

```ts
/**
 * Da de alta una veterinaria y promueve al usuario actual a `veterinario` de
 * ese tenant, todo en una transacción (función `crear_veterinaria`).
 *
 * No se puede hacer con un INSERT directo: las policies exigen ser staff del
 * tenant, y nadie puede serlo de un slug que todavía no existe. Además, hacer
 * el alta y la promoción por separado dejaría una veterinaria huérfana si lo
 * segundo falla.
 *
 * `trialDias`: si se pasa, el tenant queda con `trial_expires_at = now() +
 * trialDias` (ver `crear_veterinaria` en 011_trial_demo.sql). Si se pasa,
 * además se llama a `seed_demo_data` — falla silenciosa: si el seed no anda,
 * el registro no se aborta, el tenant ya existe con su admin asignado.
 *
 * Lanza Error("SLUG_TAKEN") si el slug ya está ocupado.
 */
export async function createTenant(
  tenantId: string,
  data: Partial<TenantConfig>,
  trialDias?: number,
): Promise<void> {
  const { error } = await supabase.rpc("crear_veterinaria", {
    p_slug: tenantId,
    p_datos: {
      nombre: data.nombre ?? "",
      plan: data.plan ?? "basico",
      telefono: data.telefono ?? null,
      email: data.email ?? null,
      direccion: data.direccion ?? null,
      ciudad: data.ciudad ?? null,
      admin_ids: data.adminIds ?? [],
      trial_dias: trialDias != null ? String(trialDias) : null,
    },
  })

  if (error) {
    if (error.message.includes("SLUG_TAKEN")) throw new Error("SLUG_TAKEN")
    if (error.message.includes("NO_AUTENTICADO")) throw new Error("NO_AUTENTICADO")
    throw new Error(`No se pudo crear el tenant: ${error.message}`)
  }

  // El resto de la config (servicios, horarios, fotos…) se guarda aparte:
  // ya somos staff del tenant, así que las policies lo permiten.
  const resto = aFila(data)
  for (const k of ["nombre", "plan", "telefono", "email", "direccion", "ciudad", "admin_ids"]) {
    delete resto[k]
  }
  if (Object.keys(resto).length > 0) {
    await supabase.from("tenants").update(resto).eq("slug", tenantId)
  }

  if (trialDias != null) {
    const { error: seedError } = await supabase.rpc("seed_demo_data", { p_tenant_id: tenantId })
    if (seedError) {
      console.error("No se pudo cargar la demo inicial:", seedError.message)
    }
  }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/tenants.ts
git commit -m "feat: createTenant soporta trialDias y carga datos demo"
```

---

### Task 5: `/registro` crea el tenant con trial Pro de 10 días

**Files:**
- Modify: `app/registro/page.tsx:164-176` (llamada a `createTenant`)
- Modify: `app/registro/page.tsx:406-431` (paso "listo")

- [ ] **Step 1: Cambiar la llamada a `createTenant`**

En `handleSubmit`, reemplazar:

```ts
      await createTenant(tenantId, {
        nombre: form.nombreClinica.trim(),
        plan: "basico",
        adminIds: [uid],
        telefono: form.telefono,
        email: form.email,
        direccion: form.direccion,
        ciudad: form.ciudad,
      })
```

por:

```ts
      await createTenant(
        tenantId,
        {
          nombre: form.nombreClinica.trim(),
          plan: "pro",
          adminIds: [uid],
          telefono: form.telefono,
          email: form.email,
          direccion: form.direccion,
          ciudad: form.ciudad,
        },
        10,
      )
```

- [ ] **Step 2: Actualizar el texto del paso "listo"**

En el bloque `{step === "listo" && (...)}`, reemplazar:

```tsx
                <p className="text-sm text-muted-foreground mt-1">
                  Plan Básico activo — redirigiendo a tu panel...
                </p>
```

por:

```tsx
                <p className="text-sm text-muted-foreground mt-1">
                  Plan Pro activo por 10 días, con datos de ejemplo cargados —
                  redirigiendo a tu panel...
                </p>
```

- [ ] **Step 3: Probar el flujo en el navegador**

Run: `npm run dev`

Ir a `/registro`, completar el alta con un email de prueba y un nombre de
clínica nuevo. Verificar:
- El paso "listo" muestra el texto de Plan Pro por 10 días.
- Al entrar al panel (`/[slug]/admin`), turnos/productos/ventas ya tienen
  contenido (los del seed).

- [ ] **Step 4: Commit**

```bash
git add app/registro/page.tsx
git commit -m "feat: /registro crea el tenant en trial Pro de 10 dias"
```

---

### Task 6: Controles de trial en `/superadmin`

**Files:**
- Modify: `app/superadmin/page.tsx`

- [ ] **Step 1: Agregar los handlers de trial**

Después de `handleTogglePause` (línea 78 en el archivo actual), agregar:

```ts
  async function handleExtenderTrial(tenant: TenantFull) {
    const base = tenant.trialExpiresAt && new Date(tenant.trialExpiresAt) > new Date()
      ? new Date(tenant.trialExpiresAt)
      : new Date()
    const nuevoVencimiento = new Date(base.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString()
    setUpdating(tenant.slug + "-trial")
    await updateTenantConfig(tenant.slug, { trialExpiresAt: nuevoVencimiento })
    setTenants(prev => prev.map(t => t.slug === tenant.slug ? { ...t, trialExpiresAt: nuevoVencimiento } : t))
    setUpdating(null)
  }

  async function handleQuitarTrial(tenant: TenantFull) {
    setUpdating(tenant.slug + "-trial")
    await updateTenantConfig(tenant.slug, { trialExpiresAt: null })
    setTenants(prev => prev.map(t => t.slug === tenant.slug ? { ...t, trialExpiresAt: null } : t))
    setUpdating(null)
  }
```

- [ ] **Step 2: Agregar la columna "Trial" a la tabla**

En el `<thead>` de la tabla de veterinarias, después de la columna "Estado":

```tsx
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Estado</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Trial</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Acciones</th>
```

- [ ] **Step 3: Agregar la celda de trial en cada fila**

Después de la celda de "Estado" (el `<td>` con el `Badge` de Pausada/Activa),
agregar:

```tsx
                        {/* Trial */}
                        <td className="px-4 py-3">
                          {t.trialExpiresAt ? (
                            <div className="flex flex-col gap-1">
                              <span className={`text-xs font-mono ${new Date(t.trialExpiresAt) < new Date() ? "text-destructive" : "text-muted-foreground"}`}>
                                {new Date(t.trialExpiresAt).toLocaleDateString("es-AR")}
                              </span>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost" size="sm" className="text-[10px] h-6 px-1.5"
                                  onClick={() => handleExtenderTrial(t)}
                                  disabled={updating?.startsWith(t.slug)}
                                >
                                  +10 días
                                </Button>
                                <Button
                                  variant="ghost" size="sm" className="text-[10px] h-6 px-1.5 text-emerald-600"
                                  onClick={() => handleQuitarTrial(t)}
                                  disabled={updating?.startsWith(t.slug)}
                                >
                                  Quitar trial
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
```

- [ ] **Step 4: Probar en el navegador**

Run: `npm run dev`

Entrar a `/superadmin` con un usuario `superadmin`. Verificar que la
veterinaria creada en la Task 5 muestra la fecha de vencimiento del trial y
que los botones "+10 días" y "Quitar trial" actualizan la celda sin recargar
la página.

- [ ] **Step 5: Commit**

```bash
git add app/superadmin/page.tsx
git commit -m "feat: controles de trial en el panel superadmin"
```

---

### Task 7: `ReadOnlyContext` + hook + banner de trial vencido

**Files:**
- Create: `lib/auth/read-only-context.tsx`
- Create: `components/admin/trial-expired-banner.tsx`

- [ ] **Step 1: Crear el contexto y el hook**

```tsx
// lib/auth/read-only-context.tsx
"use client"

import { createContext, useContext } from "react"

/** true cuando el trial del tenant venció: el panel queda en solo lectura. */
const ReadOnlyContext = createContext(false)

export function ReadOnlyProvider({
  readOnly,
  children,
}: {
  readOnly: boolean
  children: React.ReactNode
}) {
  return (
    <ReadOnlyContext.Provider value={readOnly}>
      {children}
    </ReadOnlyContext.Provider>
  )
}

/** Fuera de `ReadOnlyProvider` devuelve `false` (nunca bloquea por defecto). */
export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext)
}
```

- [ ] **Step 2: Crear el banner**

```tsx
// components/admin/trial-expired-banner.tsx
import { AlertTriangle, MessageCircle } from "lucide-react"

const WHATSAPP_SERVITEC = "https://wa.me/5493442646670"
const LINKTREE_SERVITEC = "https://linktr.ee/serviteccdelu"

export function TrialExpiredBanner() {
  return (
    <div className="flex flex-col gap-2 border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Tu prueba del plan Pro terminó. El panel quedó en modo solo lectura —
        contactate con ServiTec para reactivarlo.
      </div>
      <div className="flex gap-2">
        <a
          href={WHATSAPP_SERVITEC}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          WhatsApp
        </a>
        <a
          href={LINKTREE_SERVITEC}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-600 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
        >
          Más contactos
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add lib/auth/read-only-context.tsx components/admin/trial-expired-banner.tsx
git commit -m "feat: contexto de solo-lectura y banner de trial vencido"
```

---

### Task 8: Wiring en `VetAdminLayout`

**Files:**
- Modify: `components/vet-admin-layout.tsx`

- [ ] **Step 1: Importar lo nuevo y calcular el estado del trial**

Agregar imports al principio del archivo (después de
`import { canAccessSection, type AdminSection } from "@/lib/auth/permissions"`):

```ts
import { getTrialStatus } from "@/lib/plans"
import { ReadOnlyProvider } from "@/lib/auth/read-only-context"
import { TrialExpiredBanner } from "@/components/admin/trial-expired-banner"
```

Agregar un estado nuevo junto a `vetNombre`:

```ts
  const [vetNombre, setVetNombre] = useState<string>("")
  const [trialVencido, setTrialVencido] = useState(false)
```

- [ ] **Step 2: Setear `trialVencido` al cargar la config**

Dentro del `.then(([userRole, userData, config]) => { ... })`, después de la
línea `setVetNombre(config?.nombre || slug)`:

```ts
      setVetNombre(config?.nombre || slug)
      setTrialVencido(getTrialStatus(config ?? {}).vencido)
      setChecking(false)
```

(reemplaza la línea existente `setChecking(false)`, que queda movida acá
mismo — no debe quedar duplicada).

- [ ] **Step 3: Envolver el layout en `ReadOnlyProvider` y mostrar el banner**

Reemplazar el `return` final del componente:

```tsx
  return (
    <ReadOnlyProvider readOnly={trialVencido}>
      <SidebarProvider>
        <VetAdminSidebar
          slug={slug}
          vetNombre={vetNombre}
          role={role}
          onSalir={async () => {
            await signOut()
            router.push("/")
          }}
        />

        <SidebarInset className="bg-slate-50 dark:bg-slate-950">
          {trialVencido && <TrialExpiredBanner />}
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 h-4" />
            <h1 className="truncate text-sm font-semibold flex-1">
              {section ? TITULOS[section] : (vetNombre || slug)}
            </h1>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => router.push(`/${slug}/admin?tour=1`)}
            >
              <HelpCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Ayuda</span>
            </Button>
          </header>

          {/* Sin `container mx-auto`: con el sidebar plegado el contenido tiene que
              aprovechar el ancho que se liberó, sobre todo el mostrador. */}
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </ReadOnlyProvider>
  )
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Probar en el navegador**

Run: `npm run dev`

En Supabase SQL Editor, forzar el vencimiento del tenant de prueba:

```sql
update tenants set trial_expires_at = now() - interval '1 day' where slug = '<tu-slug-de-prueba>';
```

Recargar `/[slug]/admin`. Expected: aparece el banner ámbar arriba del todo,
con los botones de WhatsApp y Linktree.

- [ ] **Step 6: Commit**

```bash
git add components/vet-admin-layout.tsx
git commit -m "feat: banner de trial vencido en VetAdminLayout"
```

---

### Task 9: Gatear los puntos de mutación con `useReadOnly()`

**Files:**
- Modify: `components/admin/EditTurnoModal.tsx`
- Modify: `components/admin/turnos-management.tsx:489`
- Modify: `components/admin/clientes-management.tsx:918`
- Modify: `components/admin/productos-management.tsx:244-245`
- Modify: `components/admin/productos/producto-dialog.tsx:463`
- Modify: `components/admin/pos/carrito-panel.tsx:232`
- Modify: `components/admin/pos/caja-bar.tsx:59-63`
- Modify: `app/[slug]/(vetadmin)/configuracion/page.tsx:1166`

- [ ] **Step 1: `EditTurnoModal.tsx` — deshabilitar "Guardar"**

Agregar el import al principio del archivo:

```ts
import { useReadOnly } from "@/lib/auth/read-only-context";
```

Dentro de `export function EditTurnoModal({ ... }) {`, como primera línea del
cuerpo:

```tsx
  const readOnly = useReadOnly();
```

Reemplazar el botón "Guardar":

```tsx
          <Button
            onClick={onSave}
            disabled={readOnly}
            title={readOnly ? "Reactivá tu cuenta para editar" : undefined}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-lg h-8 sm:h-9 lg:h-10 text-[10px] sm:text-xs lg:text-sm"
          >
            Guardar
          </Button>
```

- [ ] **Step 2: `turnos-management.tsx` — deshabilitar "Guardar y marcar turno completado"**

Agregar el import junto a los demás imports del archivo:

```ts
import { useReadOnly } from "@/lib/auth/read-only-context"
```

Dentro del componente principal, agregar `const readOnly = useReadOnly()`
junto a los demás hooks de estado del componente. En el botón de la línea 489
("Guardar y marcar turno completado"), agregar las props `disabled={readOnly}`
y `title={readOnly ? "Reactivá tu cuenta para editar" : undefined}` — sin
tocar el resto de sus props ni su `onClick` existente.

- [ ] **Step 3: `clientes-management.tsx` — deshabilitar "Guardar" (línea 918)**

Agregar el import junto a los demás imports del archivo:

```ts
import { useReadOnly } from "@/lib/auth/read-only-context"
```

Agregar `const readOnly = useReadOnly()` junto a los demás hooks del
componente que contiene el botón de la línea 918. En ese botón, agregar
`disabled={saving || readOnly}` (combinando con el `disabled` existente
basado en `saving`) y `title={readOnly ? "Reactivá tu cuenta para editar" : undefined}`.

- [ ] **Step 4: `productos-management.tsx` — deshabilitar "Nuevo producto"**

Agregar el import junto a los demás imports del archivo:

```ts
import { useReadOnly } from "@/lib/auth/read-only-context"
```

Agregar `const readOnly = useReadOnly()` junto a los demás hooks del
componente. En los dos botones "Nuevo producto" (líneas 244 y 328), agregar
`disabled={readOnly}` y `title={readOnly ? "Reactivá tu cuenta para editar" : undefined}`,
manteniendo el `onClick={abrirNuevo}` existente.

- [ ] **Step 5: `producto-dialog.tsx` — deshabilitar "Crear producto"/"Guardar cambios"**

Agregar el import junto a los demás imports del archivo:

```ts
import { useReadOnly } from "@/lib/auth/read-only-context"
```

Agregar `const readOnly = useReadOnly()` junto a los demás hooks del
componente. En el botón de la línea 463, agregar `readOnly` a la condición de
`disabled` existente (queda `disabled={guardando || readOnly}`) y el `title`
condicional.

- [ ] **Step 6: `carrito-panel.tsx` — deshabilitar "Cobrar"**

Agregar el import junto a los demás imports del archivo:

```ts
import { useReadOnly } from "@/lib/auth/read-only-context"
```

Agregar `const readOnly = useReadOnly()` junto a los demás hooks del
componente. En el botón "Cobrar" (línea 232), agregar `readOnly` a la
condición de `disabled` existente y el `title` condicional.

- [ ] **Step 7: `caja-bar.tsx` — deshabilitar "Abrir caja"/"Cerrar caja"**

Agregar el import junto a los demás imports del archivo:

```ts
import { useReadOnly } from "@/lib/auth/read-only-context"
```

Agregar `const readOnly = useReadOnly()` junto a los demás hooks del
componente que contiene los botones de las líneas 59 y 63. En ambos botones,
agregar `disabled={readOnly}` y `title={readOnly ? "Reactivá tu cuenta para editar" : undefined}`.

- [ ] **Step 8: `configuracion/page.tsx` — deshabilitar el `SaveButton` compartido**

Agregar el import junto a los demás imports del archivo:

```ts
import { useReadOnly } from "@/lib/auth/read-only-context"
```

Reemplazar la función `SaveButton` (línea 1166):

```tsx
function SaveButton({ loading }: { loading: boolean }) {
  const readOnly = useReadOnly()
  return (
    <Button
      type="submit"
      disabled={loading || readOnly}
      title={readOnly ? "Reactivá tu cuenta para editar" : undefined}
      className="bg-emerald-600 hover:bg-emerald-700"
    >
      {loading ? "Guardando…" : "Guardar cambios"}
    </Button>
  )
}
```

(mantener el contenido interno/props exactos que ya tenía la función además
de agregar `disabled`/`title` — revisar el archivo antes de reemplazar para
no perder clases o texto existentes que difieran de este snippet).

También agregar `disabled={readOnly}` y el mismo `title` condicional al botón
de la línea 744 ("Guardar" de la pestaña de servicios), que usa
`onClick={() => saveDatos(...)}` en lugar de `type="submit"` — necesita su
propio `useReadOnly()` si está en un componente distinto al de `SaveButton`.

- [ ] **Step 9: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 10: Probar en el navegador con trial vencido**

Run: `npm run dev`

Con el tenant de prueba en trial vencido (Task 8, Step 5), recorrer:
turnos (botón de completar turno deshabilitado), clientes (Guardar
deshabilitado), productos (Nuevo producto deshabilitado), POS (Cobrar
deshabilitado), caja (Abrir/Cerrar caja deshabilitado), configuración
(Guardar deshabilitado). Todos deben mostrar el tooltip "Reactivá tu cuenta
para editar" al pasar el mouse, y los listados/dashboard siguen siendo
visibles y navegables.

Volver a poner el trial vigente para no dejar el tenant de prueba bloqueado:

```sql
update tenants set trial_expires_at = now() + interval '10 days' where slug = '<tu-slug-de-prueba>';
```

- [ ] **Step 11: Commit**

```bash
git add components/admin/EditTurnoModal.tsx components/admin/turnos-management.tsx \
  components/admin/clientes-management.tsx components/admin/productos-management.tsx \
  components/admin/productos/producto-dialog.tsx components/admin/pos/carrito-panel.tsx \
  components/admin/pos/caja-bar.tsx "app/[slug]/(vetadmin)/configuracion/page.tsx"
git commit -m "feat: deshabilitar acciones de escritura con el trial vencido"
```

---

## Self-Review

**Cobertura del spec:**
- Columna `trial_expires_at` + `getTrialStatus` → Task 1, 2, 3. ✓
- Controles de superadmin (extender/quitar) → Task 6. ✓
- Banner + solo-lectura en cliente → Task 7, 8, 9. ✓
- Seed de datos (turno_config, turnos, productos, ventas) → Task 1. ✓
- `createTenant` con `trialDias` + llamada a seed, fallo no aborta registro →
  Task 4. ✓
- `/registro` en plan Pro con trial de 10 días → Task 5. ✓
- Fuera de alcance (RLS reforzado, self-service, notificaciones) → no
  implementado, consistente con el spec. ✓

**Nombres consistentes:** `getTrialStatus`, `TrialStatus`, `enTrial`,
`vencido`, `diasRestantes` se usan igual en Task 3 (definición), Task 8
(consumo en `VetAdminLayout`) y Task 6 (superadmin, vía `trialExpiresAt`
directo sin pasar por `getTrialStatus`, que es correcto porque ahí se
compara contra `new Date()` para decidir la base de "+10 días", no se
necesita el helper). `useReadOnly()` / `ReadOnlyProvider` se usan igual en
Task 7 (definición), Task 8 (provider) y Task 9 (consumo en los 8 archivos).
`trialDias` (camelCase, cliente) → `trial_dias` (snake_case, RPC) es
consistente con el resto del mapeo `aFila`/`aConfig` del archivo.
