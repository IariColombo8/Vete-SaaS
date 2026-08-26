# Medios de pago ampliados + Cuenta corriente — diseño

Fecha: 2026-08-26

## Contexto

El POS hoy soporta cuatro medios de pago fijos (`efectivo`, `debito`, `credito`,
`transferencia`), sin recargo por tarjeta, sin desglose de pagos combinados y sin
forma de vender "a cuenta" a un cliente. `ventas` y `caja` no tienen filtro por
medio de pago en la UI (aunque `VentasFiltro.medioPago` ya existe en
`lib/supabase/ventas.ts`, sin usar).

## Alcance

1. Reordenar y ampliar los medios de pago del POS a:
   `efectivo · transferencia · mixto / debito · credito · cuenta_corriente`
   (grid de 3 columnas, dos filas).
2. Cuenta corriente **real**: saldo deudor por cliente, con pantalla propia para
   verlo y registrar pagos. Los pagos impactan la caja del día.
3. Recargo por débito/crédito, editable, con un % distinto según la cantidad de
   cuotas en crédito (editable en el momento de la venta, no persistido).
4. "Mixto" con desglose de montos por medio (deben sumar el total).
5. Ventas y Caja muestran y permiten filtrar por los medios nuevos, cuotas y
   desglose de mixto.

## Base de datos

Nueva migración `supabase/006_cuenta_corriente.sql`, sobre lo que dejó
`005_ventas.sql`.

### Tipos

```sql
alter type medio_pago add value if not exists 'mixto';
alter type medio_pago add value if not exists 'cuenta_corriente';
```

### `ventas` — columnas nuevas

- `recargo numeric(12,2) not null default 0` — importe de recargo ya sumado al `total`.
- `cuotas integer` — solo tiene sentido con `medio_pago = 'credito'`.
- `es_pago_cta_cte boolean not null default false` — distingue un cobro de cuenta
  corriente (sin items) de una venta real. Se filtra fuera del "top productos" y
  de cualquier reporte que agrupe por `venta_items` (ya lo hace de forma natural
  porque esas filas no tienen items).

### `venta_pagos` — desglose de "mixto"

```sql
create table public.venta_pagos (
  id           uuid primary key default gen_random_uuid(),
  venta_id     uuid not null references public.ventas(id) on delete cascade,
  tenant_id    text not null references public.tenants(slug) on delete cascade,
  medio_pago   medio_pago not null,   -- nunca 'mixto' ni 'cuenta_corriente' acá
  monto        numeric(12,2) not null check (monto > 0)
);
```

Solo se llena cuando `ventas.medio_pago = 'mixto'`. La suma de `venta_pagos.monto`
para una venta tiene que dar exactamente `ventas.total` — lo valida `registrar_venta`
en el mismo insert, no un trigger aparte.

### `cuenta_corriente_movimientos` — la cuenta corriente real

```sql
create table public.cuenta_corriente_movimientos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text not null references public.tenants(slug) on delete cascade,
  cliente_id    uuid not null references public.clientes(id) on delete cascade,
  tipo          text not null check (tipo in ('venta', 'pago')),
  monto         numeric(12,2) not null check (monto > 0),
  venta_id      uuid references public.ventas(id) on delete set null,
  observaciones text not null default '',
  usuario_nombre text,
  created_at    timestamptz not null default now()
);

create index idx_cta_cte_cliente on public.cuenta_corriente_movimientos (tenant_id, cliente_id, created_at desc);
```

El saldo de un cliente **no se desnormaliza**: es
`sum(monto) filter (where tipo='venta') - sum(monto) filter (where tipo='pago')`.
Se calcula en una vista o directamente en la consulta de `lib/supabase/cuentaCorriente.ts`
— con el volumen de una veterinaria (cientos de movimientos) alcanza de sobra, y
evita el problema clásico de un desnormalizado que se desincroniza.

RLS: mismo patrón que el resto — `es_staff(tenant_id)` para `select`; inserts solo
vía las RPC de abajo (`security definer`).

### `registrar_venta` — firma extendida

```sql
create or replace function public.registrar_venta(
  p_tenant_id      text,
  p_items          jsonb,
  p_medio_pago     text default 'efectivo',
  p_cliente_id     uuid default null,
  p_descuento      numeric default 0,
  p_observaciones  text default null,
  p_recargo        numeric default 0,
  p_cuotas         integer default null,
  p_pagos          jsonb default null  -- [{ medio_pago, monto }], solo si medio='mixto'
) returns jsonb
```

Reglas nuevas dentro de la función:

- `p_medio_pago in (..., 'mixto', 'cuenta_corriente')` se agrega a la validación existente.
- Si `p_medio_pago = 'cuenta_corriente'`: `p_cliente_id` es obligatorio (si no,
  `raise exception 'La cuenta corriente necesita un cliente'`). Al final, después
  de insertar la venta, se inserta un movimiento `tipo='venta'` en
  `cuenta_corriente_movimientos` por `v_total`.
- Si `p_medio_pago = 'mixto'`: `p_pagos` es obligatorio y no vacío; se valida que
  `sum(pagos[].monto) = v_total` (con tolerancia de redondeo de 1 centavo), si no
  `raise exception 'El desglose de pagos no coincide con el total'`. Se insertan
  las filas de `venta_pagos` después de conocer `v_total`.
- `v_total` pasa a calcularse como `greatest(v_suma - p_descuento, 0) + p_recargo`
  (el recargo ya viene calculado en pesos desde el cliente, igual que hace hoy
  `p_descuento`).
- `ventas.recargo` y `ventas.cuotas` se graban tal cual llegan.

### `registrar_pago_cta_cte` — nueva RPC

```sql
create or replace function public.registrar_pago_cta_cte(
  p_tenant_id     text,
  p_cliente_id    uuid,
  p_monto         numeric,
  p_medio_pago    text,        -- efectivo | debito | credito | transferencia
  p_observaciones text default null
) returns jsonb
```

Valida `es_staff`, monto > 0, medio de pago distinto de `mixto`/`cuenta_corriente`
(no tiene sentido pagar la cuenta corriente "a cuenta corriente"). Inserta:

1. Una fila en `ventas` con `es_pago_cta_cte = true`, `medio_pago = p_medio_pago`,
   `cliente_id = p_cliente_id`, `subtotal = 0`, `descuento = 0`, `total = p_monto`,
   numerada con el mismo correlativo que las ventas (así aparece en el historial
   y en el arqueo de caja sin lógica especial), imputada a la caja abierta si hay una.
2. Un movimiento `tipo = 'pago'` en `cuenta_corriente_movimientos` con
   `venta_id` apuntando a la fila anterior.

No valida que el pago no supere el saldo — un cliente puede tener saldo a favor,
no es un error de la aplicación.

## `lib/ventas/carrito.ts`

`totalesCarrito` gana un parámetro opcional de recargo:

```ts
export function totalesCarrito(
  carrito: LineaCarrito[],
  descuento: Descuento = SIN_DESCUENTO,
  recargoPorcentaje = 0,
): TotalesCarrito
```

`TotalesCarrito` gana el campo `recargo: number`. El recargo se aplica **después**
del descuento: `total = round2((subtotal - descuento) * (1 + recargoPorcentaje / 100))`.
Sigue siendo puro, se testea igual que el resto del archivo.

## `lib/supabase/types.ts`

```ts
export type MedioPago =
  | "efectivo" | "transferencia" | "mixto"
  | "debito" | "credito" | "cuenta_corriente"

export const MEDIOS_PAGO: { id: MedioPago; label: string }[] = [
  { id: "efectivo", label: "Efectivo" },
  { id: "transferencia", label: "Transferencia" },
  { id: "mixto", label: "Mixto" },
  { id: "debito", label: "Débito" },
  { id: "credito", label: "Crédito" },
  { id: "cuenta_corriente", label: "Cta Cte" },
]
```

El orden de este array es el que usa la grilla del POS — no hace falta un array
separado para el layout.

`Venta` gana `recargo: number`, `cuotas?: number`, `esPagoCtaCte: boolean`,
`pagos?: { medioPago: MedioPago; monto: number }[]` (solo poblado cuando se pide
el detalle, igual que `items`).

## POS — `carrito-panel.tsx` / `pos-management.tsx`

- Grid de medios de pago: `grid-cols-3` con el orden de `MEDIOS_PAGO`.
- Estado nuevo en `PosManagement`: `recargoPct`, `cuotas`, `pagosMixto`.
- **Débito:** campo "Recargo %" (default 5, editable), mismo patrón que el campo
  de descuento existente (número + no negativo).
- **Crédito:** selector de cuotas (chips 1/3/6/12) — cada chip tiene un
  `recargoPct` propio en un `Record<number, number>` con defaults
  `{1: 0, 3: 10, 6: 20, 12: 35}`, editable con un input al lado del chip
  seleccionado. No se persiste: cada venta arranca de nuevo con los defaults.
- **Mixto:** lista editable de `{ medioPago, monto }` (excluye `mixto` y
  `cuenta_corriente` de las opciones de cada línea), con botón "agregar línea" y
  la resta pendiente mostrada en vivo (`total - suma cargada`). El botón "Cobrar"
  se deshabilita mientras la resta no sea cero.
- **Cta Cte:** `ClienteSelector` dejar de tener la opción "Consumidor final"
  cuando `medioPago === 'cuenta_corriente'` — se fuerza a elegir o crear cliente.
  Se agrega una acción "Nuevo cliente" dentro del mismo popover que abre un mini
  formulario (nombre + teléfono opcional) y llama a `createCliente`.
- `cobrar()` arma el payload:

```ts
registrarVenta(tenantId, {
  items: itemsParaRPC(carrito),
  medioPago,
  clienteId: cliente?.id,
  descuento: totales.descuento,
  recargo: totales.recargo,
  cuotas: medioPago === "credito" ? cuotasSeleccionadas : undefined,
  pagos: medioPago === "mixto" ? pagosMixto : undefined,
})
```

- Validación antes de llamar a la RPC (mensajes en el propio componente, para no
  depender del error crudo de Postgres en el caso común):
  - `cuenta_corriente` sin cliente → toast y no se llama a la RPC.
  - `mixto` con suma distinta del total → ya bloqueado por el botón deshabilitado.

## Cta Cte — sección nueva

- `lib/supabase/cuentaCorriente.ts`: `getSaldosClientes(tenantId)` (clientes con
  saldo > 0, calculado con una agregación sobre `cuenta_corriente_movimientos`),
  `getMovimientosCliente(tenantId, clienteId)`, `registrarPago(...)` (wrapper de
  la RPC).
- `components/admin/cuenta-corriente-management.tsx` + subcomponentes en
  `components/admin/cuenta-corriente/`: tabla de clientes con saldo, diálogo de
  detalle (movimientos) y diálogo "Registrar pago" (monto + medio de pago +
  observaciones opcional).
- Ruta `app/[slug]/(vetadmin)/cuenta-corriente/page.tsx`.
- Sidebar: entrada nueva en el grupo **Comercio** de `vet-admin-sidebar.tsx`.
- `components/navbar.tsx`: agregar `/cuenta-corriente` al regex `isVetAdmin`.
- `lib/auth/permissions.ts`: sección `cuentaCorriente`, visible para `empleado`
  igual que `pos`/`ventas`/`caja`.
- `lib/plans.ts`: gate en el mismo plan que `ventas` (Pro) — es parte del mismo
  flujo de mostrador.

## Ventas y Caja

- `HistorialVentas` (o el contenedor `VentasManagement`) suma un `<Select>` de
  medio de pago que alimenta `VentasFiltro.medioPago` (ya soportado por
  `getVentas`, sin UI hoy).
- Columna "Pago" de la tabla:
  - `credito` con cuotas → `Crédito x3`.
  - `mixto` → badge con tooltip/popover listando el desglose (`Efectivo $500 · Débito $500`).
  - `es_pago_cta_cte` → fila distinguida (ej. ícono de pago, texto "Pago cta. cte. — <cliente>").
- `caja-management.tsx`: `ICONO_MEDIO` y `colores-medio-pago.ts` ganan entradas
  para `mixto` y `cuenta_corriente`. La grilla de tarjetas por medio de pago ya
  itera genéricamente sobre `MEDIOS_PAGO`, así que los dos medios nuevos aparecen
  solos, sin tocar el layout.

## Testing

- `lib/ventas/carrito.test.ts`: casos nuevos para `totalesCarrito` con recargo
  (solo, combinado con descuento, con redondeo).
- Tests de validación del payload de "mixto" (suma exacta, con y sin redondeo de
  centavos) y de que "cuenta corriente" sin cliente no arma el payload.

## Fuera de alcance

- No se valida que un pago de cuenta corriente no exceda el saldo (saldo a favor
  es válido).
- No hay interés compuesto ni vencimientos por cuota — el recargo es un monto
  fijo en pesos sobre el total, no una cuenta a pagar en el tiempo.
- No se migran ventas históricas: `recargo`, `cuotas` y `es_pago_cta_cte` nacen
  con default y las ventas viejas quedan en 0/false.
