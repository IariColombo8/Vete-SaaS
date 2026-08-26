# Medios de pago ampliados + Cuenta corriente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `mixto` and `cuenta_corriente` payment methods to the POS, with card surcharges (editable, per-installment for credit), a split-payment breakdown for "mixto", and a real accounts-receivable ledger per client with its own screen and payments that land in the daily cash register.

**Architecture:** Additive Postgres migration on top of `005_ventas.sql` (new enum values, columns, two new tables, an extended `registrar_venta` RPC, and a new `registrar_pago_cta_cte` RPC). The cart math (`lib/ventas/carrito.ts`) gains a pure surcharge calculation. The POS UI (`carrito-panel.tsx`, `pos-management.tsx`) grows conditional panels per payment method. A new `lib/supabase/cuentaCorriente.ts` data layer backs a new admin section (`/[slug]/cuenta-corriente`) with its own sidebar entry, permission section and plan gate (same as `ventas`). Ventas/Caja history and filters are extended to surface the new payment methods.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres + RPC), TypeScript, Tailwind, shadcn/ui, Vitest.

---

## Spec

Full design: `docs/superpowers/specs/2026-08-26-medios-pago-cta-cte-design.md`. Read it before starting — this plan implements it task by task.

## File Structure

- `supabase/006_cuenta_corriente.sql` — new migration (enum values, columns, `venta_pagos`, `cuenta_corriente_movimientos`, updated `registrar_venta`, new `registrar_pago_cta_cte`, RLS).
- `lib/ventas/carrito.ts` — modify: `totalesCarrito` gains `recargoPorcentaje` param, `TotalesCarrito` gains `recargo`.
- `lib/ventas/carrito.test.ts` — modify: new test cases for recargo.
- `lib/supabase/types.ts` — modify: `MedioPago` union, `MEDIOS_PAGO` array reordered, `Venta`/`VentaItem`-adjacent types gain `recargo`, `cuotas`, `esPagoCtaCte`, `pagos`.
- `lib/supabase/ventas.ts` — modify: `RegistrarVentaInput`/`ResultadoVenta`/`aVenta` handle new fields; `VentasFiltro` unchanged (already has `medioPago`).
- `lib/supabase/cuentaCorriente.ts` — new: `getSaldosClientes`, `getMovimientosCliente`, `registrarPago`.
- `components/admin/pos/carrito-panel.tsx` — modify: 3-column medio-de-pago grid, recargo field, cuotas selector, mixto breakdown, cta-cte-required client.
- `components/admin/pos/cliente-selector.tsx` — modify: optional "obligatorio" mode + inline "nuevo cliente" creation.
- `components/admin/pos/mixto-pagos.tsx` — new: the split-payment line editor.
- `components/admin/pos-management.tsx` — modify: new state (`recargoPct`, `cuotas`, `pagosMixto`), payload assembly, validation.
- `components/admin/ventas/colores-medio-pago.tsx` — modify: add `mixto`/`cuenta_corriente` colors.
- `components/admin/caja-management.tsx` — modify: `ICONO_MEDIO` gains the two new entries.
- `components/admin/ventas/historial-ventas.tsx` — modify: medio-de-pago filter, cuotas/mixto/cta-cte display.
- `components/admin/ventas-management.tsx` — modify: wires the new filter into `getVentas`.
- `lib/supabase/cuentaCorriente.test.ts` — new: pure-logic tests where feasible (mostly integration-shaped, so this stays thin; the real coverage is in `carrito.test.ts` and manual RPC checks).
- `components/admin/cuenta-corriente-management.tsx` — new: main page component.
- `components/admin/cuenta-corriente/tabla-saldos.tsx` — new: client list with balances.
- `components/admin/cuenta-corriente/detalle-cliente-dialog.tsx` — new: movement history + "Registrar pago" dialog.
- `app/[slug]/(vetadmin)/cuenta-corriente/page.tsx` — new: route.
- `components/vet-admin-sidebar.tsx` — modify: new nav item.
- `components/navbar.tsx` — modify: `isVetAdmin` regex.
- `lib/auth/permissions.ts` — modify: new `AdminSection`.
- `lib/plans.ts` — no change needed (reuses the existing `ventas` feature — see Task 12 rationale).

---

### Task 1: Database migration — enum values, columns, new tables

**Files:**
- Create: `supabase/006_cuenta_corriente.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================================
-- 006_cuenta_corriente.sql — Medios de pago ampliados y cuenta corriente
--
-- Continúa 005_ventas.sql. Agrega:
--   · Dos medios de pago nuevos: 'mixto' y 'cuenta_corriente'.
--   · Recargo y cuotas en `ventas`, para débito/crédito.
--   · `venta_pagos`: desglose de "mixto" (tiene que sumar el total).
--   · `cuenta_corriente_movimientos`: el saldo deudor de cada cliente. No se
--     desnormaliza en `clientes` — se calcula sumando movimientos, que con el
--     volumen de una veterinaria es una consulta liviana.
--
-- Requiere haber corrido antes 005_ventas.sql.
-- ============================================================================

-- No se puede agregar un valor a un enum y usarlo en la misma transacción,
-- así que esto corre solo (sin bloque `do $$`) y antes que todo lo demás.
alter type medio_pago add value if not exists 'mixto';
alter type medio_pago add value if not exists 'cuenta_corriente';
```

Run this file alone against the dev database once (via the Supabase SQL Editor)
before continuing — a value just added to an enum can't be referenced in the
same transaction/script that adds it, so the rest of this migration goes in a
**second** file-run. Split it into two files to make this obvious:

- `supabase/006_cuenta_corriente.sql` — just the two `alter type` lines above.
- `supabase/006b_cuenta_corriente.sql` — everything below.

- [ ] **Step 2: Write the second file with columns, tables, and RLS**

Create `supabase/006b_cuenta_corriente.sql`:

```sql
-- ============================================================================
-- 006b_cuenta_corriente.sql — continúa 006_cuenta_corriente.sql
--
-- Correr DESPUÉS de que 006_cuenta_corriente.sql haya confirmado (los nuevos
-- valores de `medio_pago` tienen que existir ya committeados).
-- ============================================================================

-- ============================================================================
-- 1. VENTAS: columnas nuevas
-- ============================================================================

alter table public.ventas add column if not exists recargo         numeric(12,2) not null default 0;
alter table public.ventas add column if not exists cuotas          integer;
alter table public.ventas add column if not exists es_pago_cta_cte boolean not null default false;

alter table public.ventas drop constraint if exists ventas_recargo_ck;
alter table public.ventas add  constraint ventas_recargo_ck check (recargo >= 0);

alter table public.ventas drop constraint if exists ventas_cuotas_ck;
alter table public.ventas add  constraint ventas_cuotas_ck check (cuotas is null or cuotas > 0);

-- ============================================================================
-- 2. VENTA_PAGOS: desglose de "mixto"
-- ============================================================================

create table if not exists public.venta_pagos (
  id         uuid primary key default gen_random_uuid(),
  venta_id   uuid not null references public.ventas(id) on delete cascade,
  tenant_id  text not null references public.tenants(slug) on delete cascade,
  medio_pago medio_pago not null,
  monto      numeric(12,2) not null,

  constraint venta_pagos_monto_ck check (monto > 0),
  constraint venta_pagos_medio_ck check (medio_pago not in ('mixto', 'cuenta_corriente'))
);

create index if not exists idx_venta_pagos_venta on public.venta_pagos (venta_id);

-- ============================================================================
-- 3. CUENTA_CORRIENTE_MOVIMIENTOS
--
-- El saldo de un cliente es sum(monto) filter (tipo='venta') menos
-- sum(monto) filter (tipo='pago'). No se guarda un campo `saldo`: con el
-- volumen de una veterinaria (cientos de movimientos) calcularlo en la
-- consulta es más simple y no se puede desincronizar.
-- ============================================================================

create table if not exists public.cuenta_corriente_movimientos (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      text not null references public.tenants(slug) on delete cascade,
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  tipo           text not null,
  monto          numeric(12,2) not null,
  venta_id       uuid references public.ventas(id) on delete set null,
  observaciones  text not null default '',
  usuario_nombre text,
  created_at     timestamptz not null default now(),

  constraint cta_cte_mov_tipo_ck  check (tipo in ('venta', 'pago')),
  constraint cta_cte_mov_monto_ck check (monto > 0)
);

create index if not exists idx_cta_cte_cliente
  on public.cuenta_corriente_movimientos (tenant_id, cliente_id, created_at desc);

-- ============================================================================
-- 4. RLS
-- ============================================================================

alter table public.venta_pagos                  enable row level security;
alter table public.cuenta_corriente_movimientos enable row level security;

drop policy if exists venta_pagos_read on public.venta_pagos;
create policy venta_pagos_read on public.venta_pagos for select
  using (es_staff(tenant_id));

drop policy if exists cta_cte_mov_read on public.cuenta_corriente_movimientos;
create policy cta_cte_mov_read on public.cuenta_corriente_movimientos for select
  using (es_staff(tenant_id));

-- ============================================================================
-- FIN de 006b
-- ============================================================================
```

- [ ] **Step 3: Commit**

```bash
git add supabase/006_cuenta_corriente.sql supabase/006b_cuenta_corriente.sql
git commit -m "feat(db): agregar medios de pago mixto/cuenta_corriente y sus tablas"
```

Run both files against the Supabase project (SQL Editor, in order) before
moving to Task 2 — Task 2's RPC references `venta_pagos` and
`cuenta_corriente_movimientos`, which must exist first.

---

### Task 2: `registrar_venta` RPC — extend for recargo, cuotas, mixto, cuenta corriente

**Files:**
- Create: `supabase/006c_registrar_venta.sql`

This replaces the `registrar_venta` function body from `005_ventas.sql` — same
function name and `security definer`, `create or replace` overwrites it in
place, no data migration needed.

- [ ] **Step 1: Write the new function**

```sql
-- ============================================================================
-- 006c_registrar_venta.sql — registrar_venta extendida
--
-- Reemplaza la versión de 005_ventas.sql. Agrega tres parámetros opcionales al
-- final (compatibilidad con quien todavía llame la firma vieja durante el
-- deploy): p_recargo, p_cuotas, p_pagos.
-- ============================================================================

create or replace function public.registrar_venta(
  p_tenant_id      text,
  p_items          jsonb,
  p_medio_pago     text default 'efectivo',
  p_cliente_id     uuid default null,
  p_descuento      numeric default 0,
  p_observaciones  text default null,
  p_recargo        numeric default 0,
  p_cuotas         integer default null,
  p_pagos          jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item        jsonb;
  v_producto_id uuid;
  v_cantidad    numeric;
  v_precio      numeric;
  v_subtotal    numeric;

  v_nombre      text;
  v_marca       text;
  v_linea       text;
  v_peso        numeric;
  v_unidad      producto_unidad;
  v_controla    boolean;
  v_activo      boolean;
  v_stock       numeric;
  v_nuevo       numeric;
  v_present     text;

  v_suma        numeric := 0;
  v_total       numeric;
  v_caja_id     uuid;
  v_venta_id    uuid;
  v_numero      integer;
  v_usuario     text;
  v_cli_nombre  text := '';
  v_cli_tel     text := '';
  v_cli_dni     text := '';
  v_cli_dom     text := '';

  v_pago        jsonb;
  v_pagos_suma  numeric := 0;
begin
  if not public.es_staff(p_tenant_id) then
    raise exception 'No tenés permiso sobre esta veterinaria';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;

  if p_medio_pago not in
    ('efectivo', 'debito', 'credito', 'transferencia', 'mixto', 'cuenta_corriente')
  then
    raise exception 'Medio de pago inválido: %', p_medio_pago;
  end if;

  if p_descuento is null or p_descuento = 'NaN'::numeric or p_descuento < 0 then
    raise exception 'El descuento no es válido';
  end if;

  if p_recargo is null or p_recargo = 'NaN'::numeric or p_recargo < 0 then
    raise exception 'El recargo no es válido';
  end if;

  if p_medio_pago = 'cuenta_corriente' and p_cliente_id is null then
    raise exception 'La cuenta corriente necesita un cliente';
  end if;

  if p_medio_pago = 'mixto' and
    (p_pagos is null or jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0)
  then
    raise exception 'El pago mixto necesita el desglose por medio';
  end if;

  select coalesce(display_name, email) into v_usuario
    from public.usuarios where id = auth.uid();

  if p_cliente_id is not null then
    select nombre, coalesce(telefono, ''), coalesce(dni, ''), coalesce(domicilio, '')
      into v_cli_nombre, v_cli_tel, v_cli_dni, v_cli_dom
      from public.clientes
      where id = p_cliente_id and tenant_id = p_tenant_id;

    if not found then
      raise exception 'El cliente seleccionado no existe';
    end if;
  end if;

  select id into v_caja_id
    from public.cajas
    where tenant_id = p_tenant_id and estado = 'abierta'
    limit 1;

  select coalesce(max(numero), 0) + 1 into v_numero
    from public.ventas where tenant_id = p_tenant_id;

  insert into public.ventas
    (tenant_id, numero, caja_id, cliente_id, cliente_nombre, cliente_telefono,
     cliente_dni, cliente_domicilio,
     medio_pago, subtotal, descuento, recargo, cuotas, total,
     vendedor_id, vendedor_nombre, observaciones)
  values
    (p_tenant_id, v_numero, v_caja_id, p_cliente_id, v_cli_nombre, v_cli_tel,
     v_cli_dni, v_cli_dom,
     p_medio_pago::medio_pago, 0, p_descuento, p_recargo, p_cuotas, 0,
     auth.uid(), v_usuario,
     coalesce(nullif(trim(coalesce(p_observaciones, '')), ''), ''))
  returning id into v_venta_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := nullif(v_item->>'producto_id', '')::uuid;
    v_cantidad    := coalesce((v_item->>'cantidad')::numeric, 0);
    v_precio      := coalesce((v_item->>'precio_unitario')::numeric, 0);
    v_subtotal    := coalesce((v_item->>'subtotal')::numeric, 0);

    if v_producto_id is null then
      raise exception 'Hay un item sin producto';
    end if;
    if v_cantidad is null or v_cantidad = 'NaN'::numeric or v_cantidad <= 0 then
      raise exception 'Cantidad inválida en la venta';
    end if;
    if v_subtotal is null or v_subtotal = 'NaN'::numeric or v_subtotal < 0 then
      raise exception 'Importe inválido en la venta';
    end if;

    select nombre, coalesce(marca, ''), coalesce(linea, ''), peso_kg,
           unidad, controla_stock, activo, stock
      into v_nombre, v_marca, v_linea, v_peso, v_unidad, v_controla, v_activo, v_stock
      from public.productos
      where id = v_producto_id and tenant_id = p_tenant_id
      for update;

    if not found then
      raise exception 'Uno de los productos ya no existe';
    end if;
    if not v_activo then
      raise exception 'El producto "%" está dado de baja', v_nombre;
    end if;

    if v_controla then
      v_nuevo := v_stock - v_cantidad;
      if v_nuevo < 0 then
        raise exception 'No hay stock suficiente de "%" (quedan %, se piden %)',
          v_nombre, v_stock, v_cantidad;
      end if;

      update public.productos set stock = v_nuevo where id = v_producto_id;

      insert into public.stock_movimientos
        (tenant_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
         referencia, usuario_id, usuario_nombre)
      values
        (p_tenant_id, v_producto_id, 'venta', -v_cantidad, v_stock, v_nuevo,
         'Venta #' || v_numero, auth.uid(), v_usuario);
    end if;

    v_present := case
      when v_unidad = 'kg'   then 'por kg'
      when v_peso is not null then trim(to_char(v_peso, 'FM999999990.999')) || ' kg'
      else ''
    end;

    insert into public.venta_items
      (venta_id, tenant_id, producto_id, nombre, marca, presentacion,
       unidad, cantidad, precio_unitario, subtotal)
    values
      (v_venta_id, p_tenant_id, v_producto_id,
       v_nombre || case when v_linea <> '' then ' ' || v_linea else '' end,
       v_marca, v_present, v_unidad, v_cantidad, v_precio, v_subtotal);

    v_suma := v_suma + v_subtotal;
  end loop;

  v_total := greatest(v_suma - p_descuento, 0) + p_recargo;

  update public.ventas
    set subtotal = v_suma, total = v_total
    where id = v_venta_id;

  -- Desglose de "mixto": tiene que sumar exactamente el total (tolerancia de
  -- un centavo por redondeo de punto flotante en el cliente).
  if p_medio_pago = 'mixto' then
    for v_pago in select * from jsonb_array_elements(p_pagos)
    loop
      if coalesce((v_pago->>'medio_pago'), '') not in ('efectivo', 'debito', 'credito', 'transferencia') then
        raise exception 'Medio de pago inválido en el desglose: %', v_pago->>'medio_pago';
      end if;
      if coalesce((v_pago->>'monto')::numeric, 0) <= 0 then
        raise exception 'Hay un monto inválido en el desglose de pagos';
      end if;

      v_pagos_suma := v_pagos_suma + (v_pago->>'monto')::numeric;

      insert into public.venta_pagos (venta_id, tenant_id, medio_pago, monto)
      values (v_venta_id, p_tenant_id, (v_pago->>'medio_pago')::medio_pago, (v_pago->>'monto')::numeric);
    end loop;

    if abs(v_pagos_suma - v_total) > 0.01 then
      raise exception 'El desglose de pagos ($%) no coincide con el total ($%)', v_pagos_suma, v_total;
    end if;
  end if;

  -- Cuenta corriente: la venta queda como deuda del cliente.
  if p_medio_pago = 'cuenta_corriente' then
    insert into public.cuenta_corriente_movimientos
      (tenant_id, cliente_id, tipo, monto, venta_id, usuario_nombre)
    values
      (p_tenant_id, p_cliente_id, 'venta', v_total, v_venta_id, v_usuario);
  end if;

  return jsonb_build_object(
    'venta_id',  v_venta_id,
    'numero',    v_numero,
    'caja_id',   v_caja_id,
    'subtotal',  v_suma,
    'descuento', p_descuento,
    'recargo',   p_recargo,
    'total',     v_total
  );
end $$;
```

- [ ] **Step 2: Write `registrar_pago_cta_cte`**

Append to the same file:

```sql
-- ============================================================================
-- registrar_pago_cta_cte — cobrar (total o parcial) la cuenta corriente
--
-- Inserta una fila en `ventas` (sin items, `es_pago_cta_cte = true`) para que
-- el cobro entre al arqueo de caja del turno abierto igual que una venta, y un
-- movimiento 'pago' que descuenta el saldo del cliente.
-- ============================================================================

create or replace function public.registrar_pago_cta_cte(
  p_tenant_id     text,
  p_cliente_id    uuid,
  p_monto         numeric,
  p_medio_pago    text,
  p_observaciones text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario    text;
  v_caja_id    uuid;
  v_venta_id   uuid;
  v_numero     integer;
  v_cli_nombre text;
  v_cli_tel    text;
begin
  if not public.es_staff(p_tenant_id) then
    raise exception 'No tenés permiso sobre esta veterinaria';
  end if;

  if p_monto is null or p_monto = 'NaN'::numeric or p_monto <= 0 then
    raise exception 'El monto del pago no es válido';
  end if;

  if p_medio_pago not in ('efectivo', 'debito', 'credito', 'transferencia') then
    raise exception 'Medio de pago inválido para un cobro de cuenta corriente: %', p_medio_pago;
  end if;

  select nombre, coalesce(telefono, '') into v_cli_nombre, v_cli_tel
    from public.clientes
    where id = p_cliente_id and tenant_id = p_tenant_id;

  if not found then
    raise exception 'El cliente no existe';
  end if;

  select coalesce(display_name, email) into v_usuario
    from public.usuarios where id = auth.uid();

  select id into v_caja_id
    from public.cajas
    where tenant_id = p_tenant_id and estado = 'abierta'
    limit 1;

  select coalesce(max(numero), 0) + 1 into v_numero
    from public.ventas where tenant_id = p_tenant_id;

  insert into public.ventas
    (tenant_id, numero, caja_id, cliente_id, cliente_nombre, cliente_telefono,
     medio_pago, subtotal, descuento, recargo, total,
     es_pago_cta_cte, vendedor_id, vendedor_nombre, observaciones)
  values
    (p_tenant_id, v_numero, v_caja_id, p_cliente_id, v_cli_nombre, v_cli_tel,
     p_medio_pago::medio_pago, 0, 0, 0, p_monto,
     true, auth.uid(), v_usuario,
     coalesce(nullif(trim(coalesce(p_observaciones, '')), ''), 'Pago de cuenta corriente'))
  returning id into v_venta_id;

  insert into public.cuenta_corriente_movimientos
    (tenant_id, cliente_id, tipo, monto, venta_id, observaciones, usuario_nombre)
  values
    (p_tenant_id, p_cliente_id, 'pago', p_monto, v_venta_id,
     coalesce(nullif(trim(coalesce(p_observaciones, '')), ''), ''), v_usuario);

  return jsonb_build_object('venta_id', v_venta_id, 'numero', v_numero);
end $$;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/006c_registrar_venta.sql
git commit -m "feat(db): extender registrar_venta y agregar registrar_pago_cta_cte"
```

Run this file against Supabase before moving on — Task 4 onward calls these RPCs.

---

### Task 3: `carrito.ts` — pure recargo calculation

**Files:**
- Modify: `lib/ventas/carrito.ts:204-226`
- Test: `lib/ventas/carrito.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `lib/ventas/carrito.test.ts` (find the `describe("totalesCarrito"` block,
or add a new one near the bottom of the file, before the final closing of the
file):

```typescript
describe("totalesCarrito con recargo", () => {
  it("sin recargo el total no cambia", () => {
    const carrito = agregarAlCarrito([], producto({ precio: 1000 }), 2)
    const totales = totalesCarrito(carrito)
    expect(totales.total).toBe(2000)
    expect(totales.recargo).toBe(0)
  })

  it("aplica el recargo sobre el subtotal ya con descuento", () => {
    const carrito = agregarAlCarrito([], producto({ precio: 1000 }), 1)
    const totales = totalesCarrito(carrito, SIN_DESCUENTO, 5)
    // 1000 * 1.05 = 1050
    expect(totales.recargo).toBe(50)
    expect(totales.total).toBe(1050)
  })

  it("combina descuento y recargo: primero descuento, después recargo", () => {
    const carrito = agregarAlCarrito([], producto({ precio: 1000 }), 1)
    const totales = totalesCarrito(carrito, { tipo: "monto", valor: 100 }, 10)
    // (1000 - 100) * 1.10 = 990
    expect(totales.recargo).toBe(90)
    expect(totales.total).toBe(990)
  })

  it("redondea a centavos", () => {
    const carrito = agregarAlCarrito([], producto({ precio: 333 }), 1)
    const totales = totalesCarrito(carrito, SIN_DESCUENTO, 15)
    // 333 * 1.15 = 382.95
    expect(totales.total).toBe(382.95)
  })
})
```

Also update the `SIN_DESCUENTO` import at the top of the test file if it isn't
already imported — check the existing `import { ... } from "./carrito"` block
and add `SIN_DESCUENTO` to it if missing.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/ventas/carrito.test.ts`
Expected: FAIL — `totales.recargo` is `undefined` (property doesn't exist yet).

- [ ] **Step 3: Implement the recargo calculation**

In `lib/ventas/carrito.ts`, replace the `TotalesCarrito` interface and
`totalesCarrito` function:

```typescript
export interface TotalesCarrito {
  /** Suma de las líneas, con las ofertas ya aplicadas. */
  subtotal: number
  /** Descuento global que carga el vendedor a mano. */
  descuento: number
  /** Recargo (débito/crédito), ya en pesos, aplicado después del descuento. */
  recargo: number
  total: number
  /** Cuánto se ahorró el cliente por ofertas del catálogo. */
  ahorro: number
  /** Cantidad de líneas distintas (no de unidades). */
  items: number
}
```

```typescript
/**
 * El recargo de tarjeta se aplica sobre el subtotal YA con el descuento
 * restado, no sobre el precio de lista — el mismo orden que ya usa el
 * descuento con las ofertas del catálogo.
 */
export function totalesCarrito(
  carrito: LineaCarrito[],
  descuento: Descuento = SIN_DESCUENTO,
  recargoPorcentaje = 0,
): TotalesCarrito {
  let subtotal = 0
  let sinOferta = 0

  for (const linea of carrito) {
    subtotal += subtotalLinea(linea)
    sinOferta += linea.producto.precio * linea.cantidad
  }

  subtotal = round2(subtotal)
  const desc = montoDescuento(subtotal, descuento)
  const baseConDescuento = Math.max(0, round2(subtotal - desc))

  const pctRecargo = Number(recargoPorcentaje)
  const recargo =
    Number.isFinite(pctRecargo) && pctRecargo > 0
      ? round2(baseConDescuento * (pctRecargo / 100))
      : 0

  return {
    subtotal,
    descuento: desc,
    recargo,
    total: round2(baseConDescuento + recargo),
    ahorro: Math.max(0, round2(sinOferta - subtotal)),
    items: carrito.length,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/ventas/carrito.test.ts`
Expected: PASS, all tests including the new `describe("totalesCarrito con recargo"`.

- [ ] **Step 5: Commit**

```bash
git add lib/ventas/carrito.ts lib/ventas/carrito.test.ts
git commit -m "feat: agregar recargo por tarjeta al cálculo de totales del carrito"
```

---

### Task 4: `types.ts` — MedioPago, MEDIOS_PAGO, Venta shape

**Files:**
- Modify: `lib/supabase/types.ts:353-407`

- [ ] **Step 1: Update the type, the array, and `Venta`**

Replace lines 353-363 of `lib/supabase/types.ts`:

```typescript
export type MedioPago =
  | "efectivo" | "transferencia" | "mixto"
  | "debito" | "credito" | "cuenta_corriente"
export type VentaEstado = "completada" | "anulada"
export type CajaEstado = "abierta" | "cerrada"

/**
 * Etiquetas para la UI. Un solo lugar, así el POS y el historial no divergen.
 * El orden es el que usa la grilla de 3 columnas del mostrador: no hace falta
 * un array de layout aparte.
 */
export const MEDIOS_PAGO: { id: MedioPago; label: string }[] = [
  { id: "efectivo", label: "Efectivo" },
  { id: "transferencia", label: "Transferencia" },
  { id: "mixto", label: "Mixto" },
  { id: "debito", label: "Débito" },
  { id: "credito", label: "Crédito" },
  { id: "cuenta_corriente", label: "Cta Cte" },
]

/** Medios de pago válidos para un cobro (excluye mixto y cuenta_corriente). */
export const MEDIOS_PAGO_SIMPLES: { id: MedioPago; label: string }[] =
  MEDIOS_PAGO.filter((m) => m.id !== "mixto" && m.id !== "cuenta_corriente")
```

Then update the `Venta` interface (currently lines ~385-407) to add the new
fields — replace it with:

```typescript
export interface Venta {
  id: string
  /** Correlativo por veterinaria. Es el número que sale impreso en el remito. */
  numero: number
  cajaId?: string
  clienteId?: string
  clienteNombre: string
  clienteTelefono: string
  clienteDni: string
  clienteDomicilio: string
  medioPago: MedioPago
  estado: VentaEstado
  subtotal: number
  descuento: number
  /** Recargo de débito/crédito, ya en pesos y sumado al total. */
  recargo: number
  /** Cantidad de cuotas, solo cuando medioPago === "credito". */
  cuotas?: number
  total: number
  anuladaAt?: string
  anuladaMotivo?: string
  vendedorNombre?: string
  observaciones: string
  createdAt: string
  /** Un cobro de cuenta corriente, no una venta de productos (sin items). */
  esPagoCtaCte: boolean
  /** Solo viene cuando se pide el detalle completo. */
  items?: VentaItem[]
  /** Desglose de "mixto". Solo viene cuando se pide el detalle completo. */
  pagos?: { medioPago: MedioPago; monto: number }[]
}
```

- [ ] **Step 2: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: errors in `lib/supabase/ventas.ts` and `components/admin/ventas/colores-medio-pago.tsx`
(missing `recargo`/`esPagoCtaCte` in `aVenta`, and `COLOR_MEDIO_PAGO` missing
keys for the new union members) — both fixed in the next tasks. No other files
should error; if they do, note them for follow-up in this task's commit message.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/types.ts
git commit -m "feat(types): agregar mixto y cuenta_corriente a MedioPago"
```

---

### Task 5: `lib/supabase/ventas.ts` — wire the new fields through

**Files:**
- Modify: `lib/supabase/ventas.ts:33-152`

- [ ] **Step 1: Update `aVenta` to map the new columns**

Replace the `aVenta` function:

```typescript
function aVenta(f: Fila): Venta {
  const items = f.venta_items as Fila[] | undefined
  const pagos = f.venta_pagos as Fila[] | undefined

  return {
    id: f.id as string,
    numero: num(f.numero),
    cajaId: (f.caja_id as string) ?? undefined,
    clienteId: (f.cliente_id as string) ?? undefined,
    clienteNombre: (f.cliente_nombre as string) ?? "",
    clienteTelefono: (f.cliente_telefono as string) ?? "",
    clienteDni: (f.cliente_dni as string) ?? "",
    clienteDomicilio: (f.cliente_domicilio as string) ?? "",
    medioPago: (f.medio_pago as MedioPago) ?? "efectivo",
    estado: (f.estado as VentaEstado) ?? "completada",
    subtotal: num(f.subtotal),
    descuento: num(f.descuento),
    recargo: num(f.recargo),
    cuotas: f.cuotas != null ? num(f.cuotas) : undefined,
    total: num(f.total),
    anuladaAt: (f.anulada_at as string) ?? undefined,
    anuladaMotivo: (f.anulada_motivo as string) ?? undefined,
    vendedorNombre: (f.vendedor_nombre as string) ?? undefined,
    observaciones: (f.observaciones as string) ?? "",
    createdAt: (f.created_at as string) ?? "",
    esPagoCtaCte: Boolean(f.es_pago_cta_cte),
    items: items ? items.map(aVentaItem) : undefined,
    pagos: pagos
      ? pagos.map((p) => ({ medioPago: p.medio_pago as MedioPago, monto: num(p.monto) }))
      : undefined,
  }
}
```

- [ ] **Step 2: Update `VENTA_COLS` to also fetch `venta_pagos`**

```typescript
const VENTA_COLS = "*, venta_items(*), venta_pagos(*)"
```

- [ ] **Step 3: Extend `RegistrarVentaInput` and `registrarVenta`**

```typescript
export interface RegistrarVentaInput {
  items: ItemRPC[]
  medioPago: MedioPago
  clienteId?: string
  descuento?: number
  observaciones?: string
  /** Recargo de débito/crédito, ya en pesos. */
  recargo?: number
  /** Solo cuando medioPago === "credito". */
  cuotas?: number
  /** Obligatorio cuando medioPago === "mixto". */
  pagos?: { medioPago: MedioPago; monto: number }[]
}
```

```typescript
export async function registrarVenta(
  tenantId: string,
  input: RegistrarVentaInput,
): Promise<ResultadoVenta> {
  const { data, error } = await supabase.rpc("registrar_venta", {
    p_tenant_id: tenantId,
    p_items: input.items,
    p_medio_pago: input.medioPago,
    p_cliente_id: input.clienteId ?? null,
    p_descuento: input.descuento ?? 0,
    p_observaciones: input.observaciones ?? null,
    p_recargo: input.recargo ?? 0,
    p_cuotas: input.cuotas ?? null,
    p_pagos: input.pagos?.map((p) => ({ medio_pago: p.medioPago, monto: p.monto })) ?? null,
  })

  if (error) throw new Error(error.message)

  const r = data as Fila
  return {
    ventaId: r.venta_id as string,
    numero: num(r.numero),
    subtotal: num(r.subtotal),
    descuento: num(r.descuento),
    total: num(r.total),
  }
}
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no more errors from `lib/supabase/ventas.ts`. The
`colores-medio-pago.tsx` error from Task 4 should still be there (fixed in Task 8).

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/ventas.ts
git commit -m "feat: pasar recargo, cuotas y desglose de mixto a registrar_venta"
```

---

### Task 6: `lib/supabase/cuentaCorriente.ts` — data layer

**Files:**
- Create: `lib/supabase/cuentaCorriente.ts`

- [ ] **Step 1: Write the file**

```typescript
import { supabase } from "./config"
import type { MedioPago } from "./types"

/**
 * Cuenta corriente por cliente. El saldo no se guarda desnormalizado: se
 * calcula sumando `cuenta_corriente_movimientos` (venta suma, pago resta).
 * Con el volumen de una veterinaria (cientos de movimientos por cliente) esto
 * es una consulta liviana y evita el problema clásico de un contador que se
 * desincroniza si algo falla a mitad de camino.
 */

type Fila = Record<string, unknown>

function num(v: unknown, porDefecto = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : porDefecto
}

export interface MovimientoCtaCte {
  id: string
  tipo: "venta" | "pago"
  monto: number
  ventaId?: string
  ventaNumero?: number
  observaciones: string
  usuarioNombre?: string
  createdAt: string
}

export interface ClienteConSaldo {
  clienteId: string
  nombre: string
  telefono: string
  saldo: number
}

function aMovimiento(f: Fila): MovimientoCtaCte {
  const venta = f.ventas as Fila | null
  return {
    id: f.id as string,
    tipo: f.tipo as "venta" | "pago",
    monto: num(f.monto),
    ventaId: (f.venta_id as string) ?? undefined,
    ventaNumero: venta ? num(venta.numero) : undefined,
    observaciones: (f.observaciones as string) ?? "",
    usuarioNombre: (f.usuario_nombre as string) ?? undefined,
    createdAt: (f.created_at as string) ?? "",
  }
}

/**
 * Saldo por cliente, solo los que tienen deuda (> 0). Trae todos los
 * movimientos del tenant y agrupa en el navegador: mismo patrón que
 * `getMetricasVentas`, apropiado para el volumen de una veterinaria.
 */
export async function getSaldosClientes(tenantId: string): Promise<ClienteConSaldo[]> {
  const { data, error } = await supabase
    .from("cuenta_corriente_movimientos")
    .select("cliente_id, tipo, monto, clientes(nombre, telefono)")
    .eq("tenant_id", tenantId)

  if (error) {
    console.error("Error calculando saldos de cuenta corriente:", error.message)
    return []
  }

  const saldos = new Map<string, { nombre: string; telefono: string; saldo: number }>()

  for (const f of (data ?? []) as Fila[]) {
    const clienteId = f.cliente_id as string
    const cliente = f.clientes as Fila | null
    const actual = saldos.get(clienteId) ?? {
      nombre: (cliente?.nombre as string) ?? "",
      telefono: (cliente?.telefono as string) ?? "",
      saldo: 0,
    }
    const monto = num(f.monto)
    actual.saldo += f.tipo === "venta" ? monto : -monto
    saldos.set(clienteId, actual)
  }

  return [...saldos.entries()]
    .map(([clienteId, v]) => ({ clienteId, ...v, saldo: Math.round(v.saldo * 100) / 100 }))
    .filter((c) => c.saldo > 0.009)
    .sort((a, b) => b.saldo - a.saldo)
}

export async function getMovimientosCliente(
  tenantId: string,
  clienteId: string,
): Promise<MovimientoCtaCte[]> {
  const { data, error } = await supabase
    .from("cuenta_corriente_movimientos")
    .select("*, ventas(numero)")
    .eq("tenant_id", tenantId)
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error listando movimientos de cuenta corriente:", error.message)
    return []
  }

  return (data ?? []).map(aMovimiento)
}

export async function registrarPagoCtaCte(
  tenantId: string,
  clienteId: string,
  monto: number,
  medioPago: MedioPago,
  observaciones?: string,
): Promise<void> {
  const { error } = await supabase.rpc("registrar_pago_cta_cte", {
    p_tenant_id: tenantId,
    p_cliente_id: clienteId,
    p_monto: monto,
    p_medio_pago: medioPago,
    p_observaciones: observaciones ?? null,
  })
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from this new file.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/cuentaCorriente.ts
git commit -m "feat: agregar capa de datos de cuenta corriente"
```

---

### Task 7: `colores-medio-pago.tsx` and `caja-management.tsx` — new medio icons/colors

**Files:**
- Modify: `components/admin/ventas/colores-medio-pago.tsx`
- Modify: `components/admin/caja-management.tsx:29-34`

- [ ] **Step 1: Add the two missing colors**

Replace the full content of `components/admin/ventas/colores-medio-pago.tsx`:

```typescript
import type { MedioPago } from "@/lib/supabase/types"

/** Un color propio por medio de pago, compartido entre el historial y el mini resumen. */
export const COLOR_MEDIO_PAGO: Record<MedioPago, string> = {
  efectivo: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  debito: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400",
  credito: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
  transferencia: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400",
  mixto: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  cuenta_corriente: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400",
}
```

- [ ] **Step 2: Add icons in `caja-management.tsx`**

In `components/admin/caja-management.tsx`, update the import (line 4-6) and
the `ICONO_MEDIO` map (lines 29-34):

```typescript
import {
  Banknote, CreditCard, History, Loader2, Receipt, Repeat, Split, UserRound, Wallet,
} from "lucide-react"
```

```typescript
const ICONO_MEDIO: Record<MedioPago, React.ComponentType<{ className?: string }>> = {
  efectivo: Banknote,
  debito: CreditCard,
  credito: CreditCard,
  transferencia: Repeat,
  mixto: Split,
  cuenta_corriente: UserRound,
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from either file — this was the last source of the
`Record<MedioPago, ...>` "missing keys" errors from Task 4.

- [ ] **Step 4: Commit**

```bash
git add components/admin/ventas/colores-medio-pago.tsx components/admin/caja-management.tsx
git commit -m "feat(ui): agregar color e ícono para mixto y cuenta corriente"
```

---

### Task 8: `ClienteSelector` — required mode + inline client creation

**Files:**
- Modify: `components/admin/pos/cliente-selector.tsx`

- [ ] **Step 1: Add `obligatorio` and inline creation**

Replace the full content of `components/admin/pos/cliente-selector.tsx`:

```typescript
"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, ChevronsUpDown, Loader2, UserPlus, UserRound, X } from "lucide-react"
import { toast } from "sonner"
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getClientesBasic, createCliente } from "@/lib/supabase/clientes"
import type { Cliente } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  seleccionado: Cliente | null
  onCambiar: (cliente: Cliente | null) => void
  /**
   * Cuando es `true` no se puede dejar en "Consumidor final": la cuenta
   * corriente necesita saber a quién se le vendió.
   */
  obligatorio?: boolean
}

/**
 * Elige a quién se le vende. Por defecto es opcional (consumidor final); con
 * `obligatorio` (cuenta corriente) hay que elegir o crear un cliente.
 *
 * Se carga la lista entera una vez y se filtra en memoria. Una veterinaria
 * tiene cientos de clientes, no cientos de miles, y así el filtrado responde
 * mientras se tipea sin ir a la base en cada tecla.
 */
export function ClienteSelector({ tenantId, seleccionado, onCambiar, obligatorio = false }: Props) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [abierto, setAbierto] = useState(false)
  const [creando, setCreando] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState("")
  const [telefonoNuevo, setTelefonoNuevo] = useState("")
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vigente = true
    getClientesBasic(tenantId).then((c) => {
      if (vigente) setClientes(c)
    })
    return () => {
      vigente = false
    }
  }, [tenantId])

  // El teléfono entra en la búsqueda: muchas veces es lo único que se sabe.
  const opciones = useMemo(
    () =>
      clientes.map((c) => ({
        cliente: c,
        buscable: `${c.nombre} ${c.telefono ?? ""} ${c.dni ?? ""}`.toLowerCase(),
      })),
    [clientes],
  )

  const crearCliente = async () => {
    if (!nombreNuevo.trim()) return
    setGuardando(true)
    try {
      const creado = await createCliente(tenantId, {
        nombre: nombreNuevo.trim(),
        telefono: telefonoNuevo.trim(),
        email: "",
      })
      setClientes((actual) => [...actual, creado])
      onCambiar(creado)
      setCreando(false)
      setAbierto(false)
      setNombreNuevo("")
      setTelefonoNuevo("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el cliente")
    } finally {
      setGuardando(false)
    }
  }

  if (seleccionado) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
        <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{seleccionado.nombre}</p>
          {seleccionado.telefono && (
            <p className="truncate text-xs text-muted-foreground">{seleccionado.telefono}</p>
          )}
        </div>
        {!obligatorio && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => onCambiar(null)}
            aria-label="Quitar cliente"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    )
  }

  return (
    <Popover
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v)
        if (!v) setCreando(false)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`w-full justify-between font-normal ${obligatorio ? "border-rose-400 text-rose-600 dark:border-rose-600 dark:text-rose-400" : ""}`}
        >
          <span className="flex items-center gap-2">
            <UserRound className="h-4 w-4" />
            {obligatorio ? "Elegí un cliente (obligatorio)" : "Consumidor final"}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        {creando ? (
          <div className="space-y-2 p-3">
            <div>
              <Label htmlFor="nuevo-cliente-nombre" className="text-xs">Nombre</Label>
              <Input
                id="nuevo-cliente-nombre"
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                placeholder="Nombre y apellido"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="nuevo-cliente-telefono" className="text-xs">Teléfono (opcional)</Label>
              <Input
                id="nuevo-cliente-telefono"
                value={telefonoNuevo}
                onChange={(e) => setTelefonoNuevo(e.target.value)}
                placeholder="11 1234-5678"
              />
            </div>
            <div className="flex justify-end gap-1.5 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setCreando(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={!nombreNuevo.trim() || guardando}
                onClick={() => void crearCliente()}
              >
                {guardando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Crear y elegir
              </Button>
            </div>
          </div>
        ) : (
          <Command
            filter={(value, search) =>
              value.includes(search.toLowerCase().trim()) ? 1 : 0
            }
          >
            <CommandInput placeholder="Buscar por nombre, teléfono o DNI" />
            <CommandList>
              <CommandEmpty>No se encontró ningún cliente</CommandEmpty>
              <CommandGroup>
                {opciones.map(({ cliente, buscable }) => (
                  <CommandItem
                    key={cliente.id}
                    value={buscable}
                    onSelect={() => {
                      onCambiar(cliente)
                      setAbierto(false)
                    }}
                  >
                    <Check className="mr-2 h-4 w-4 opacity-0" />
                    <div className="min-w-0">
                      <p className="truncate">{cliente.nombre}</p>
                      {cliente.telefono && (
                        <p className="truncate text-xs text-muted-foreground">
                          {cliente.telefono}
                        </p>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="border-t p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-muted-foreground"
                onClick={() => setCreando(true)}
              >
                <UserPlus className="h-4 w-4" />
                Nuevo cliente
              </Button>
            </div>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. `createCliente` already returns `{ id: string } & Cliente`
(see `lib/supabase/clientes.ts:78-117`), which satisfies `Cliente` for the
`setClientes`/`onCambiar` calls above.

- [ ] **Step 3: Commit**

```bash
git add components/admin/pos/cliente-selector.tsx
git commit -m "feat(pos): permitir cliente obligatorio y alta rápida en el selector"
```

---

### Task 9: `mixto-pagos.tsx` — split-payment line editor

**Files:**
- Create: `components/admin/pos/mixto-pagos.tsx`

- [ ] **Step 1: Write the component**

```typescript
"use client"

import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatCurrency } from "@/lib/format"
import { MEDIOS_PAGO_SIMPLES, type MedioPago } from "@/lib/supabase/types"

export interface LineaPagoMixto {
  medioPago: MedioPago
  monto: number
}

interface Props {
  total: number
  pagos: LineaPagoMixto[]
  onCambiar: (pagos: LineaPagoMixto[]) => void
}

/**
 * Desglose de "Mixto": una o más líneas de {medio, monto} que tienen que sumar
 * exactamente el total, o `registrar_venta` rechaza la venta. Se valida acá
 * mismo para no hacer esperar al usuario un viaje a la base para enterarse.
 */
export function MixtoPagos({ total, pagos, onCambiar }: Props) {
  const suma = pagos.reduce((acc, p) => acc + (Number(p.monto) || 0), 0)
  const resta = Math.round((total - suma) * 100) / 100

  const agregarLinea = () => {
    const medioUsado = new Set(pagos.map((p) => p.medioPago))
    const disponible = MEDIOS_PAGO_SIMPLES.find((m) => !medioUsado.has(m.id))
    onCambiar([
      ...pagos,
      { medioPago: disponible?.id ?? "efectivo", monto: resta > 0 ? resta : 0 },
    ])
  }

  const actualizarLinea = (indice: number, cambio: Partial<LineaPagoMixto>) => {
    onCambiar(pagos.map((p, i) => (i === indice ? { ...p, ...cambio } : p)))
  }

  const quitarLinea = (indice: number) => {
    onCambiar(pagos.filter((_, i) => i !== indice))
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-2.5">
      <Label className="text-xs text-muted-foreground">Desglose del pago</Label>

      {pagos.map((pago, indice) => (
        <div key={indice} className="flex items-center gap-1.5">
          <select
            value={pago.medioPago}
            onChange={(e) => actualizarLinea(indice, { medioPago: e.target.value as MedioPago })}
            className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
            aria-label="Medio de pago de esta línea"
          >
            {MEDIOS_PAGO_SIMPLES.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <Input
            type="number"
            min={0}
            value={pago.monto || ""}
            placeholder="Monto"
            className="w-28"
            onChange={(e) => actualizarLinea(indice, { monto: Number(e.target.value) || 0 })}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-600"
            onClick={() => quitarLinea(indice)}
            aria-label="Quitar línea"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={agregarLinea}>
        <Plus className="h-3.5 w-3.5" />
        Agregar línea
      </Button>

      <p className={`text-right text-xs font-medium ${resta !== 0 ? "text-red-600 dark:text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>
        {resta === 0 ? "Coincide con el total" : `Falta desglosar ${formatCurrency(Math.abs(resta))}`}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/admin/pos/mixto-pagos.tsx
git commit -m "feat(pos): agregar editor de desglose para pago mixto"
```

---

### Task 10: `carrito-panel.tsx` — 3-column grid, recargo, cuotas, mixto, cta cte

**Files:**
- Modify: `components/admin/pos/carrito-panel.tsx`

- [ ] **Step 1: Update the `Props` interface**

Replace the `Props` interface (lines 20-34):

```typescript
interface Props {
  tenantId: string
  carrito: LineaCarrito[]
  cliente: Cliente | null
  medioPago: MedioPago
  descuento: Descuento
  recargoPct: number
  cuotas: number
  recargoPorCuotas: Record<number, number>
  pagosMixto: LineaPagoMixto[]
  cobrando: boolean
  onCliente: (c: Cliente | null) => void
  onMedioPago: (m: MedioPago) => void
  onDescuento: (d: Descuento) => void
  onRecargoPct: (pct: number) => void
  onCuotas: (cuotas: number) => void
  onRecargoPorCuotas: (recargos: Record<number, number>) => void
  onPagosMixto: (pagos: LineaPagoMixto[]) => void
  onCantidad: (lineaId: string, cantidad: number) => void
  onQuitar: (lineaId: string) => void
  onVaciar: () => void
  onCobrar: () => void
}
```

- [ ] **Step 2: Update imports**

Replace the import block (lines 1-18):

```typescript
"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Minus, Plus, Scale, ShoppingCart, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ClienteSelector } from "./cliente-selector"
import { MixtoPagos, type LineaPagoMixto } from "./mixto-pagos"
import { FormatoVentaDialog } from "@/components/admin/productos/formato-venta-dialog"
import {
  descripcionLinea, subtotalLinea, totalesCarrito,
  type Descuento, type LineaCarrito,
} from "@/lib/ventas/carrito"
import { formatCurrency } from "@/lib/format"
import { MEDIOS_PAGO, type Cliente, type MedioPago } from "@/lib/supabase/types"
import { useReadOnly } from "@/lib/auth/read-only-context"

export const CUOTAS_DEFAULT: Record<number, number> = { 1: 0, 3: 10, 6: 20, 12: 35 }
```

- [ ] **Step 3: Update the component body**

Replace the function signature and the recargo-relevant computed values (the
start of the component, through the `montoRecibido`/`vuelto` block):

```typescript
export function CarritoPanel({
  tenantId,
  carrito,
  cliente,
  medioPago,
  descuento,
  recargoPct,
  cuotas,
  recargoPorCuotas,
  pagosMixto,
  cobrando,
  onCliente,
  onMedioPago,
  onDescuento,
  onRecargoPct,
  onCuotas,
  onRecargoPorCuotas,
  onPagosMixto,
  onCantidad,
  onQuitar,
  onVaciar,
  onCobrar,
}: Props) {
  const esDebito = medioPago === "debito"
  const esCredito = medioPago === "credito"
  const esMixto = medioPago === "mixto"
  const esCtaCte = medioPago === "cuenta_corriente"
  const pctAplicado = esDebito ? recargoPct : esCredito ? (recargoPorCuotas[cuotas] ?? 0) : 0

  const totales = totalesCarrito(carrito, descuento, pctAplicado)
  const vacio = carrito.length === 0
  const esEfectivo = medioPago === "efectivo"

  const sumaMixto = pagosMixto.reduce((acc, p) => acc + (Number(p.monto) || 0), 0)
  const mixtoValido = !esMixto || Math.abs(sumaMixto - totales.total) < 0.01
  const ctaCteValida = !esCtaCte || cliente !== null

  const [corrigiendo, setCorrigiendo] = useState<LineaCarrito | null>(null)

  const [pagaCon, setPagaCon] = useState("")
  const readOnly = useReadOnly()
  useEffect(() => {
    setPagaCon("")
  }, [esEfectivo, totales.total])

  const montoRecibido = Number(pagaCon) || 0
  const vuelto = montoRecibido - totales.total
```

- [ ] **Step 4: Replace the medio-de-pago grid and add the conditional panels**

Replace this block (the "Medio de pago" `<div>` through the descuento `<div>`,
originally lines 125-186):

```typescript
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Medio de pago</Label>
          <div className="grid grid-cols-3 gap-1.5">
            {MEDIOS_PAGO.map(({ id, label }) => (
              <Button
                key={id}
                type="button"
                variant={medioPago === id ? "default" : "outline"}
                size="sm"
                onClick={() => onMedioPago(id)}
                className={medioPago === id ? "bg-emerald-600 hover:bg-emerald-700" : ""}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {esCtaCte && (
          <ClienteSelector tenantId={tenantId} seleccionado={cliente} onCambiar={onCliente} obligatorio />
        )}

        {esDebito && (
          <div>
            <Label htmlFor="recargo-debito" className="mb-1.5 block text-xs text-muted-foreground">
              Recargo %
            </Label>
            <Input
              id="recargo-debito"
              type="number"
              min={0}
              step={1}
              value={recargoPct || ""}
              placeholder="5"
              onChange={(e) => onRecargoPct(Number(e.target.value) || 0)}
            />
          </div>
        )}

        {esCredito && (
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Cuotas</Label>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(recargoPorCuotas).map(Number).sort((a, b) => a - b).map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant={cuotas === n ? "default" : "outline"}
                  size="sm"
                  onClick={() => onCuotas(n)}
                  className={cuotas === n ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                >
                  {n === 1 ? "1 pago" : `${n} cuotas`}
                </Button>
              ))}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Label htmlFor="recargo-cuotas" className="text-xs text-muted-foreground">
                Recargo de {cuotas === 1 ? "1 pago" : `${cuotas} cuotas`} %
              </Label>
              <Input
                id="recargo-cuotas"
                type="number"
                min={0}
                step={1}
                className="h-7 w-20"
                value={recargoPorCuotas[cuotas] ?? 0}
                onChange={(e) =>
                  onRecargoPorCuotas({ ...recargoPorCuotas, [cuotas]: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>
        )}

        {esMixto && (
          <MixtoPagos total={totales.total} pagos={pagosMixto} onCambiar={onPagosMixto} />
        )}

        {!esCtaCte && <ClienteSelector tenantId={tenantId} seleccionado={cliente} onCambiar={onCliente} />}

        <div>
          <Label htmlFor="descuento" className="mb-1.5 block text-xs text-muted-foreground">
            Descuento
          </Label>
          <div className="flex gap-1.5">
            <Input
              id="descuento"
              type="number"
              min={0}
              max={descuento.tipo === "porcentaje" ? 100 : undefined}
              step={descuento.tipo === "porcentaje" ? 5 : 100}
              value={descuento.valor || ""}
              placeholder="0"
              onChange={(e) =>
                onDescuento({ ...descuento, valor: Number(e.target.value) || 0 })
              }
            />
            {/* Toggle $ / %: el mismo campo cambia de significado, así que el
                tipo tiene que estar pegado al número y no en otro lado. */}
            <div className="flex shrink-0 overflow-hidden rounded-md border">
              {(["monto", "porcentaje"] as const).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => onDescuento({ ...descuento, tipo })}
                  aria-pressed={descuento.tipo === tipo}
                  aria-label={tipo === "monto" ? "Descuento en pesos" : "Descuento en porcentaje"}
                  className={`w-9 text-sm font-medium transition-colors ${
                    descuento.tipo === tipo
                      ? "bg-emerald-600 text-white"
                      : "bg-transparent text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {tipo === "monto" ? "$" : "%"}
                </button>
              ))}
            </div>
          </div>
          {descuento.tipo === "porcentaje" && totales.descuento > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {descuento.valor}% = {formatCurrency(totales.descuento)}
            </p>
          )}
        </div>
```

Note: `ClienteSelector` moved above the medio-de-pago-specific panels (it now
renders once, either forced-required for cta cte or optional otherwise) —
remove the old standalone `<ClienteSelector ... />` call that used to sit right
after the "Medio de pago" block in the original file (it's replaced by the two
conditional calls above).

- [ ] **Step 5: Add the recargo line to the totals summary**

In the totals `<div className="space-y-1 text-sm">` block, add the recargo row
right after the descuento rows (after the `{totales.descuento > 0 && (...)}`
block, before the `<div className="flex items-baseline justify-between pt-1">`
Total row):

```typescript
          {totales.recargo > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Recargo</span>
              <span className="tabular-nums">+ {formatCurrency(totales.recargo)}</span>
            </div>
          )}
```

- [ ] **Step 6: Disable "Cobrar" when mixto/cta-cte are invalid**

Replace the `<Button onClick={onCobrar} ...>` disabled condition:

```typescript
        <Button
          onClick={onCobrar}
          disabled={vacio || cobrando || readOnly || !mixtoValido || !ctaCteValida}
          title={
            readOnly
              ? "Reactivá tu cuenta para editar"
              : !ctaCteValida
                ? "Elegí un cliente para vender a cuenta corriente"
                : !mixtoValido
                  ? "El desglose de pagos tiene que coincidir con el total"
                  : undefined
          }
          className="h-12 w-full bg-emerald-600 text-base hover:bg-emerald-700"
        >
          {cobrando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {cobrando ? "Cobrando…" : "Cobrar"}
        </Button>
```

- [ ] **Step 7: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: errors in `pos-management.tsx` (doesn't pass the new props yet —
fixed in Task 11). No errors inside `carrito-panel.tsx` itself.

- [ ] **Step 8: Commit**

```bash
git add components/admin/pos/carrito-panel.tsx
git commit -m "feat(pos): grilla de 3 columnas, recargo, cuotas, mixto y cta cte en el carrito"
```

---

### Task 11: `pos-management.tsx` — state, payload, validation

**Files:**
- Modify: `components/admin/pos-management.tsx`

- [ ] **Step 1: Add imports and state**

Update the import block (add `CUOTAS_DEFAULT` and `LineaPagoMixto`):

```typescript
import { CantidadDialog } from "./pos/cantidad-dialog"
import { CarritoPanel, CUOTAS_DEFAULT } from "./pos/carrito-panel"
import type { LineaPagoMixto } from "./pos/mixto-pagos"
```

(Keep the rest of the existing imports as-is; just add the two lines above
near the existing `CarritoPanel` import.)

Add new state right after the existing `descuento` state (`pos-management.tsx:51`):

```typescript
  const [descuento, setDescuento] = useState<Descuento>(SIN_DESCUENTO)
  const [recargoPct, setRecargoPct] = useState(5)
  const [cuotas, setCuotas] = useState(1)
  const [recargoPorCuotas, setRecargoPorCuotas] = useState<Record<number, number>>(CUOTAS_DEFAULT)
  const [pagosMixto, setPagosMixto] = useState<LineaPagoMixto[]>([])
```

- [ ] **Step 2: Reset the new state in `limpiar`**

Replace the `limpiar` function:

```typescript
  const limpiar = () => {
    setCarrito([])
    setCliente(null)
    setDescuento(SIN_DESCUENTO)
    setMedioPago("efectivo")
    setRecargoPct(5)
    setCuotas(1)
    setRecargoPorCuotas(CUOTAS_DEFAULT)
    setPagosMixto([])
  }
```

- [ ] **Step 3: Update `cobrar` to compute recargo and assemble the payload**

Replace the `cobrar` function:

```typescript
  const cobrar = async () => {
    if (carrito.length === 0) return

    if (medioPago === "cuenta_corriente" && !cliente) {
      toast.error("Elegí un cliente para vender a cuenta corriente")
      return
    }

    const pctRecargo =
      medioPago === "debito" ? recargoPct : medioPago === "credito" ? (recargoPorCuotas[cuotas] ?? 0) : 0

    // `totalesCarrito` ya recorta el descuento al subtotal y aplica el
    // recargo después, así que el monto que se manda nunca deja el total en
    // negativo ni desincroniza lo que se ve en pantalla de lo que se cobra.
    const totales = totalesCarrito(carrito, descuento, pctRecargo)

    if (medioPago === "mixto") {
      const suma = pagosMixto.reduce((acc, p) => acc + (Number(p.monto) || 0), 0)
      if (Math.abs(suma - totales.total) >= 0.01) {
        toast.error("El desglose de pagos tiene que coincidir con el total")
        return
      }
    }

    setCobrando(true)
    try {
      const resultado = await registrarVenta(tenantId, {
        items: itemsParaRPC(carrito),
        medioPago,
        clienteId: cliente?.id,
        descuento: totales.descuento,
        recargo: totales.recargo,
        cuotas: medioPago === "credito" ? cuotas : undefined,
        pagos: medioPago === "mixto" ? pagosMixto : undefined,
      })

      // Se relee la venta ya guardada en vez de armarla con lo que había en
      // pantalla: el remito tiene que mostrar exactamente lo que quedó en la
      // base, incluido el número y los datos congelados del cliente.
      const venta = await getVenta(tenantId, resultado.ventaId)
      if (venta) {
        setVentaHecha(venta)
      } else {
        toast.success(`Venta #${resultado.numero} registrada`)
      }

      // La venta ya está cobrada; si la historia clínica falla no hay que
      // revertir nada, solo avisar para que se cargue a mano después.
      await anotarHistoriasClinicas(carrito)

      limpiar()
      // El stock cambió, así que el resumen de la caja también.
      recargarCaja()
    } catch (e) {
      // Los mensajes de la RPC ya están escritos para el usuario
      // ("No hay stock suficiente de X"), así que se muestran tal cual.
      toast.error(e instanceof Error ? e.message : "No se pudo registrar la venta")
    } finally {
      setCobrando(false)
    }
  }
```

- [ ] **Step 4: Pass the new props to `CarritoPanel`**

Replace the `<CarritoPanel ... />` call:

```typescript
          <CarritoPanel
            tenantId={tenantId}
            carrito={carrito}
            cliente={cliente}
            medioPago={medioPago}
            descuento={descuento}
            recargoPct={recargoPct}
            cuotas={cuotas}
            recargoPorCuotas={recargoPorCuotas}
            pagosMixto={pagosMixto}
            cobrando={cobrando}
            onCliente={setCliente}
            onMedioPago={setMedioPago}
            onDescuento={setDescuento}
            onRecargoPct={setRecargoPct}
            onCuotas={setCuotas}
            onRecargoPorCuotas={setRecargoPorCuotas}
            onPagosMixto={setPagosMixto}
            onCantidad={actualizarCantidad}
            onQuitar={(id) => setCarrito((actual) => quitarDelCarrito(actual, id))}
            onVaciar={limpiar}
            onCobrar={cobrar}
          />
```

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, no errors anywhere in the POS files.

- [ ] **Step 6: Manual smoke test**

Run: `npm run dev`, open `/[tu-slug]/pos` (with an active session that has
`pos` access), and verify:
- The payment grid shows 3 columns in the new order.
- Selecting "Débito" shows the recargo field (default 5) and changes the total.
- Selecting "Crédito" shows cuotas chips; changing cuotas changes the applied %.
- Selecting "Mixto" shows the line editor; "Cobrar" is disabled until the lines sum to the total.
- Selecting "Cta Cte" forces a client (no "Consumidor final"); "Cobrar" is disabled without one; "Nuevo cliente" creates and selects one inline.
- A cash sale still works exactly as before (no regression).

- [ ] **Step 7: Commit**

```bash
git add components/admin/pos-management.tsx
git commit -m "feat(pos): conectar recargo, cuotas, mixto y cta cte al flujo de cobro"
```

---

### Task 12: Cuenta Corriente — page, sidebar, permissions, route guard

**Files:**
- Create: `components/admin/cuenta-corriente/tabla-saldos.tsx`
- Create: `components/admin/cuenta-corriente/detalle-cliente-dialog.tsx`
- Create: `components/admin/cuenta-corriente-management.tsx`
- Create: `app/[slug]/(vetadmin)/cuenta-corriente/page.tsx`
- Modify: `lib/auth/permissions.ts`
- Modify: `components/vet-admin-sidebar.tsx`
- Modify: `components/navbar.tsx:277`

- [ ] **Step 1: Add the `AdminSection`**

In `lib/auth/permissions.ts`, update the type and the map:

```typescript
export type AdminSection =
  | "dashboard" | "turnos" | "libreta" | "clientes" | "productos"
  | "pos" | "ventas" | "caja" | "cuentaCorriente" | "configuracion"
```

```typescript
const SECTION_ACCESS: Record<AdminSection, UserRole[]> = {
  dashboard: ["superadmin", "veterinario", "empleado"],
  turnos: ["superadmin", "veterinario", "empleado"],
  libreta: ["superadmin", "veterinario", "empleado"],
  clientes: ["superadmin", "veterinario", "empleado"],
  productos: ["superadmin", "veterinario", "empleado"],
  pos: ["superadmin", "veterinario", "empleado"],
  ventas: ["superadmin", "veterinario", "empleado"],
  caja: ["superadmin", "veterinario", "empleado"],
  // Cobrar cuentas pendientes es trabajo de mostrador, igual que vender.
  cuentaCorriente: ["superadmin", "veterinario", "empleado"],
  configuracion: ["superadmin", "veterinario"],
}
```

- [ ] **Step 2: Write `tabla-saldos.tsx`**

```typescript
"use client"

import { Loader2, Wallet } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import type { ClienteConSaldo } from "@/lib/supabase/cuentaCorriente"

interface Props {
  clientes: ClienteConSaldo[]
  cargando: boolean
  onVerDetalle: (cliente: ClienteConSaldo) => void
}

export function TablaSaldos({ clientes, cargando, onVerDetalle }: Props) {
  if (cargando) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (clientes.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <Wallet className="mx-auto mb-3 h-8 w-8 opacity-40" />
        Ningún cliente tiene saldo pendiente
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          <TableHead>Teléfono</TableHead>
          <TableHead className="text-right">Saldo</TableHead>
          <TableHead className="w-32 text-right">Detalle</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {clientes.map((c) => (
          <TableRow key={c.clienteId}>
            <TableCell className="font-medium">{c.nombre}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{c.telefono || "—"}</TableCell>
            <TableCell className="text-right font-semibold tabular-nums text-rose-600 dark:text-rose-400">
              {formatCurrency(c.saldo)}
            </TableCell>
            <TableCell className="text-right">
              <Button variant="outline" size="sm" onClick={() => onVerDetalle(c)}>
                Ver / cobrar
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 3: Write `detalle-cliente-dialog.tsx`**

```typescript
"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getMovimientosCliente, registrarPagoCtaCte, type ClienteConSaldo, type MovimientoCtaCte,
} from "@/lib/supabase/cuentaCorriente"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { MEDIOS_PAGO_SIMPLES, type MedioPago } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  cliente: ClienteConSaldo | null
  onCerrar: () => void
  onCambio: () => void
}

/** Historial de movimientos de un cliente y el formulario para registrar un pago. */
export function DetalleClienteDialog({ tenantId, cliente, onCerrar, onCambio }: Props) {
  const [movimientos, setMovimientos] = useState<MovimientoCtaCte[]>([])
  const [cargando, setCargando] = useState(true)
  const [monto, setMonto] = useState("")
  const [medioPago, setMedioPago] = useState<MedioPago>("efectivo")
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!cliente) return
    setCargando(true)
    getMovimientosCliente(tenantId, cliente.clienteId)
      .then(setMovimientos)
      .finally(() => setCargando(false))
  }, [tenantId, cliente])

  const registrarPago = async () => {
    if (!cliente) return
    const montoNum = Number(monto)
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      toast.error("El monto tiene que ser mayor a cero")
      return
    }

    setGuardando(true)
    try {
      await registrarPagoCtaCte(tenantId, cliente.clienteId, montoNum, medioPago)
      toast.success(`Pago de ${formatCurrency(montoNum)} registrado`)
      setMonto("")
      onCambio()
      const actualizados = await getMovimientosCliente(tenantId, cliente.clienteId)
      setMovimientos(actualizados)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar el pago")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={cliente !== null} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{cliente?.nombre}</DialogTitle>
          <DialogDescription>
            Saldo pendiente: {cliente ? formatCurrency(cliente.saldo) : "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
          <Label className="text-xs text-muted-foreground">Registrar pago</Label>
          <div className="flex gap-1.5">
            <Input
              type="number"
              min={0}
              placeholder="Monto"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
            <select
              value={medioPago}
              onChange={(e) => setMedioPago(e.target.value as MedioPago)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              {MEDIOS_PAGO_SIMPLES.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <Button onClick={() => void registrarPago()} disabled={guardando}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cobrar"}
            </Button>
          </div>
        </div>

        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {cargando ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            movimientos.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {formatDateTime(m.createdAt)} · {m.tipo === "venta" ? "Venta" : "Pago"}
                  {m.ventaNumero ? ` #${String(m.ventaNumero).padStart(5, "0")}` : ""}
                </span>
                <span className={m.tipo === "venta" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}>
                  {m.tipo === "venta" ? "+" : "-"} {formatCurrency(m.monto)}
                </span>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Write `cuenta-corriente-management.tsx`**

```typescript
"use client"

import { useCallback, useEffect, useState } from "react"
import { Wallet } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TablaSaldos } from "./cuenta-corriente/tabla-saldos"
import { DetalleClienteDialog } from "./cuenta-corriente/detalle-cliente-dialog"
import { getSaldosClientes, type ClienteConSaldo } from "@/lib/supabase/cuentaCorriente"

interface Props {
  tenantId: string
}

/** Saldos deudores por cliente, con detalle de movimientos y cobro. */
export function CuentaCorrienteManagement({ tenantId }: Props) {
  const [clientes, setClientes] = useState<ClienteConSaldo[]>([])
  const [cargando, setCargando] = useState(true)
  const [detalle, setDetalle] = useState<ClienteConSaldo | null>(null)

  const cargar = useCallback(() => {
    setCargando(true)
    getSaldosClientes(tenantId)
      .then(setClientes)
      .catch(() => toast.error("No se pudieron cargar los saldos"))
      .finally(() => setCargando(false))
  }, [tenantId])

  useEffect(() => {
    cargar()
  }, [cargar])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border bg-gradient-to-br from-rose-50 via-amber-50/60 to-transparent p-4 dark:from-rose-950/30 dark:via-amber-950/10">
        <div className="hidden rounded-xl bg-rose-600 p-2.5 text-white shadow-sm sm:flex">
          <Wallet className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cuenta corriente</h1>
          <p className="text-sm text-muted-foreground">
            Clientes con saldo pendiente y registro de cobros
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Saldos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <TablaSaldos clientes={clientes} cargando={cargando} onVerDetalle={setDetalle} />
        </CardContent>
      </Card>

      <DetalleClienteDialog
        tenantId={tenantId}
        cliente={detalle}
        onCerrar={() => setDetalle(null)}
        onCambio={cargar}
      />
    </div>
  )
}
```

- [ ] **Step 5: Write the route**

```typescript
"use client"

import { Wallet } from "lucide-react"
import { useSlug } from "@/context/slug-context"
import { FeatureGate } from "@/components/admin/feature-gate"
import { CuentaCorrienteManagement } from "@/components/admin/cuenta-corriente-management"

export default function CuentaCorrientePage() {
  const slug = useSlug()

  return (
    <FeatureGate
      tenantId={slug}
      feature="ventas"
      titulo="Cuenta corriente"
      descripcion="Vendé a cuenta y llevá el saldo de cada cliente, con sus pagos y su historial."
      planMinimo="Pro"
      icono={<Wallet className="h-6 w-6 text-rose-600 dark:text-rose-400" />}
    >
      <CuentaCorrienteManagement tenantId={slug} />
    </FeatureGate>
  )
}
```

Save as `app/[slug]/(vetadmin)/cuenta-corriente/page.tsx`. Reuses the `ventas`
feature flag (Pro plan) — cuenta corriente is part of the same mostrador
workflow as ventas/caja, not a separate paid tier.

- [ ] **Step 6: Add the sidebar entry**

In `components/vet-admin-sidebar.tsx`, add `Wallet` is already imported; add
`Landmark` (or reuse `Wallet`, but `caja` already uses `Wallet` — pick a
distinct icon) to the lucide import on line 5-8:

```typescript
import {
  Calendar, ExternalLink, FileText, LayoutDashboard, LogOut, Landmark, Package,
  Receipt, Settings, ShoppingCart, Stethoscope, Users, Wallet,
} from "lucide-react"
```

Then add the item to the "Comercio" group (after `caja`):

```typescript
    {
      titulo: "Comercio",
      tour: "comercio",
      items: [
        { href: `/${slug}/pos`,             label: "Vender",     icon: ShoppingCart, section: "pos" },
        { href: `/${slug}/productos`,       label: "Productos",  icon: Package,      section: "productos" },
        { href: `/${slug}/ventas`,          label: "Ventas",     icon: Receipt,      section: "ventas" },
        { href: `/${slug}/caja`,            label: "Caja",       icon: Wallet,       section: "caja" },
        { href: `/${slug}/cuenta-corriente`, label: "Cta Cte",   icon: Landmark,     section: "cuentaCorriente" },
      ],
    },
```

- [ ] **Step 7: Update the navbar's route regex**

In `components/navbar.tsx:277`, add `/cuenta-corriente` to the alternation:

```typescript
  const isVetAdmin =
    /^\/[^/]+(\/admin|\/turnoadmin|\/libretasanitaria|\/clientes|\/productos|\/pos|\/ventas|\/caja|\/cuenta-corriente|\/configuracion|\/onboarding)/.test(
```

(Keep the rest of that statement — only the regex string changes.)

- [ ] **Step 8: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Manual smoke test**

Run: `npm run dev`. Make a `cuenta_corriente` sale from `/pos` for a test
client, then open `/[slug]/cuenta-corriente` and verify:
- The client shows up with the correct saldo.
- "Ver / cobrar" opens the dialog with the sale listed as a `+` movement.
- Registering a partial payment reduces the saldo on reload and shows as a `-` movement.
- After the payment, check `/[slug]/caja` — the payment's amount appears in the correct medio-de-pago tile for the open shift.

- [ ] **Step 10: Commit**

```bash
git add lib/auth/permissions.ts components/vet-admin-sidebar.tsx components/navbar.tsx \
  components/admin/cuenta-corriente-management.tsx components/admin/cuenta-corriente/ \
  "app/[slug]/(vetadmin)/cuenta-corriente/page.tsx"
git commit -m "feat: agregar sección de cuenta corriente al panel"
```

---

### Task 13: Ventas/Caja — filter by medio de pago, show cuotas/mixto/cta-cte

**Files:**
- Modify: `components/admin/ventas-management.tsx`
- Modify: `components/admin/ventas/historial-ventas.tsx`

- [ ] **Step 1: Add the filter state and UI in `ventas-management.tsx`**

Add state right after `rango` (near line 62):

```typescript
  const [rango, setRango] = useState<Rango>("hoy")
  const [filtroMedio, setFiltroMedio] = useState<MedioPago | "todos">("todos")
```

Add `MedioPago` and `MEDIOS_PAGO` to the type import:

```typescript
import { MEDIOS_PAGO, type MedioPago, type Venta } from "@/lib/supabase/types"
```

Update `cargar` to pass the filter:

```typescript
  const cargar = useCallback(() => {
    setCargando(true)

    Promise.all([
      getMetricasVentas(tenantId, desde, hasta),
      getVentas(tenantId, {
        desde,
        hasta,
        porPagina: 100,
        medioPago: filtroMedio === "todos" ? undefined : filtroMedio,
      }),
    ])
      .then(([m, v]) => {
        setMetricas(m)
        setVentas(v.ventas)
      })
      .catch(() => toast.error("No se pudieron cargar las ventas"))
      .finally(() => setCargando(false))
  }, [tenantId, desde, hasta, filtroMedio])
```

Add the filter `<select>` next to the `RANGOS` buttons (inside the same
`<div className="flex flex-wrap items-center gap-2">`, right before the
`{RANGOS.map(...)}` block):

```typescript
          <select
            value={filtroMedio}
            onChange={(e) => setFiltroMedio(e.target.value as MedioPago | "todos")}
            className="h-9 rounded-md border bg-background px-2 text-sm"
            aria-label="Filtrar por medio de pago"
          >
            <option value="todos">Todos los medios</option>
            {MEDIOS_PAGO.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
```

- [ ] **Step 2: Show cuotas/mixto/cta-cte in `historial-ventas.tsx`**

Replace the "Pago" `<TableCell>` in `HistorialVentas` (currently lines 92-105):

```typescript
                  <TableCell className="text-sm">
                    {anulada ? (
                      <Badge variant="destructive">Anulada</Badge>
                    ) : venta.esPagoCtaCte ? (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-400">
                        Pago cta. cte.
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            COLOR_MEDIO_PAGO[venta.medioPago],
                          )}
                        >
                          {MEDIOS_PAGO.find((m) => m.id === venta.medioPago)?.label}
                          {venta.medioPago === "credito" && venta.cuotas ? ` x${venta.cuotas}` : ""}
                        </span>
                        {venta.medioPago === "mixto" && venta.pagos && venta.pagos.length > 0 && (
                          <span
                            className="text-xs text-muted-foreground"
                            title={venta.pagos
                              .map((p) => `${MEDIOS_PAGO.find((m) => m.id === p.medioPago)?.label}: ${formatCurrency(p.monto)}`)
                              .join(" · ")}
                          >
                            ⓘ
                          </span>
                        )}
                      </span>
                    )}
                  </TableCell>
```

This requires `venta.pagos` to be populated, which it now is because
`VENTA_COLS` fetches `venta_pagos(*)` (Task 5).

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual smoke test**

From `/[slug]/ventas`, make sales with each new medio (mixto, cuenta_corriente,
credito x3) from the POS first, then verify:
- The medio-de-pago filter narrows the historial correctly.
- Credit sales show "Crédito x3".
- Mixto sales show a tooltip with the breakdown.
- Cta-cte payments (from Task 12's dialog) show as "Pago cta. cte.".

- [ ] **Step 5: Commit**

```bash
git add components/admin/ventas-management.tsx components/admin/ventas/historial-ventas.tsx
git commit -m "feat(ventas): filtrar por medio de pago y mostrar cuotas/mixto/cta cte"
```

---

### Task 14: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the untouched `carrito.test.ts` cases from
before this feature.

- [ ] **Step 2: Run the full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: no new warnings/errors introduced by this feature's files.

- [ ] **Step 4: Manual end-to-end pass**

Run `npm run dev` and walk the whole flow once, in order:
1. Open caja (`/[slug]/caja`) with a starting balance.
2. Sell in cash (existing flow — no regression).
3. Sell in débito with a 5% recargo — confirm total.
4. Sell in crédito x6 with a 20% recargo — confirm total and that the sale
   shows "Crédito x6" in `/[slug]/ventas`.
5. Sell mixto (efectivo + transferencia) — confirm the breakdown shows in the
   historial tooltip.
6. Sell cuenta_corriente to a new client created inline — confirm it appears
   in `/[slug]/cuenta-corriente` with the right saldo.
7. Register a partial payment from that client's dialog — confirm the saldo
   drops and the payment appears in `/[slug]/caja` for the open shift.
8. Close the caja and confirm the arqueo totals (efectivo/otros) include the
   cta-cte payment correctly.

- [ ] **Step 5: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: ajustes de regresión sobre medios de pago y cuenta corriente"
```

