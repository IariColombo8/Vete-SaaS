# Ofertas, Promociones y Sorteos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la base de datos y las pantallas admin de Ofertas/Promociones/Sorteos, más la alta pública de clientes, según `docs/superpowers/specs/2026-08-26-ofertas-promos-sorteos-design.md`.

**Architecture:** Tres tablas nuevas (`promociones`+`promocion_items`, `sorteos`+`sorteo_premios`+`sorteo_ganadores`) con RLS igual que `productos`; una capa de datos por dominio (`lib/supabase/promociones.ts`, `lib/supabase/sorteos.ts`); lógica pura testeada para detectar promos en el carrito y para sortear ganadores; una página admin con tabs que reutiliza el `OfertaDialog` ya existente (movido desde `productos-management.tsx`); un botón + detección automática en el POS; y una ruta pública server-validada para el alta de clientes.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS + Storage), Zod, Vitest, shadcn/ui.

---

## Cobertura del spec

- Ofertas: se mueven de `productos-management.tsx` a la nueva sección → Tareas 7, 8.
- Promociones (tabla + CRUD + UI + aplicación en POS) → Tareas 1, 2, 4, 9, 10, 12.
- Sorteos (tabla + CRUD + participantes + sorteo aleatorio + UI) → Tareas 1, 3, 5, 6, 11.
- Alta pública de cliente → Tarea 13.
- Permisos, plan, sidebar → Tarea 14.
- Fuera de alcance (banner home, promos en home público, mail masivo): no tienen tareas, a propósito.

---

### Tarea 1: Migración SQL — tablas de promociones y sorteos

**Files:**
- Create: `supabase/020_ofertas_promos_sorteos.sql`

- [ ] **Paso 1: Escribir la migración completa**

```sql
-- ============================================================================
-- 020. Promociones y sorteos.
--
-- Las ofertas siguen viviendo en `productos.oferta_*` (016/018) — acá solo se
-- agregan promociones (combos de varios productos a precio fijo) y sorteos
-- (chances calculadas on-demand desde `ventas`, no persistidas).
-- ============================================================================

-- 1. PROMOCIONES ------------------------------------------------------------

create table if not exists public.promociones (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text not null references public.tenants(slug),
  nombre        text not null,
  descripcion   text,
  precio_final  numeric(12,2) not null check (precio_final >= 0),
  activa        boolean not null default true,
  desde         date,
  hasta         date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint promociones_fechas_ck check (hasta is null or desde is null or hasta >= desde)
);

create index if not exists promociones_tenant_idx on public.promociones(tenant_id);

create table if not exists public.promocion_items (
  id            uuid primary key default gen_random_uuid(),
  promocion_id  uuid not null references public.promociones(id) on delete cascade,
  producto_id   uuid not null references public.productos(id),
  cantidad      integer not null check (cantidad > 0)
);

create index if not exists promocion_items_promocion_idx on public.promocion_items(promocion_id);
create index if not exists promocion_items_producto_idx  on public.promocion_items(producto_id);

-- 2. SORTEOS -----------------------------------------------------------------

do $$ begin
  create type sorteo_estado as enum ('borrador', 'activo', 'finalizado');
exception when duplicate_object then null;
end $$;

create table if not exists public.sorteos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null references public.tenants(slug),
  nombre      text not null,
  descripcion text,
  foto_url    text,
  desde       date not null,
  hasta       date not null,
  estado      sorteo_estado not null default 'borrador',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint sorteos_fechas_ck check (hasta >= desde)
);

create index if not exists sorteos_tenant_idx on public.sorteos(tenant_id);

create table if not exists public.sorteo_premios (
  id          uuid primary key default gen_random_uuid(),
  sorteo_id   uuid not null references public.sorteos(id) on delete cascade,
  orden       integer not null,
  nombre      text not null,
  descripcion text,
  foto_url    text,
  constraint sorteo_premios_orden_uk unique (sorteo_id, orden)
);

create table if not exists public.sorteo_ganadores (
  id           uuid primary key default gen_random_uuid(),
  sorteo_id    uuid not null references public.sorteos(id) on delete cascade,
  premio_id    uuid not null references public.sorteo_premios(id) unique,
  cliente_id   uuid not null references public.clientes(id),
  venta_id     uuid not null references public.ventas(id),
  sorteado_en  timestamptz not null default now()
);

create index if not exists sorteo_ganadores_sorteo_idx on public.sorteo_ganadores(sorteo_id);

-- 3. RLS ----------------------------------------------------------------------
-- Mismo criterio que productos: solo staff del tenant, nada público.

alter table public.promociones      enable row level security;
alter table public.promocion_items  enable row level security;
alter table public.sorteos          enable row level security;
alter table public.sorteo_premios   enable row level security;
alter table public.sorteo_ganadores enable row level security;

drop policy if exists promociones_staff on public.promociones;
create policy promociones_staff on public.promociones for all
  using (es_staff(tenant_id)) with check (es_staff(tenant_id));

drop policy if exists promocion_items_staff on public.promocion_items;
create policy promocion_items_staff on public.promocion_items for all
  using (es_staff((select tenant_id from public.promociones where id = promocion_id)))
  with check (es_staff((select tenant_id from public.promociones where id = promocion_id)));

drop policy if exists sorteos_staff on public.sorteos;
create policy sorteos_staff on public.sorteos for all
  using (es_staff(tenant_id)) with check (es_staff(tenant_id));

drop policy if exists sorteo_premios_staff on public.sorteo_premios;
create policy sorteo_premios_staff on public.sorteo_premios for all
  using (es_staff((select tenant_id from public.sorteos where id = sorteo_id)))
  with check (es_staff((select tenant_id from public.sorteos where id = sorteo_id)));

drop policy if exists sorteo_ganadores_staff on public.sorteo_ganadores;
create policy sorteo_ganadores_staff on public.sorteo_ganadores for all
  using (es_staff((select tenant_id from public.sorteos where id = sorteo_id)))
  with check (es_staff((select tenant_id from public.sorteos where id = sorteo_id)));
```

- [ ] **Paso 2: Ejecutar la migración en el SQL Editor de Supabase (proyecto de desarrollo) y confirmar que corre sin errores.**

No hay test automatizado para migraciones (se corren a mano, igual que las anteriores del proyecto). Verificar con:

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name in
  ('promociones', 'promocion_items', 'sorteos', 'sorteo_premios', 'sorteo_ganadores');
```

Expected: las 5 filas.

- [ ] **Paso 3: Commit**

```bash
git add supabase/020_ofertas_promos_sorteos.sql
git commit -m "feat(db): tablas de promociones y sorteos con RLS"
```

---

### Tarea 2: Tipos y capa de datos — Promociones

**Files:**
- Modify: `lib/supabase/types.ts`
- Create: `lib/supabase/promociones.ts`
- Test: `lib/supabase/promociones.test.ts`

- [ ] **Paso 1: Agregar los tipos a `lib/supabase/types.ts`**

Insertar después de la interfaz `Producto` (línea 347, después del cierre `}`):

```typescript
export interface PromocionItem {
  id?: string
  productoId: string
  cantidad: number
}

export interface Promocion {
  id: string
  nombre: string
  descripcion?: string
  precioFinal: number
  activa: boolean
  /** YYYY-MM-DD. undefined = sin fecha de inicio. */
  desde?: string
  /** YYYY-MM-DD. undefined = sin vencimiento. */
  hasta?: string
  items: PromocionItem[]
  createdAt?: string
  updatedAt?: string
}
```

- [ ] **Paso 2: Escribir el test de la función pura `promocionVigente` (antes de implementarla)**

```typescript
// lib/supabase/promociones.test.ts
import { describe, it, expect } from "vitest"
import { promocionVigente } from "./promociones"
import type { Promocion } from "./types"

function promo(overrides: Partial<Promocion> = {}): Promocion {
  return {
    id: "1", nombre: "Test", precioFinal: 100, activa: true, items: [],
    ...overrides,
  }
}

describe("promocionVigente", () => {
  it("es vigente sin fechas si esta activa", () => {
    expect(promocionVigente(promo(), new Date("2026-06-01"))).toBe(true)
  })

  it("no es vigente si esta desactivada", () => {
    expect(promocionVigente(promo({ activa: false }), new Date("2026-06-01"))).toBe(false)
  })

  it("no es vigente antes de 'desde'", () => {
    expect(promocionVigente(promo({ desde: "2026-06-10" }), new Date("2026-06-01"))).toBe(false)
  })

  it("no es vigente despues de 'hasta' (incluye todo el dia)", () => {
    expect(promocionVigente(promo({ hasta: "2026-06-01" }), new Date("2026-06-01T23:00:00"))).toBe(true)
    expect(promocionVigente(promo({ hasta: "2026-06-01" }), new Date("2026-06-02T00:00:01"))).toBe(false)
  })
})
```

- [ ] **Paso 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/supabase/promociones.test.ts`
Expected: FAIL — `Cannot find module './promociones'` (el archivo no existe todavía).

- [ ] **Paso 3: Crear `lib/supabase/promociones.ts` con la capa de datos completa**

```typescript
import { supabase } from "./config"
import type { Promocion, PromocionItem } from "./types"

/**
 * Promociones (combos de varios productos a precio fijo). El precio de cada
 * unidad involucrada no se recalcula acá: `promocionVigente` decide si aplica
 * hoy, y `lib/ventas/promociones.ts` decide cuánto descuenta en un carrito.
 */

type Fila = Record<string, unknown>

function aPromocion(f: Fila, items: Fila[]): Promocion {
  return {
    id: f.id as string,
    nombre: (f.nombre as string) ?? "",
    descripcion: (f.descripcion as string) ?? undefined,
    precioFinal: Number(f.precio_final) || 0,
    activa: (f.activa as boolean) ?? false,
    desde: (f.desde as string) ?? undefined,
    hasta: (f.hasta as string) ?? undefined,
    items: items.map((i) => ({
      id: i.id as string,
      productoId: i.producto_id as string,
      cantidad: Number(i.cantidad) || 0,
    })),
    createdAt: (f.created_at as string) ?? undefined,
    updatedAt: (f.updated_at as string) ?? undefined,
  }
}

function mensajeError(error: { message: string }, accion: string): Error {
  return new Error(`${accion}: ${error.message}`)
}

/** ¿La promoción aplica hoy? Vence al final del día de `hasta`, igual que las ofertas. */
export function promocionVigente(
  p: Pick<Promocion, "activa" | "desde" | "hasta">,
  hoy: Date = new Date(),
): boolean {
  if (!p.activa) return false
  if (p.desde) {
    const inicio = new Date(`${p.desde}T00:00:00`)
    if (!Number.isNaN(inicio.getTime()) && hoy.getTime() < inicio.getTime()) return false
  }
  if (p.hasta) {
    const fin = new Date(`${p.hasta}T23:59:59.999`)
    if (!Number.isNaN(fin.getTime()) && hoy.getTime() > fin.getTime()) return false
  }
  return true
}

export async function getPromociones(tenantId: string): Promise<Promocion[]> {
  const { data, error } = await supabase
    .from("promociones")
    .select("*, promocion_items(*)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
  if (error) throw mensajeError(error, "No se pudieron cargar las promociones")

  return (data ?? []).map((f: Fila) => aPromocion(f, (f.promocion_items as Fila[]) ?? []))
}

/** Solo las vigentes hoy — lo que usa el POS para detectar combos en el carrito. */
export async function getPromocionesVigentes(tenantId: string): Promise<Promocion[]> {
  const todas = await getPromociones(tenantId)
  return todas.filter((p) => promocionVigente(p))
}

export interface PromocionInput {
  nombre: string
  descripcion?: string
  precioFinal: number
  activa: boolean
  desde?: string | null
  hasta?: string | null
  items: Pick<PromocionItem, "productoId" | "cantidad">[]
}

export async function createPromocion(tenantId: string, input: PromocionInput): Promise<Promocion> {
  const { data: creada, error } = await supabase
    .from("promociones")
    .insert({
      tenant_id: tenantId,
      nombre: input.nombre,
      descripcion: input.descripcion || null,
      precio_final: input.precioFinal,
      activa: input.activa,
      desde: input.desde || null,
      hasta: input.hasta || null,
    })
    .select("*")
    .single()
  if (error) throw mensajeError(error, "No se pudo crear la promoción")

  const items = input.items.map((i) => ({
    promocion_id: creada.id, producto_id: i.productoId, cantidad: i.cantidad,
  }))
  const { error: errorItems } = await supabase.from("promocion_items").insert(items)
  if (errorItems) throw mensajeError(errorItems, "No se pudieron guardar los productos de la promoción")

  return aPromocion(creada, items.map((i) => ({ ...i, id: undefined })))
}

export async function updatePromocion(
  tenantId: string,
  id: string,
  input: PromocionInput,
): Promise<void> {
  const { error } = await supabase
    .from("promociones")
    .update({
      nombre: input.nombre,
      descripcion: input.descripcion || null,
      precio_final: input.precioFinal,
      activa: input.activa,
      desde: input.desde || null,
      hasta: input.hasta || null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", id)
  if (error) throw mensajeError(error, "No se pudo actualizar la promoción")

  // Reemplazo completo de los items: más simple y seguro que diffear altas/bajas.
  const { error: errorBorrado } = await supabase.from("promocion_items").delete().eq("promocion_id", id)
  if (errorBorrado) throw mensajeError(errorBorrado, "No se pudieron actualizar los productos de la promoción")

  const items = input.items.map((i) => ({ promocion_id: id, producto_id: i.productoId, cantidad: i.cantidad }))
  const { error: errorItems } = await supabase.from("promocion_items").insert(items)
  if (errorItems) throw mensajeError(errorItems, "No se pudieron guardar los productos de la promoción")
}

export async function eliminarPromocion(tenantId: string, id: string): Promise<void> {
  const { error } = await supabase.from("promociones").delete().eq("tenant_id", tenantId).eq("id", id)
  if (error) throw mensajeError(error, "No se pudo eliminar la promoción")
}
```

- [ ] **Paso 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/supabase/promociones.test.ts`
Expected: PASS (4 tests)

- [ ] **Paso 5: Commit**

```bash
git add lib/supabase/types.ts lib/supabase/promociones.ts lib/supabase/promociones.test.ts
git commit -m "feat(promos): tipos y capa de datos de promociones"
```

---

### Tarea 3: Tipos y capa de datos — Sorteos

**Files:**
- Modify: `lib/supabase/types.ts`
- Create: `lib/supabase/sorteos.ts`
- Test: `lib/supabase/sorteos.test.ts`

- [ ] **Paso 1: Agregar los tipos a `lib/supabase/types.ts`** (después de los tipos de `Promocion` agregados en la Tarea 2)

```typescript
export type SorteoEstado = "borrador" | "activo" | "finalizado"

export interface SorteoPremio {
  id?: string
  orden: number
  nombre: string
  descripcion?: string
  fotoUrl?: string
}

export interface SorteoGanador {
  premioId: string
  clienteId: string
  clienteNombre: string
  ventaId: string
  ventaNumero: number
  sorteadoEn: string
}

export interface Sorteo {
  id: string
  nombre: string
  descripcion?: string
  fotoUrl?: string
  desde: string
  hasta: string
  estado: SorteoEstado
  premios: SorteoPremio[]
  ganadores: SorteoGanador[]
  createdAt?: string
  updatedAt?: string
}

/** Un cliente y cuántas ventas (= chances) hizo dentro del rango del sorteo. */
export interface ParticipanteSorteo {
  clienteId: string
  clienteNombre: string
  chances: number
  /** IDs de las ventas que dieron esas chances, para sortear una al azar como "ganadora". */
  ventaIds: string[]
}
```

- [ ] **Paso 2: Escribir el test de `sorteoVigenteParaCerrar` y de la selección aleatoria ponderada (antes de implementar)**

```typescript
// lib/supabase/sorteos.test.ts
import { describe, it, expect, vi } from "vitest"
import { elegirGanador } from "./sorteos"
import type { ParticipanteSorteo } from "./types"

describe("elegirGanador", () => {
  it("elige siempre al unico participante si es el unico", () => {
    const participantes: ParticipanteSorteo[] = [
      { clienteId: "a", clienteNombre: "Iara", chances: 10, ventaIds: ["v1", "v2"] },
    ]
    const ganador = elegirGanador(participantes, () => 0.5)
    expect(ganador?.clienteId).toBe("a")
  })

  it("devuelve null si no hay participantes", () => {
    expect(elegirGanador([], () => 0)).toBeNull()
  })

  it("pesa la eleccion por cantidad de chances: random bajo cae en el primero", () => {
    const participantes: ParticipanteSorteo[] = [
      { clienteId: "a", clienteNombre: "Iara", chances: 9, ventaIds: ["v1"] },
      { clienteId: "b", clienteNombre: "Bruno", chances: 1, ventaIds: ["v2"] },
    ]
    // 9 chances de "a" sobre 10 totales: random() = 0.1 (10%) todavia cae en "a" (rango [0, 0.9)).
    const ganador = elegirGanador(participantes, () => 0.1)
    expect(ganador?.clienteId).toBe("a")
  })

  it("random alto cae en el ultimo participante", () => {
    const participantes: ParticipanteSorteo[] = [
      { clienteId: "a", clienteNombre: "Iara", chances: 9, ventaIds: ["v1"] },
      { clienteId: "b", clienteNombre: "Bruno", chances: 1, ventaIds: ["v2"] },
    ]
    // random() = 0.95 (95%) cae en el rango de "b" ([0.9, 1)).
    const ganador = elegirGanador(participantes, () => 0.95)
    expect(ganador?.clienteId).toBe("b")
  })

  it("elige una venta al azar entre las del ganador", () => {
    const participantes: ParticipanteSorteo[] = [
      { clienteId: "a", clienteNombre: "Iara", chances: 3, ventaIds: ["v1", "v2", "v3"] },
    ]
    const ganador = elegirGanador(participantes, () => 0, () => 0.999)
    expect(ganador?.ventaId).toBe("v3")
  })
})
```

- [ ] **Paso 3: Correr el test para verificar que falla**

Run: `npx vitest run lib/supabase/sorteos.test.ts`
Expected: FAIL — módulo `./sorteos` no existe.

- [ ] **Paso 4: Crear `lib/supabase/sorteos.ts`**

```typescript
import { supabase } from "./config"
import type { ParticipanteSorteo, Sorteo, SorteoEstado, SorteoGanador, SorteoPremio } from "./types"

/**
 * Sorteos. Las "chances" no se persisten: se calculan on-demand a partir de
 * `ventas` con cliente asociado dentro del rango de fechas del sorteo (ver
 * `getParticipantes`). El sorteo en sí (`elegirGanador`) es puro y testeado
 * sin tocar la base, para poder confiar en el mecanismo de azar ponderado.
 */

type Fila = Record<string, unknown>

function aPremio(f: Fila): SorteoPremio {
  return {
    id: f.id as string,
    orden: Number(f.orden) || 0,
    nombre: (f.nombre as string) ?? "",
    descripcion: (f.descripcion as string) ?? undefined,
    fotoUrl: (f.foto_url as string) ?? undefined,
  }
}

function aGanador(f: Fila): SorteoGanador {
  return {
    premioId: f.premio_id as string,
    clienteId: f.cliente_id as string,
    clienteNombre: (f.cliente_nombre as string) ?? "",
    ventaId: f.venta_id as string,
    ventaNumero: Number(f.venta_numero) || 0,
    sorteadoEn: f.sorteado_en as string,
  }
}

function aSorteo(f: Fila, premios: Fila[], ganadores: Fila[]): Sorteo {
  return {
    id: f.id as string,
    nombre: (f.nombre as string) ?? "",
    descripcion: (f.descripcion as string) ?? undefined,
    fotoUrl: (f.foto_url as string) ?? undefined,
    desde: f.desde as string,
    hasta: f.hasta as string,
    estado: (f.estado as SorteoEstado) ?? "borrador",
    premios: premios.map(aPremio).sort((a, b) => a.orden - b.orden),
    ganadores: ganadores.map(aGanador),
    createdAt: (f.created_at as string) ?? undefined,
    updatedAt: (f.updated_at as string) ?? undefined,
  }
}

function mensajeError(error: { message: string }, accion: string): Error {
  return new Error(`${accion}: ${error.message}`)
}

const SELECT_SORTEO = "*, sorteo_premios(*), sorteo_ganadores(*, clientes(nombre), ventas(numero))"

export async function getSorteos(tenantId: string): Promise<Sorteo[]> {
  const { data, error } = await supabase
    .from("sorteos").select(SELECT_SORTEO)
    .eq("tenant_id", tenantId)
    .order("desde", { ascending: false })
  if (error) throw mensajeError(error, "No se pudieron cargar los sorteos")

  return (data ?? []).map((f: Fila) => {
    const ganadores = ((f.sorteo_ganadores as Fila[]) ?? []).map((g) => ({
      ...g,
      cliente_nombre: (g.clientes as Fila)?.nombre,
      venta_numero: (g.ventas as Fila)?.numero,
    }))
    return aSorteo(f, (f.sorteo_premios as Fila[]) ?? [], ganadores)
  })
}

export interface SorteoInput {
  nombre: string
  descripcion?: string
  fotoUrl?: string | null
  desde: string
  hasta: string
  premios: Pick<SorteoPremio, "orden" | "nombre" | "descripcion" | "fotoUrl">[]
}

export async function createSorteo(tenantId: string, input: SorteoInput): Promise<Sorteo> {
  const { data: creado, error } = await supabase
    .from("sorteos")
    .insert({
      tenant_id: tenantId, nombre: input.nombre, descripcion: input.descripcion || null,
      foto_url: input.fotoUrl || null, desde: input.desde, hasta: input.hasta, estado: "activo",
    })
    .select("*").single()
  if (error) throw mensajeError(error, "No se pudo crear el sorteo")

  const premios = input.premios.map((p) => ({
    sorteo_id: creado.id, orden: p.orden, nombre: p.nombre,
    descripcion: p.descripcion || null, foto_url: p.fotoUrl || null,
  }))
  const { error: errorPremios } = await supabase.from("sorteo_premios").insert(premios)
  if (errorPremios) throw mensajeError(errorPremios, "No se pudieron guardar los premios")

  return aSorteo(creado, premios, [])
}

/** Participantes agrupados por cliente, ordenados de más a menos chances. */
export async function getParticipantes(tenantId: string, sorteo: Pick<Sorteo, "desde" | "hasta">): Promise<ParticipanteSorteo[]> {
  const { data, error } = await supabase
    .from("ventas")
    .select("id, cliente_id, cliente_nombre")
    .eq("tenant_id", tenantId)
    .eq("estado", "completada")
    .not("cliente_id", "is", null)
    .gte("created_at", `${sorteo.desde}T00:00:00`)
    .lte("created_at", `${sorteo.hasta}T23:59:59.999`)
  if (error) throw mensajeError(error, "No se pudieron cargar los participantes")

  const porCliente = new Map<string, ParticipanteSorteo>()
  for (const venta of data ?? []) {
    const clienteId = venta.cliente_id as string
    const actual = porCliente.get(clienteId)
    if (actual) {
      actual.chances += 1
      actual.ventaIds.push(venta.id as string)
    } else {
      porCliente.set(clienteId, {
        clienteId, clienteNombre: (venta.cliente_nombre as string) ?? "",
        chances: 1, ventaIds: [venta.id as string],
      })
    }
  }
  return [...porCliente.values()].sort((a, b) => b.chances - a.chances)
}

/**
 * Elige un ganador entre los participantes, con probabilidad proporcional a
 * su cantidad de chances (una "bolita" por chance). `random` e `indiceVenta`
 * son inyectables para poder testear el sorteo sin depender de `Math.random`.
 */
export function elegirGanador(
  participantes: ParticipanteSorteo[],
  random: () => number = Math.random,
  randomVenta: () => number = Math.random,
): (ParticipanteSorteo & { ventaId: string }) | null {
  const totalChances = participantes.reduce((acc, p) => acc + p.chances, 0)
  if (totalChances <= 0) return null

  const r = random() * totalChances
  let acumulado = 0
  for (const p of participantes) {
    acumulado += p.chances
    if (r < acumulado) {
      const indice = Math.min(p.ventaIds.length - 1, Math.floor(randomVenta() * p.ventaIds.length))
      return { ...p, ventaId: p.ventaIds[indice] }
    }
  }
  // No debería llegar acá salvo error de punto flotante al borde: devuelve el último.
  const ultimo = participantes[participantes.length - 1]
  return { ...ultimo, ventaId: ultimo.ventaIds[0] }
}

/**
 * Sortea todos los premios de un sorteo, sin repetir cliente entre premios, y
 * graba los resultados. Idempotente-no: llamarla dos veces sobre un sorteo ya
 * finalizado falla por la constraint `unique (premio_id)` en `sorteo_ganadores`.
 */
export async function sortear(tenantId: string, sorteoId: string): Promise<SorteoGanador[]> {
  const sorteos = await getSorteos(tenantId)
  const sorteo = sorteos.find((s) => s.id === sorteoId)
  if (!sorteo) throw new Error("Sorteo no encontrado")
  if (sorteo.estado === "finalizado") throw new Error("Este sorteo ya fue sorteado")

  const participantes = await getParticipantes(tenantId, sorteo)
  const disponibles = [...participantes]
  const resultados: { premioId: string; clienteId: string; ventaId: string }[] = []

  for (const premio of sorteo.premios) {
    const ganador = elegirGanador(disponibles)
    if (!ganador) break // sin participantes: el premio queda sin ganador
    resultados.push({ premioId: premio.id!, clienteId: ganador.clienteId, ventaId: ganador.ventaId })
    const i = disponibles.findIndex((p) => p.clienteId === ganador.clienteId)
    if (i >= 0) disponibles.splice(i, 1) // no repite cliente entre premios
  }

  if (resultados.length > 0) {
    const { error: errorInsert } = await supabase.from("sorteo_ganadores").insert(
      resultados.map((r) => ({ sorteo_id: sorteoId, premio_id: r.premioId, cliente_id: r.clienteId, venta_id: r.ventaId })),
    )
    if (errorInsert) throw mensajeError(errorInsert, "No se pudo guardar el resultado del sorteo")
  }

  const { error: errorEstado } = await supabase
    .from("sorteos").update({ estado: "finalizado", updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId).eq("id", sorteoId)
  if (errorEstado) throw mensajeError(errorEstado, "No se pudo cerrar el sorteo")

  return (await getSorteos(tenantId)).find((s) => s.id === sorteoId)?.ganadores ?? []
}
```

- [ ] **Paso 5: Correr el test y verificar que pasa**

Run: `npx vitest run lib/supabase/sorteos.test.ts`
Expected: PASS (5 tests)

- [ ] **Paso 6: Commit**

```bash
git add lib/supabase/types.ts lib/supabase/sorteos.ts lib/supabase/sorteos.test.ts
git commit -m "feat(sorteos): tipos, capa de datos y sorteo aleatorio ponderado"
```

---

### Tarea 4: Lógica pura — promociones en el carrito

**Files:**
- Create: `lib/ventas/promociones.ts`
- Test: `lib/ventas/promociones.test.ts`

- [ ] **Paso 1: Escribir los tests primero**

```typescript
// lib/ventas/promociones.test.ts
import { describe, it, expect } from "vitest"
import { detectarPromocionAplicable, descuentoPromociones } from "./promociones"
import type { LineaCarrito } from "./carrito"
import type { Producto } from "@/lib/supabase/types"
import type { Promocion } from "@/lib/supabase/types"

function producto(id: string, precio: number): Producto {
  return {
    id, nombre: id, descripcion: "", categoria: "Accesorios", precio, precioLista: precio,
    stock: 100, stockMinimo: 0, controlaStock: true, unidad: "un",
    ofertaActiva: false, ofertaValor: 0, activo: true, revisar: false, publicadoEnLanding: false,
  }
}

function linea(p: Producto, cantidad: number): LineaCarrito {
  return { id: p.id, producto: p, cantidad }
}

function promo(items: { productoId: string; cantidad: number }[], precioFinal: number): Promocion {
  return { id: "promo-1", nombre: "Combo", precioFinal, activa: true, items }
}

describe("detectarPromocionAplicable", () => {
  it("detecta la promo cuando el carrito tiene las cantidades exactas", () => {
    const collar = producto("collar", 5000)
    const correa = producto("correa", 3000)
    const carrito = [linea(collar, 1), linea(correa, 1)]
    const promocion = promo([{ productoId: "collar", cantidad: 1 }, { productoId: "correa", cantidad: 1 }], 6500)

    const match = detectarPromocionAplicable(carrito, [promocion])
    expect(match?.promocion.id).toBe("promo-1")
    expect(match?.veces).toBe(1)
  })

  it("no detecta la promo si falta un producto", () => {
    const collar = producto("collar", 5000)
    const carrito = [linea(collar, 1)]
    const promocion = promo([{ productoId: "collar", cantidad: 1 }, { productoId: "correa", cantidad: 1 }], 6500)

    expect(detectarPromocionAplicable(carrito, [promocion])).toBeNull()
  })

  it("detecta cuantas veces se repite el combo completo", () => {
    const collar = producto("collar", 5000)
    const correa = producto("correa", 3000)
    const carrito = [linea(collar, 3), linea(correa, 2)]
    const promocion = promo([{ productoId: "collar", cantidad: 1 }, { productoId: "correa", cantidad: 1 }], 6500)

    // Con 3 collares y 2 correas, el combo (1+1) entra 2 veces (limita la correa).
    const match = detectarPromocionAplicable(carrito, [promocion])
    expect(match?.veces).toBe(2)
  })
})

describe("descuentoPromociones", () => {
  it("calcula el ahorro total: precio de lista de las unidades del combo menos el precio final", () => {
    const collar = producto("collar", 5000)
    const correa = producto("correa", 3000)
    const carrito = [linea(collar, 1), linea(correa, 1)]
    const promocion = promo([{ productoId: "collar", cantidad: 1 }, { productoId: "correa", cantidad: 1 }], 6500)

    // 5000 + 3000 = 8000 de lista, combo a 6500 -> descuento 1500.
    expect(descuentoPromociones(carrito, [promocion])).toBe(1500)
  })

  it("devuelve 0 si ninguna promo aplica", () => {
    const collar = producto("collar", 5000)
    const carrito = [linea(collar, 1)]
    expect(descuentoPromociones(carrito, [])).toBe(0)
  })
})
```

- [ ] **Paso 2: Correr para verificar que falla**

Run: `npx vitest run lib/ventas/promociones.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Paso 3: Implementar `lib/ventas/promociones.ts`**

```typescript
import type { Producto, Promocion } from "@/lib/supabase/types"
import type { LineaCarrito } from "./carrito"

/**
 * Detecta y descuenta promociones (combos de varios productos a precio fijo)
 * en el carrito del POS. Puro: no toca la base ni el estado de React.
 *
 * A diferencia del combo de un solo producto (`lib/productos/precios.ts`), acá
 * el combo involucra distintos `producto_id`, así que no se puede resolver por
 * unidad — hay que mirar el carrito completo para saber cuántas veces entra.
 */

export interface MatchPromocion {
  promocion: Promocion
  /** Cuántas veces entra el combo completo en las cantidades del carrito. */
  veces: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Cuántas veces entra el combo de una promoción en el carrito dado. */
function vecesQueEntra(carrito: LineaCarrito[], promocion: Promocion): number {
  if (promocion.items.length === 0) return 0

  let veces = Infinity
  for (const item of promocion.items) {
    const linea = carrito.find((l) => l.producto.id === item.productoId)
    if (!linea) return 0
    veces = Math.min(veces, Math.floor(linea.cantidad / item.cantidad))
  }
  return Number.isFinite(veces) ? veces : 0
}

/**
 * De todas las promociones vigentes, la primera que aplica al menos una vez.
 * Si hay varias aplicables a la vez, se prioriza la de mayor ahorro total —
 * evita que el orden de carga en la base decida cuál "gana".
 */
export function detectarPromocionAplicable(
  carrito: LineaCarrito[],
  promociones: Promocion[],
): MatchPromocion | null {
  const candidatas = promociones
    .map((promocion) => ({ promocion, veces: vecesQueEntra(carrito, promocion) }))
    .filter((m) => m.veces > 0)

  if (candidatas.length === 0) return null

  return candidatas.reduce((mejor, actual) =>
    ahorroDe(actual) > ahorroDe(mejor) ? actual : mejor,
  )

  function ahorroDe(match: MatchPromocion): number {
    return descuentoDeUnMatch(carrito, match)
  }
}

function descuentoDeUnMatch(carrito: LineaCarrito[], match: MatchPromocion): number {
  const { promocion, veces } = match
  if (veces <= 0) return 0

  let precioLista = 0
  for (const item of promocion.items) {
    const linea = carrito.find((l) => l.producto.id === item.productoId)
    if (!linea) return 0
    precioLista += linea.producto.precio * item.cantidad * veces
  }
  return Math.max(0, round2(precioLista - promocion.precioFinal * veces))
}

/** Descuento total en pesos de aplicar la mejor promoción detectada. */
export function descuentoPromociones(carrito: LineaCarrito[], promociones: Promocion[]): number {
  const match = detectarPromocionAplicable(carrito, promociones)
  if (!match) return 0
  return descuentoDeUnMatch(carrito, match)
}
```

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/ventas/promociones.test.ts`
Expected: PASS (5 tests)

- [ ] **Paso 5: Commit**

```bash
git add lib/ventas/promociones.ts lib/ventas/promociones.test.ts
git commit -m "feat(pos): deteccion y calculo de descuento de promociones en el carrito"
```

---

### Tarea 5: Integrar el descuento de promoción en los totales del carrito

**Files:**
- Modify: `lib/ventas/carrito.ts`
- Test: `lib/ventas/carrito.test.ts` (si no existe, crear con los tests existentes relevantes + los nuevos)

- [ ] **Paso 1: Revisar si ya existe `lib/ventas/carrito.test.ts`**

Run: `ls lib/ventas/*.test.ts`

Si existe, agregar los tests de este paso al final del `describe` de `totalesCarrito`. Si no existe, crear el archivo solo con el bloque de abajo (no reescribir toda la suite de carrito, que está fuera de alcance de este plan).

- [ ] **Paso 2: Escribir el test de integración**

```typescript
// lib/ventas/carrito.test.ts (agregar si el archivo ya existe, o crear con este contenido)
import { describe, it, expect } from "vitest"
import { totalesCarrito } from "./carrito"
import type { LineaCarrito } from "./carrito"
import type { Producto, Promocion } from "@/lib/supabase/types"

function producto(id: string, precio: number): Producto {
  return {
    id, nombre: id, descripcion: "", categoria: "Accesorios", precio, precioLista: precio,
    stock: 100, stockMinimo: 0, controlaStock: true, unidad: "un",
    ofertaActiva: false, ofertaValor: 0, activo: true, revisar: false, publicadoEnLanding: false,
  }
}

describe("totalesCarrito con promociones", () => {
  it("resta el descuento de la promocion detectada del subtotal", () => {
    const collar = producto("collar", 5000)
    const correa = producto("correa", 3000)
    const carrito: LineaCarrito[] = [
      { id: "collar", producto: collar, cantidad: 1 },
      { id: "correa", producto: correa, cantidad: 1 },
    ]
    const promocion: Promocion = {
      id: "p1", nombre: "Combo", precioFinal: 6500, activa: true,
      items: [{ productoId: "collar", cantidad: 1 }, { productoId: "correa", cantidad: 1 }],
    }

    const totales = totalesCarrito(carrito, undefined, 0, [promocion])
    // 8000 de lista - 1500 de promo = 6500.
    expect(totales.subtotal).toBe(6500)
  })

  it("sin promociones se comporta como antes", () => {
    const collar = producto("collar", 5000)
    const carrito: LineaCarrito[] = [{ id: "collar", producto: collar, cantidad: 1 }]
    const totales = totalesCarrito(carrito)
    expect(totales.subtotal).toBe(5000)
  })
})
```

- [ ] **Paso 3: Correr para verificar que falla**

Run: `npx vitest run lib/ventas/carrito.test.ts`
Expected: FAIL — `totalesCarrito` no acepta un 4to parámetro / el subtotal da 8000, no 6500.

- [ ] **Paso 4: Modificar `totalesCarrito` en `lib/ventas/carrito.ts` (líneas 229-260)**

```typescript
import { descuentoPromociones } from "./promociones"
import type { Promocion } from "@/lib/supabase/types"

// ... (mantener el resto del archivo igual, solo cambia la firma y el cuerpo de totalesCarrito)

export function totalesCarrito(
  carrito: LineaCarrito[],
  descuento: Descuento = SIN_DESCUENTO,
  recargoPorcentaje = 0,
  promociones: Promocion[] = [],
): TotalesCarrito {
  let subtotal = 0
  let sinOferta = 0

  for (const linea of carrito) {
    subtotal += subtotalLinea(linea)
    sinOferta += linea.producto.precio * linea.cantidad
  }

  const descuentoPromo = descuentoPromociones(carrito, promociones)
  subtotal = round2(subtotal - descuentoPromo)

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

Agregar el import de `Promocion` y `descuentoPromociones` al principio del archivo (junto a los imports existentes de la línea 1-2).

- [ ] **Paso 5: Correr los tests (los nuevos y toda la suite de carrito) y verificar que pasan**

Run: `npx vitest run lib/ventas/carrito.test.ts`
Expected: PASS

- [ ] **Paso 6: Commit**

```bash
git add lib/ventas/carrito.ts lib/ventas/carrito.test.ts
git commit -m "feat(pos): totalesCarrito descuenta promociones vigentes"
```

---

### Tarea 6: `itemsParaRPC` — cómo se factura una promoción aplicada

**Files:**
- Modify: `lib/ventas/carrito.ts`
- Modify: `lib/ventas/carrito.test.ts`

`registrar_venta` (005_ventas.sql) guarda el `subtotal` de cada línea tal como se lo mande el cliente, y suma esos subtotales para el total de la venta (ver comentario en `itemsParaRPC`, línea 298-304 del archivo original). Esto significa que **no hace falta tocar la RPC ni la base**: alcanza con que `itemsParaRPC` reparta el descuento de la promo entre las líneas involucradas antes de mandarlas.

- [ ] **Paso 1: Escribir el test**

```typescript
// agregar a lib/ventas/carrito.test.ts
import { itemsParaRPC } from "./carrito"

describe("itemsParaRPC con promociones", () => {
  it("reparte el descuento de la promocion proporcional al precio de lista de cada linea", () => {
    const collar = producto("collar", 5000)
    const correa = producto("correa", 3000)
    const carrito: LineaCarrito[] = [
      { id: "collar", producto: collar, cantidad: 1 },
      { id: "correa", producto: correa, cantidad: 1 },
    ]
    const promocion: Promocion = {
      id: "p1", nombre: "Combo", precioFinal: 6500, activa: true,
      items: [{ productoId: "collar", cantidad: 1 }, { productoId: "correa", cantidad: 1 }],
    }

    const items = itemsParaRPC(carrito, [promocion])
    const totalSubtotales = items.reduce((acc, i) => acc + i.subtotal, 0)
    expect(totalSubtotales).toBe(6500)
  })

  it("sin promociones se comporta como antes", () => {
    const collar = producto("collar", 5000)
    const carrito: LineaCarrito[] = [{ id: "collar", producto: collar, cantidad: 2 }]
    const items = itemsParaRPC(carrito)
    expect(items[0].subtotal).toBe(10000)
  })
})
```

- [ ] **Paso 2: Correr para verificar que falla**

Run: `npx vitest run lib/ventas/carrito.test.ts`
Expected: FAIL — `itemsParaRPC` no acepta un 2do parámetro.

- [ ] **Paso 3: Modificar `itemsParaRPC` (líneas 305-317 del archivo original)**

```typescript
export function itemsParaRPC(carrito: LineaCarrito[], promociones: Promocion[] = []): ItemRPC[] {
  const match = detectarPromocionAplicable(carrito, promociones)

  return carrito.map((linea) => {
    const subtotal = subtotalConPromo(linea)
    return {
      producto_id: linea.producto.id,
      cantidad: linea.cantidad,
      precio_unitario:
        linea.precioManual != null
          ? round2(linea.precioManual)
          : linea.producto.ofertaTipo === "combo" && linea.producto.ofertaActiva
            ? round2(linea.producto.precio)
            : precioFinal(linea.producto),
      subtotal,
    }
  })

  /**
   * Si la línea participa de la promo detectada, se le resta la parte
   * proporcional del descuento (proporcional a su precio de lista dentro del
   * combo) — así el total de la venta sigue siendo la suma de los items, sin
   * tocar `registrar_venta`.
   */
  function subtotalConPromo(linea: LineaCarrito): number {
    const base = subtotalLinea(linea)
    if (!match) return base

    const item = match.promocion.items.find((i) => i.productoId === linea.producto.id)
    if (!item) return base

    const precioListaCombo = match.promocion.items.reduce((acc, i) => {
      const l = carrito.find((c) => c.producto.id === i.productoId)
      return acc + (l ? l.producto.precio * i.cantidad * match.veces : 0)
    }, 0)
    const descuentoTotal = Math.max(0, round2(precioListaCombo - match.promocion.precioFinal * match.veces))
    if (precioListaCombo <= 0) return base

    const precioListaLinea = linea.producto.precio * item.cantidad * match.veces
    const partePropia = round2((precioListaLinea / precioListaCombo) * descuentoTotal)
    return round2(base - partePropia)
  }
}
```

Agregar el import: `import { detectarPromocionAplicable } from "./promociones"` al principio del archivo.

- [ ] **Paso 4: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/ventas/carrito.test.ts`
Expected: PASS

- [ ] **Paso 5: Correr toda la suite para asegurar que no se rompió nada**

Run: `npm run test`
Expected: PASS

- [ ] **Paso 6: Commit**

```bash
git add lib/ventas/carrito.ts lib/ventas/carrito.test.ts
git commit -m "feat(pos): itemsParaRPC reparte el descuento de promocion entre las lineas"
```

---

### Tarea 7: Mover la edición de ofertas fuera del diálogo de producto

**Files:**
- Modify: `components/admin/productos-management.tsx`

El objetivo es sacar el botón "Tag" (oferta) y el `<OfertaDialog>` de esta pantalla — quedan disponibles solo desde la nueva sección. `setOferta` y `OfertaDialog` no se tocan (son genéricos y se reutilizan tal cual en la Tarea 8).

- [ ] **Paso 1: Quitar el botón de oferta de la fila de acciones**

En `components/admin/productos-management.tsx`, eliminar el bloque (líneas 587-594 del archivo original):

```typescript
                          <Button
                            size="sm" variant="ghost"
                            className={cn("h-8 px-2", enOferta && "text-emerald-600")}
                            onClick={() => abrirOferta(p)}
                            title="Oferta"
                          >
                            <Tag className="h-3.5 w-3.5" />
                          </Button>
```

- [ ] **Paso 2: Quitar el `<OfertaDialog>` del final del componente**

Eliminar el bloque (líneas 654-659 del archivo original):

```typescript
      <OfertaDialog
        producto={ofertaDe}
        open={ofertaOpen}
        onOpenChange={setOfertaOpen}
        onGuardar={guardarOferta}
      />
```

- [ ] **Paso 3: Quitar el estado y las funciones que quedaron sin uso**

Eliminar:
- `const [ofertaOpen, setOfertaOpen] = useState(false)` (línea 72)
- `const abrirOferta = (p: Producto) => { setOfertaDe(p); setOfertaOpen(true) }` (línea 167) y el `useState` de `ofertaDe` que lo acompañe
- La función `guardarOferta` (línea 185) — se mueve a la Tarea 8
- El import `import { OfertaDialog } from "@/components/admin/productos/oferta-dialog"` (línea 23)
- `setOferta` del import de `@/lib/supabase/productos` (línea 30) si queda sin otro uso en el archivo
- El ícono `Tag` del import de `lucide-react` (línea 6) si queda sin otro uso — **atención**: `Tag` también se usa en las líneas 532 y 540 para mostrar el badge de "en oferta" en la tabla (`combo` y `precioFinal`), así que **no se debe quitar el import de `Tag`**, solo el uso del botón de acción.

- [ ] **Paso 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `productos-management.tsx` (puede haber warnings preexistentes de otras partes del proyecto — solo verificar que no aparecen errores sobre variables no usadas o referencias rotas en este archivo).

- [ ] **Paso 5: Levantar el dev server y confirmar visualmente**

Run: `npm run dev`

Ir a `/[slug]/admin/Productos` (con sesión de veterinario) y confirmar: la fila de un producto ya no tiene el botón de oferta (ícono `Tag` suelto), pero el badge "en oferta" del combo/precio sigue apareciendo en productos que ya tenían oferta activa.

- [ ] **Paso 6: Commit**

```bash
git add components/admin/productos-management.tsx
git commit -m "refactor(productos): la edicion de ofertas se muda a Promos y Sorteos"
```

---

### Tarea 8: Página admin — estructura con tabs y tab "Ofertas"

**Files:**
- Create: `app/[slug]/(vetadmin)/admin/PromosSorteos/page.tsx`
- Create: `components/admin/promos-sorteos-management.tsx`
- Create: `components/admin/promos-sorteos/ofertas-tab.tsx`

- [ ] **Paso 1: Crear la página con `FeatureGate`, igual patrón que `Ventas`**

```typescript
// app/[slug]/(vetadmin)/admin/PromosSorteos/page.tsx
"use client"

import { Gift } from "lucide-react"
import { useSlug } from "@/context/slug-context"
import { FeatureGate } from "@/components/admin/feature-gate"
import { PromosSorteosManagement } from "@/components/admin/promos-sorteos-management"

export default function PromosSorteosPage() {
  const slug = useSlug()

  return (
    <FeatureGate
      tenantId={slug}
      feature="promosSorteos"
      titulo="Ofertas, promociones y sorteos"
      descripcion="Armá ofertas, combos de productos y sorteos para tus clientes."
      planMinimo="Pro"
      icono={<Gift className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />}
    >
      <PromosSorteosManagement tenantId={slug} />
    </FeatureGate>
  )
}
```

- [ ] **Paso 2: Crear el componente contenedor con tabs (shadcn `Tabs`)**

```typescript
// components/admin/promos-sorteos-management.tsx
"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { OfertasTab } from "@/components/admin/promos-sorteos/ofertas-tab"

interface Props {
  tenantId: string
}

/**
 * Tres pestañas independientes entre sí — cada una carga sus propios datos,
 * así que cambiar de tab no dispara refetch de las otras.
 */
export function PromosSorteosManagement({ tenantId }: Props) {
  const [tab, setTab] = useState("ofertas")

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">Ofertas, promociones y sorteos</h1>
        <p className="text-sm text-muted-foreground">
          Gestioná todo lo que tus clientes ven como descuento o beneficio.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="ofertas">Ofertas</TabsTrigger>
          <TabsTrigger value="promociones">Promociones</TabsTrigger>
          <TabsTrigger value="sorteos">Sorteos</TabsTrigger>
        </TabsList>
        <TabsContent value="ofertas">
          <OfertasTab tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="promociones">
          {/* Tarea 9 */}
        </TabsContent>
        <TabsContent value="sorteos">
          {/* Tarea 11 */}
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

Si `components/ui/tabs.tsx` no existe todavía en el proyecto (shadcn), agregarlo con:

Run: `npx shadcn@latest add tabs`

- [ ] **Paso 3: Crear el tab de Ofertas, reutilizando `OfertaDialog` y `setOferta`**

```typescript
// components/admin/promos-sorteos/ofertas-tab.tsx
"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Search, Tag } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OfertaDialog } from "@/components/admin/productos/oferta-dialog"
import { getProductos, setOferta, type OfertaInput } from "@/lib/supabase/productos"
import { precioFinal, tieneOferta, comboLabel } from "@/lib/productos/precios"
import { formatCurrency } from "@/lib/format"
import type { Producto } from "@/lib/supabase/types"

interface Props {
  tenantId: string
}

/** DEBOUNCE_MS del buscador de producto para activar una oferta nueva. */
const DEBOUNCE_MS = 250

export function OfertasTab({ tenantId }: Props) {
  const [conOferta, setConOferta] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState("")
  const [resultados, setResultados] = useState<Producto[]>([])
  const [editando, setEditando] = useState<Producto | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const cargarConOferta = () => {
    setCargando(true)
    getProductos(tenantId, { soloConOferta: true, porPagina: 100 })
      .then(({ productos }) => setConOferta(productos))
      .finally(() => setCargando(false))
  }

  useEffect(cargarConOferta, [tenantId])

  useEffect(() => {
    const termino = busqueda.trim()
    if (termino.length < 2) {
      setResultados([])
      return
    }
    let vigente = true
    const timer = setTimeout(() => {
      getProductos(tenantId, { busqueda: termino, porPagina: 10 }).then(({ productos }) => {
        if (vigente) setResultados(productos)
      })
    }, DEBOUNCE_MS)
    return () => {
      vigente = false
      clearTimeout(timer)
    }
  }, [busqueda, tenantId])

  const abrir = (p: Producto) => {
    setEditando(p)
    setDialogOpen(true)
  }

  const guardar = async (oferta: OfertaInput) => {
    if (!editando) return
    try {
      await setOferta(tenantId, editando.id, oferta)
      toast.success("Oferta guardada")
      setBusqueda("")
      setResultados([])
      cargarConOferta()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la oferta")
    }
  }

  return (
    <div className="space-y-6 pt-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto para poner en oferta"
          className="pl-9"
        />
        {resultados.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border bg-card shadow-lg">
            {resultados.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => abrir(p)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span>{p.nombre}</span>
                <span className="text-muted-foreground">{formatCurrency(p.precio)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : conOferta.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay productos en oferta.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Oferta</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {conOferta.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.nombre}</TableCell>
                <TableCell>
                  <Badge className="bg-amber-500 hover:bg-amber-500">
                    {comboLabel(p) ?? p.ofertaTipo}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium text-emerald-600">
                  {formatCurrency(precioFinal(p))}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.ofertaHasta ?? "Sin vencimiento"}
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => abrir(p)}>
                    <Tag className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <OfertaDialog producto={editando} open={dialogOpen} onOpenChange={setDialogOpen} onGuardar={guardar} />
    </div>
  )
}
```

- [ ] **Paso 4: Agregar el filtro `soloConOferta` a `getProductos` en `lib/supabase/productos.ts`**

Buscar la función `getProductos` y su interfaz de filtros (contiene `busqueda`, `categoriaPrefijo`, `marca`, `porPagina`). Agregar el campo `soloConOferta?: boolean` a la interfaz de filtros, y en el armado de la query:

```typescript
  if (filtros.soloConOferta) {
    query = query.eq("oferta_activa", true)
  }
```

(Insertar junto a los demás `if (filtros.xxx)` que arman la query de `getProductos`, siguiendo el mismo patrón que ya usa esa función para `categoriaPrefijo`/`marca`.)

- [ ] **Paso 5: Verificar tipos y levantar el dev server**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

Run: `npm run dev`

Ir a `/[slug]/admin/PromosSorteos`, confirmar que carga (puede dar el cartel de plan si el tenant de prueba no es Pro — ver Tarea 14 para el feature flag, que hay que completar antes de que esta pantalla sea usable de punta a punta). Con el flag ya en `true` a mano en `lib/plans.ts` temporalmente para probar: buscar un producto, activar una oferta, confirmar que aparece en la tabla.

- [ ] **Paso 6: Commit**

```bash
git add app/[slug]/(vetadmin)/admin/PromosSorteos components/admin/promos-sorteos-management.tsx components/admin/promos-sorteos/ofertas-tab.tsx lib/supabase/productos.ts
git commit -m "feat(promos-sorteos): pagina admin con tabs y tab de Ofertas"
```

---

### Tarea 9: Tab "Promociones" — listado y alta/edición

**Files:**
- Create: `components/admin/promos-sorteos/promociones-tab.tsx`
- Create: `components/admin/promos-sorteos/promocion-dialog.tsx`
- Modify: `components/admin/promos-sorteos-management.tsx`

- [ ] **Paso 1: Crear el diálogo de alta/edición de promoción**

```typescript
// components/admin/promos-sorteos/promocion-dialog.tsx
"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { getProductos } from "@/lib/supabase/productos"
import { formatCurrency } from "@/lib/format"
import type { Producto, Promocion } from "@/lib/supabase/types"
import type { PromocionInput } from "@/lib/supabase/promociones"

interface Props {
  tenantId: string
  promocion: Promocion | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onGuardar: (input: PromocionInput) => Promise<void>
}

interface ItemForm {
  producto: Producto
  cantidad: number
}

export function PromocionDialog({ tenantId, promocion, open, onOpenChange, onGuardar }: Props) {
  const [nombre, setNombre] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [precioFinal, setPrecioFinal] = useState("")
  const [activa, setActiva] = useState(true)
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [items, setItems] = useState<ItemForm[]>([])
  const [busqueda, setBusqueda] = useState("")
  const [resultados, setResultados] = useState<Producto[]>([])
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!open) return
    setNombre(promocion?.nombre ?? "")
    setDescripcion(promocion?.descripcion ?? "")
    setPrecioFinal(promocion ? String(promocion.precioFinal) : "")
    setActiva(promocion?.activa ?? true)
    setDesde(promocion?.desde ?? "")
    setHasta(promocion?.hasta ?? "")
    setItems([])
    setBusqueda("")
    setResultados([])
  }, [open, promocion])

  useEffect(() => {
    const termino = busqueda.trim()
    if (termino.length < 2) {
      setResultados([])
      return
    }
    let vigente = true
    const timer = setTimeout(() => {
      getProductos(tenantId, { busqueda: termino, porPagina: 8 }).then(({ productos }) => {
        if (vigente) setResultados(productos)
      })
    }, 250)
    return () => {
      vigente = false
      clearTimeout(timer)
    }
  }, [busqueda, tenantId])

  const agregarProducto = (producto: Producto) => {
    if (items.some((i) => i.producto.id === producto.id)) return
    setItems((prev) => [...prev, { producto, cantidad: 1 }])
    setBusqueda("")
    setResultados([])
  }

  const cambiarCantidad = (productoId: string, cantidad: number) => {
    setItems((prev) => prev.map((i) => (i.producto.id === productoId ? { ...i, cantidad } : i)))
  }

  const quitarItem = (productoId: string) => {
    setItems((prev) => prev.filter((i) => i.producto.id !== productoId))
  }

  const precioListaTotal = items.reduce((acc, i) => acc + i.producto.precio * i.cantidad, 0)
  const invalido =
    !nombre.trim() || items.length === 0 || !precioFinal || Number(precioFinal) < 0 || items.some((i) => i.cantidad <= 0)

  const guardar = async () => {
    if (invalido) return
    setGuardando(true)
    try {
      await onGuardar({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        precioFinal: Number(precioFinal),
        activa,
        desde: desde || null,
        hasta: hasta || null,
        items: items.map((i) => ({ productoId: i.producto.id, cantidad: i.cantidad })),
      })
      onOpenChange(false)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{promocion ? "Editar promoción" : "Nueva promoción"}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Collar + Correa" />
          </div>

          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Descripción (opcional)</Label>
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
          </div>

          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Buscar producto para agregar</Label>
            <div className="relative">
              <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre del producto" />
              {resultados.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border bg-card shadow-lg">
                  {resultados.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => agregarProducto(p)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span>{p.nombre}</span>
                      <span className="text-muted-foreground">{formatCurrency(p.precio)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {items.length > 0 && (
            <div className="space-y-2 rounded-lg border p-3">
              {items.map((i) => (
                <div key={i.producto.id} className="flex items-center gap-2">
                  <span className="flex-1 truncate text-sm">{i.producto.nombre}</span>
                  <Input
                    type="number" min={1} className="w-16"
                    value={i.cantidad}
                    onChange={(e) => cambiarCantidad(i.producto.id, Number(e.target.value) || 1)}
                  />
                  <Button size="sm" variant="ghost" onClick={() => quitarItem(i.producto.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Precio de lista del combo: {formatCurrency(precioListaTotal)}
              </p>
            </div>
          )}

          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Precio final del combo</Label>
            <Input type="number" min={0} value={precioFinal} onChange={(e) => setPrecioFinal(e.target.value)} placeholder="Ej: 6500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Desde (opcional)</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Hasta (opcional)</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
          </div>

          <label className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <span className="text-sm font-medium">Promoción activa</span>
            <Switch checked={activa} onCheckedChange={setActiva} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={guardando || invalido} onClick={guardar}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

Si `components/ui/textarea.tsx` no existe: Run `npx shadcn@latest add textarea`.

- [ ] **Paso 2: Crear el tab que lista y abre el diálogo**

```typescript
// components/admin/promos-sorteos/promociones-tab.tsx
"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Plus, Trash2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PromocionDialog } from "@/components/admin/promos-sorteos/promocion-dialog"
import {
  getPromociones, createPromocion, updatePromocion, eliminarPromocion, type PromocionInput,
} from "@/lib/supabase/promociones"
import { formatCurrency } from "@/lib/format"
import type { Promocion } from "@/lib/supabase/types"

interface Props {
  tenantId: string
}

export function PromocionesTab({ tenantId }: Props) {
  const [promociones, setPromociones] = useState<Promocion[]>([])
  const [cargando, setCargando] = useState(true)
  const [editando, setEditando] = useState<Promocion | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const cargar = () => {
    setCargando(true)
    getPromociones(tenantId).then(setPromociones).finally(() => setCargando(false))
  }

  useEffect(cargar, [tenantId])

  const abrirNueva = () => {
    setEditando(null)
    setDialogOpen(true)
  }

  const abrirEdicion = (p: Promocion) => {
    setEditando(p)
    setDialogOpen(true)
  }

  const guardar = async (input: PromocionInput) => {
    try {
      if (editando) {
        await updatePromocion(tenantId, editando.id, input)
      } else {
        await createPromocion(tenantId, input)
      }
      toast.success("Promoción guardada")
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la promoción")
    }
  }

  const eliminar = async (p: Promocion) => {
    if (!confirm(`¿Eliminar la promoción "${p.nombre}"?`)) return
    try {
      await eliminarPromocion(tenantId, p.id)
      toast.success("Promoción eliminada")
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar la promoción")
    }
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">
        <Button onClick={abrirNueva} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="mr-2 h-4 w-4" /> Nueva promoción
        </Button>
      </div>

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : promociones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay promociones.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Productos</TableHead>
              <TableHead>Precio final</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {promociones.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.nombre}</TableCell>
                <TableCell className="text-muted-foreground">{p.items.length} productos</TableCell>
                <TableCell className="font-medium text-emerald-600">{formatCurrency(p.precioFinal)}</TableCell>
                <TableCell>
                  <Badge variant={p.activa ? "default" : "secondary"}>{p.activa ? "Activa" : "Inactiva"}</Badge>
                </TableCell>
                <TableCell className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => abrirEdicion(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => eliminar(p)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <PromocionDialog
        tenantId={tenantId}
        promocion={editando}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onGuardar={guardar}
      />
    </div>
  )
}
```

- [ ] **Paso 3: Conectar el tab en `PromosSorteosManagement`**

En `components/admin/promos-sorteos-management.tsx`, importar `PromocionesTab` y reemplazar el comentario `{/* Tarea 9 */}`:

```typescript
import { PromocionesTab } from "@/components/admin/promos-sorteos/promociones-tab"
// ...
        <TabsContent value="promociones">
          <PromocionesTab tenantId={tenantId} />
        </TabsContent>
```

- [ ] **Paso 4: Verificar tipos y probar en el navegador**

Run: `npx tsc --noEmit`

Run: `npm run dev` — ir al tab "Promociones", crear una promo con 2 productos y un precio final, confirmar que aparece en la tabla, editarla y eliminarla.

- [ ] **Paso 5: Commit**

```bash
git add components/admin/promos-sorteos
git commit -m "feat(promociones): tab de listado y alta/edicion en el admin"
```

---

### Tarea 10: Botón "Ofertas/Promociones" en el POS + aplicación automática

**Files:**
- Modify: `components/admin/pos-management.tsx`
- Modify: `components/admin/pos/buscador-productos.tsx`
- Create: `components/admin/pos/ofertas-promos-panel.tsx`

- [ ] **Paso 1: Leer cómo `pos-management.tsx` arma `totalesCarrito`/`itemsParaRPC` hoy**

Run: `grep -n "totalesCarrito\|itemsParaRPC" components/admin/pos-management.tsx`

Ubicar las llamadas existentes (probablemente en el cálculo de totales para mostrar en pantalla y en la función `cobrar`).

- [ ] **Paso 2: Cargar las promociones vigentes al montar el POS**

En `components/admin/pos-management.tsx`, agregar:

```typescript
import { getPromocionesVigentes } from "@/lib/supabase/promociones"
import type { Promocion } from "@/lib/supabase/types"

// dentro del componente, junto a los demás useState de catálogo:
const [promociones, setPromociones] = useState<Promocion[]>([])

useEffect(() => {
  getPromocionesVigentes(tenantId).then(setPromociones)
}, [tenantId])
```

- [ ] **Paso 3: Pasar `promociones` a las llamadas existentes de `totalesCarrito` e `itemsParaRPC`**

En cada lugar donde el archivo llama `totalesCarrito(carrito, descuento, recargoPct)`, agregar `promociones` como 4to argumento: `totalesCarrito(carrito, descuento, recargoPct, promociones)`. Igual para `itemsParaRPC(carrito)` → `itemsParaRPC(carrito, promociones)` en la función que arma el payload de `registrar_venta`.

- [ ] **Paso 4: Crear el panel de ofertas/promociones para agregado manual**

```typescript
// components/admin/pos/ofertas-promos-panel.tsx
"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import { precioFinal, comboLabel } from "@/lib/productos/precios"
import type { Producto, Promocion } from "@/lib/supabase/types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  productosEnOferta: Producto[]
  promociones: Promocion[]
  onAgregarProducto: (producto: Producto) => void
  onAgregarPromocion: (promocion: Promocion) => void
}

/**
 * Agregado manual: el POS ya aplica ofertas y promociones automáticamente al
 * detectar el producto/combo en el carrito, pero el vendedor puede querer
 * forzarlas (ej: mostrarle al cliente la promo antes de armar el carrito).
 */
export function OfertasPromosPanel({
  open, onOpenChange, productosEnOferta, promociones, onAgregarProducto, onAgregarPromocion,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Ofertas y promociones vigentes</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-6 overflow-y-auto">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Ofertas</h3>
            {productosEnOferta.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin productos en oferta.</p>
            ) : (
              <div className="space-y-2">
                {productosEnOferta.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onAgregarProducto(p)}
                    className="flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm hover:border-emerald-500"
                  >
                    <span>{p.nombre}</span>
                    <span className="font-medium text-emerald-600">
                      {comboLabel(p) ?? formatCurrency(precioFinal(p))}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Promociones</h3>
            {promociones.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin promociones vigentes.</p>
            ) : (
              <div className="space-y-2">
                {promociones.map((promo) => (
                  <button
                    key={promo.id}
                    type="button"
                    onClick={() => onAgregarPromocion(promo)}
                    className="flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm hover:border-emerald-500"
                  >
                    <span>{promo.nombre}</span>
                    <span className="font-medium text-emerald-600">{formatCurrency(promo.precioFinal)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

Si `components/ui/sheet.tsx` no existe: Run `npx shadcn@latest add sheet`.

- [ ] **Paso 5: Conectar el panel en `pos-management.tsx`**

Agregar el estado `const [panelOpen, setPanelOpen] = useState(false)`, un botón "Ofertas/Promociones" cerca del `BuscadorProductos` (mismo lugar que los botones "Alimentos"/"Atención" en `buscador-productos.tsx`, o justo al lado en `pos-management.tsx`), y el manejador `onAgregarPromocion` que agrega al carrito una unidad de cada producto de `promocion.items` (usando `agregarAlCarrito` de `lib/ventas/carrito.ts` para cada item):

```typescript
const agregarPromocionAlCarrito = (promocion: Promocion) => {
  let nuevo = carrito
  for (const item of promocion.items) {
    const producto = /* buscar el Producto completo por item.productoId, ej. en el catálogo ya cargado o vía getProductoPorCodigo/getProductos si no está en memoria */
    if (producto) nuevo = agregarAlCarrito(nuevo, producto, item.cantidad)
  }
  setCarrito(nuevo)
  setPanelOpen(false)
}
```

Nota para quien implemente: revisar cómo `pos-management.tsx` resuelve un `Producto` completo a partir de un id ya conocido (probablemente ya tiene una función así para el buscador o alimentos) y reutilizarla acá en vez de duplicar una consulta.

- [ ] **Paso 6: Verificar tipos y probar en el navegador**

Run: `npx tsc --noEmit`

Run: `npm run dev` — abrir el POS, agregar los productos de una promo activa (Tarea 9) al carrito manualmente y confirmar que el subtotal ya refleja el precio de combo (aplicación automática). Abrir el panel "Ofertas/Promociones" y confirmar que agregar la promo desde ahí da el mismo resultado.

- [ ] **Paso 7: Commit**

```bash
git add components/admin/pos-management.tsx components/admin/pos/ofertas-promos-panel.tsx
git commit -m "feat(pos): boton de ofertas/promociones y aplicacion automatica de combos"
```

---

### Tarea 11: Tab "Sorteos" — listado, alta y detalle con sorteo

**Files:**
- Create: `components/admin/promos-sorteos/sorteos-tab.tsx`
- Create: `components/admin/promos-sorteos/sorteo-dialog.tsx`
- Create: `components/admin/promos-sorteos/sorteo-detalle.tsx`
- Modify: `components/admin/promos-sorteos-management.tsx`

- [ ] **Paso 1: Crear el diálogo de alta de sorteo (con premios dinámicos y foto opcional)**

```typescript
// components/admin/promos-sorteos/sorteo-dialog.tsx
"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { uploadFotoTenant } from "@/lib/supabase/storage"
import type { SorteoInput } from "@/lib/supabase/sorteos"

interface Props {
  tenantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onGuardar: (input: SorteoInput) => Promise<void>
}

interface PremioForm {
  nombre: string
  descripcion: string
  fotoFile: File | null
  fotoUrl: string | null
}

const PREMIO_VACIO: PremioForm = { nombre: "", descripcion: "", fotoFile: null, fotoUrl: null }

export function SorteoDialog({ tenantId, open, onOpenChange, onGuardar }: Props) {
  const [nombre, setNombre] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [premios, setPremios] = useState<PremioForm[]>([{ ...PREMIO_VACIO }])
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!open) return
    setNombre("")
    setDescripcion("")
    setFotoFile(null)
    setDesde("")
    setHasta("")
    setPremios([{ ...PREMIO_VACIO }])
  }, [open])

  const agregarPremio = () => setPremios((prev) => [...prev, { ...PREMIO_VACIO }])
  const quitarPremio = (i: number) => setPremios((prev) => prev.filter((_, idx) => idx !== i))
  const cambiarPremio = (i: number, cambios: Partial<PremioForm>) =>
    setPremios((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...cambios } : p)))

  const invalido =
    !nombre.trim() || !desde || !hasta || hasta < desde ||
    premios.length === 0 || premios.some((p) => !p.nombre.trim())

  const guardar = async () => {
    if (invalido) return
    setGuardando(true)
    try {
      const fotoUrl = fotoFile ? await uploadFotoTenant(tenantId, "sorteos", fotoFile) : undefined
      const premiosConFoto = await Promise.all(
        premios.map(async (p, i) => ({
          orden: i + 1,
          nombre: p.nombre.trim(),
          descripcion: p.descripcion.trim() || undefined,
          fotoUrl: p.fotoFile ? await uploadFotoTenant(tenantId, "sorteos/premios", p.fotoFile) : undefined,
        })),
      )
      await onGuardar({ nombre: nombre.trim(), descripcion: descripcion.trim() || undefined, fotoUrl, desde, hasta, premios: premiosConFoto })
      onOpenChange(false)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo sorteo</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Sorteo Día del Animal" />
          </div>

          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Descripción (opcional)</Label>
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
          </div>

          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Foto (opcional)</Label>
            <Input type="file" accept="image/*" onChange={(e) => setFotoFile(e.target.files?.[0] ?? null)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Premios</Label>
              <Button size="sm" variant="outline" onClick={agregarPremio}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Agregar premio
              </Button>
            </div>
            {premios.map((p, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Premio #{i + 1}</span>
                  {premios.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => quitarPremio(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <Input
                  placeholder="Nombre del premio"
                  value={p.nombre}
                  onChange={(e) => cambiarPremio(i, { nombre: e.target.value })}
                />
                <Textarea
                  placeholder="Descripción (opcional)"
                  rows={2}
                  value={p.descripcion}
                  onChange={(e) => cambiarPremio(i, { descripcion: e.target.value })}
                />
                <Input
                  type="file" accept="image/*"
                  onChange={(e) => cambiarPremio(i, { fotoFile: e.target.files?.[0] ?? null })}
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={guardando || invalido} onClick={guardar}>
            {guardando ? "Guardando…" : "Crear sorteo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Paso 2: Crear el detalle del sorteo (participantes + botón sortear + ganadores)**

```typescript
// components/admin/promos-sorteos/sorteo-detalle.tsx
"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ArrowLeft, Dices } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getParticipantes, sortear } from "@/lib/supabase/sorteos"
import type { ParticipanteSorteo, Sorteo } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  sorteo: Sorteo
  onVolver: () => void
  onSorteado: () => void
}

export function SorteoDetalle({ tenantId, sorteo, onVolver, onSorteado }: Props) {
  const [participantes, setParticipantes] = useState<ParticipanteSorteo[]>([])
  const [cargando, setCargando] = useState(true)
  const [confirmando, setConfirmando] = useState(false)
  const [sorteando, setSorteando] = useState(false)

  useEffect(() => {
    setCargando(true)
    getParticipantes(tenantId, sorteo).then(setParticipantes).finally(() => setCargando(false))
  }, [tenantId, sorteo])

  const puedeSortear = sorteo.estado !== "finalizado" && new Date() >= new Date(`${sorteo.hasta}T00:00:00`)

  const confirmarSorteo = async () => {
    setSorteando(true)
    try {
      await sortear(tenantId, sorteo.id)
      toast.success("Sorteo realizado")
      onSorteado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo sortear")
    } finally {
      setSorteando(false)
      setConfirmando(false)
    }
  }

  return (
    <div className="space-y-4 pt-4">
      <Button variant="ghost" className="-ml-3" onClick={onVolver}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Volver a sorteos
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">{sorteo.nombre}</h2>
          <p className="text-sm text-muted-foreground">{sorteo.desde} al {sorteo.hasta}</p>
        </div>
        {sorteo.estado === "finalizado" ? (
          <span className="text-sm font-medium text-emerald-600">Sorteado</span>
        ) : (
          <Button
            disabled={!puedeSortear || sorteando}
            title={!puedeSortear ? "Se puede sortear cuando termine el rango de fechas" : undefined}
            onClick={() => setConfirmando(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Dices className="mr-2 h-4 w-4" /> Sortear
          </Button>
        )}
      </div>

      {sorteo.ganadores.length > 0 && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <h3 className="text-sm font-semibold">Ganadores</h3>
          {sorteo.premios.map((premio) => {
            const ganador = sorteo.ganadores.find((g) => g.premioId === premio.id)
            return (
              <div key={premio.id} className="flex justify-between text-sm">
                <span>{premio.nombre}</span>
                <span className="font-medium">{ganador ? ganador.clienteNombre : "Sin ganador"}</span>
              </div>
            )
          })}
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
          Participantes ({participantes.length})
        </h3>
        {cargando ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : participantes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ventas con cliente en el rango del sorteo.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Chances</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participantes.map((p) => (
                <TableRow key={p.clienteId}>
                  <TableCell>{p.clienteNombre}</TableCell>
                  <TableCell>{p.chances}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Sortear "{sorteo.nombre}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es definitiva: se van a elegir los ganadores de cada premio y el sorteo pasa a "finalizado".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarSorteo}>Sortear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Paso 3: Crear el tab que alterna entre listado y detalle**

```typescript
// components/admin/promos-sorteos/sorteos-tab.tsx
"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SorteoDialog } from "@/components/admin/promos-sorteos/sorteo-dialog"
import { SorteoDetalle } from "@/components/admin/promos-sorteos/sorteo-detalle"
import { getSorteos, createSorteo, type SorteoInput } from "@/lib/supabase/sorteos"
import type { Sorteo, SorteoEstado } from "@/lib/supabase/types"

interface Props {
  tenantId: string
}

const ETIQUETA_ESTADO: Record<SorteoEstado, string> = {
  borrador: "Borrador", activo: "Activo", finalizado: "Finalizado",
}

export function SorteosTab({ tenantId }: Props) {
  const [sorteos, setSorteos] = useState<Sorteo[]>([])
  const [cargando, setCargando] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [seleccionado, setSeleccionado] = useState<Sorteo | null>(null)

  const cargar = () => {
    setCargando(true)
    getSorteos(tenantId).then(setSorteos).finally(() => setCargando(false))
  }

  useEffect(cargar, [tenantId])

  const crear = async (input: SorteoInput) => {
    try {
      await createSorteo(tenantId, input)
      toast.success("Sorteo creado")
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el sorteo")
    }
  }

  if (seleccionado) {
    return (
      <SorteoDetalle
        tenantId={tenantId}
        sorteo={seleccionado}
        onVolver={() => setSeleccionado(null)}
        onSorteado={() => {
          cargar()
          setSeleccionado(null)
        }}
      />
    )
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">
        <Button onClick={() => setDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="mr-2 h-4 w-4" /> Nuevo sorteo
        </Button>
      </div>

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : sorteos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay sorteos.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Fechas</TableHead>
              <TableHead>Premios</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorteos.map((s) => (
              <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSeleccionado(s)}>
                <TableCell>{s.nombre}</TableCell>
                <TableCell className="text-muted-foreground">{s.desde} al {s.hasta}</TableCell>
                <TableCell className="text-muted-foreground">{s.premios.length}</TableCell>
                <TableCell>
                  <Badge variant={s.estado === "finalizado" ? "secondary" : "default"}>
                    {ETIQUETA_ESTADO[s.estado]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <SorteoDialog tenantId={tenantId} open={dialogOpen} onOpenChange={setDialogOpen} onGuardar={crear} />
    </div>
  )
}
```

- [ ] **Paso 4: Conectar el tab en `PromosSorteosManagement`**

```typescript
import { SorteosTab } from "@/components/admin/promos-sorteos/sorteos-tab"
// ...
        <TabsContent value="sorteos">
          <SorteosTab tenantId={tenantId} />
        </TabsContent>
```

- [ ] **Paso 5: Verificar tipos y probar en el navegador**

Run: `npx tsc --noEmit`

Run: `npm run dev` — crear un sorteo con 2 premios y fechas que ya pasaron (para poder sortear en la prueba), hacer una venta con cliente asociado desde el POS dentro de ese rango, entrar al detalle del sorteo y confirmar que aparece como participante, sortear y confirmar que se asigna un ganador por premio sin repetir cliente.

- [ ] **Paso 6: Commit**

```bash
git add components/admin/promos-sorteos-management.tsx components/admin/promos-sorteos
git commit -m "feat(sorteos): tab de listado, alta y detalle con sorteo aleatorio"
```

---

### Tarea 12: `getProductoPorId` (si falta) para resolver items de promoción en el POS

**Files:**
- Modify: `lib/supabase/productos.ts`

La Tarea 10 necesita, dado un `producto_id` de un item de promoción, el `Producto` completo para pasarlo a `agregarAlCarrito`. Verificar primero si ya existe una función así.

- [ ] **Paso 1: Buscar si ya existe**

Run: `grep -n "export async function getProducto" lib/supabase/productos.ts`

- [ ] **Paso 2: Si no existe `getProductoPorId`, agregarla**

```typescript
export async function getProductoPorId(tenantId: string, id: string): Promise<Producto | null> {
  const { data } = await supabase
    .from("productos").select(COLS)
    .eq("tenant_id", tenantId).eq("id", id)
    .maybeSingle()
  return data ? aProducto(data) : null
}
```

(Ubicar cerca de `getProductoPorCodigo`, mismo patrón.)

- [ ] **Paso 3: Usarla en `agregarPromocionAlCarrito` de la Tarea 10**

Reemplazar el comentario de la Tarea 10 por:

```typescript
const agregarPromocionAlCarrito = async (promocion: Promocion) => {
  let nuevo = carrito
  for (const item of promocion.items) {
    const producto = await getProductoPorId(tenantId, item.productoId)
    if (producto) nuevo = agregarAlCarrito(nuevo, producto, item.cantidad)
  }
  setCarrito(nuevo)
  setPanelOpen(false)
}
```

- [ ] **Paso 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Paso 5: Commit**

```bash
git add lib/supabase/productos.ts components/admin/pos-management.tsx
git commit -m "feat(pos): resolver productos de una promocion por id al agregarla manualmente"
```

---

### Tarea 13: Alta pública de cliente

**Files:**
- Create: `app/api/clientes/registrar/route.ts`
- Create: `app/[slug]/cliente/page.tsx`

- [ ] **Paso 1: Crear la API route con validación server-side (Zod) y service_role**

```typescript
// app/api/clientes/registrar/route.ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { getAdminDb } from "@/lib/supabase/admin"

/**
 * Alta pública de cliente ("hacerme cliente"). Sin autenticación, así que va
 * por service_role en vez de RLS: `clientes` solo tiene policies de staff/self
 * (ver schema.sql), y abrir un insert anónimo directo en la tabla sería un
 * vector para llenarla de basura sin ningún control server-side.
 */

const bodySchema = z.object({
  tenantId: z.string().min(1),
  nombre: z.string().trim().min(1).max(200),
  telefono: z.string().trim().max(50).optional().default(""),
  email: z.string().trim().email().max(200).optional().or(z.literal("")).default(""),
  dni: z.string().trim().max(20).optional(),
  domicilio: z.string().trim().max(300).optional(),
})

export async function POST(req: Request) {
  const admin = getAdminDb()
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Servicio no disponible" }, { status: 503 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 })
  }

  const { tenantId, nombre, telefono, email, dni, domicilio } = parsed.data

  const { data: tenant } = await admin.from("tenants").select("slug").eq("slug", tenantId).maybeSingle()
  if (!tenant) {
    return NextResponse.json({ ok: false, error: "Veterinaria no encontrada" }, { status: 404 })
  }

  // Mismo criterio de upsert que createCliente (lib/supabase/clientes.ts): si
  // ya existe un cliente con ese DNI, se actualizan sus datos de contacto.
  if (dni) {
    const { data: existente } = await admin
      .from("clientes").select("id").eq("tenant_id", tenantId).eq("dni", dni).maybeSingle()
    if (existente) {
      const { error } = await admin
        .from("clientes")
        .update({ nombre, telefono, email, domicilio: domicilio || null })
        .eq("id", existente.id)
      if (error) return NextResponse.json({ ok: false, error: "No se pudo actualizar tus datos" }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
  }

  const { error } = await admin.from("clientes").insert({
    tenant_id: tenantId, nombre, telefono, email,
    dni: dni || null, domicilio: domicilio || null, historial_datos: [],
  })
  if (error) return NextResponse.json({ ok: false, error: "No se pudo registrar tu alta" }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Paso 2: Crear la página pública**

```typescript
// app/[slug]/cliente/page.tsx
"use client"

import { useState } from "react"
import { CheckCircle2, UserPlus } from "lucide-react"
import { useSlug } from "@/context/slug-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function HacermeClientePage() {
  const slug = useSlug()
  const [nombre, setNombre] = useState("")
  const [telefono, setTelefono] = useState("")
  const [email, setEmail] = useState("")
  const [dni, setDni] = useState("")
  const [domicilio, setDomicilio] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState("")

  const enviar = async () => {
    if (!nombre.trim()) {
      setError("Ingresá tu nombre")
      return
    }
    setError("")
    setEnviando(true)
    try {
      const res = await fetch("/api/clientes/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: slug, nombre, telefono, email, dni, domicilio }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo completar el registro")
      setEnviado(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar el registro")
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-6 dark:bg-slate-950">
        <div className="max-w-sm text-center">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
          <h1 className="mb-2 text-xl font-bold">¡Listo!</h1>
          <p className="text-sm text-muted-foreground">Ya sos cliente. Gracias por sumarte.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white py-16 dark:bg-slate-950">
      <div className="mx-auto max-w-sm space-y-6 px-6">
        <div className="flex items-center gap-3">
          <UserPlus className="h-6 w-6 text-emerald-500" />
          <h1 className="text-2xl font-bold">Hacerme cliente</h1>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Teléfono</Label>
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">DNI (opcional)</Label>
            <Input value={dni} onChange={(e) => setDni(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Domicilio (opcional)</Label>
            <Input value={domicilio} onChange={(e) => setDomicilio(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            disabled={enviando}
            onClick={enviar}
          >
            {enviando ? "Enviando…" : "Confirmar"}
          </Button>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Paso 3: Probar manualmente**

Run: `npm run dev`

Ir a `/[nombre-de-un-tenant-de-prueba]/cliente`, completar el formulario sin DNI y confirmar que aparece la pantalla de éxito. Verificar en Supabase (tabla `clientes`) que se creó la fila. Repetir con el mismo DNI usado antes y confirmar que actualiza en vez de duplicar.

- [ ] **Paso 4: Commit**

```bash
git add app/api/clientes/registrar app/[slug]/cliente
git commit -m "feat(clientes): alta publica de cliente (hacerme cliente)"
```

---

### Tarea 14: Plan, permisos, sidebar

**Files:**
- Modify: `lib/plans.ts`
- Modify: `lib/auth/permissions.ts`
- Modify: `components/vet-admin-sidebar.tsx`

- [ ] **Paso 1: Agregar la feature `promosSorteos` a `lib/plans.ts`**

En la unión de tipo `Feature` (línea 15-24), agregar:

```typescript
  | "ventas"             // punto de venta, caja y remitos
  | "promosSorteos"      // ofertas, promociones y sorteos
```

En `ALL_FEATURES_OFF` (línea 44-54):

```typescript
  ventas: false,
  promosSorteos: false,
```

En `PLANS.pro.features` (línea 97-107), agregar `promosSorteos: true,` junto a `ventas: true,`.

En `PLANS.pro.highlights` (línea 108-116), agregar el bullet:

```typescript
      "Ofertas, promociones y sorteos",
```

- [ ] **Paso 2: Agregar la sección a `lib/auth/permissions.ts`**

En `AdminSection` (línea 4-6):

```typescript
export type AdminSection =
  | "dashboard" | "turnos" | "libreta" | "clientes" | "productos"
  | "pos" | "ventas" | "caja" | "cuentaCorriente" | "promosSorteos" | "configuracion"
```

En `SECTION_ACCESS` (línea 13-28), agregar después de `cuentaCorriente`:

```typescript
  // Armar ofertas/promos/sorteos es parte del mostrador, igual que vender.
  promosSorteos: ["superadmin", "veterinario", "empleado"],
```

- [ ] **Paso 3: Agregar el ítem al sidebar**

En `components/vet-admin-sidebar.tsx`, importar el ícono `Gift` de `lucide-react` (agregar a la lista de imports de la línea 5-8) y agregar el ítem al grupo "Comercio" (después de `CuentaCorriente`, línea 56):

```typescript
        { href: `/${slug}/admin/PromosSorteos`, label: "Promos",     icon: Gift,         section: "promosSorteos" },
```

- [ ] **Paso 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Paso 5: Probar de punta a punta con un tenant en plan Pro**

Run: `npm run dev`

Con un usuario `veterinario` de un tenant en plan `pro`: confirmar que "Promos" aparece en el sidebar (grupo Comercio), que lleva a `/[slug]/admin/PromosSorteos`, y que las tres pestañas funcionan. Con un tenant en plan `basico`/`plus`: confirmar que la ruta muestra el cartel de upsell de `FeatureGate` en vez de la pantalla.

- [ ] **Paso 6: Commit**

```bash
git add lib/plans.ts lib/auth/permissions.ts components/vet-admin-sidebar.tsx
git commit -m "feat(promos-sorteos): feature gate, permisos por rol y entrada en el sidebar"
```

---

### Tarea 15: Suite completa y verificación final

**Files:** ninguno (solo verificación)

- [ ] **Paso 1: Correr toda la suite de tests**

Run: `npm run test`
Expected: PASS, sin regresiones en `lib/ventas/carrito.test.ts`, `lib/productos/precios.test.ts` (si existe) ni el resto.

- [ ] **Paso 2: Verificar tipos de todo el proyecto**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Paso 3: Lint**

Run: `npm run lint`
Expected: sin errores nuevos introducidos por este trabajo.

- [ ] **Paso 4: Build de producción**

Run: `npm run build`
Expected: build exitoso (confirma que no hay errores de tipos que `tsc --noEmit` con configuración distinta pudiera dejar pasar, y que las nuevas rutas se generan).

- [ ] **Paso 5: Smoke test manual final**

Con `npm run dev` y un tenant Pro:
1. Crear una oferta desde el tab "Ofertas".
2. Crear una promoción de 2 productos desde el tab "Promociones".
3. Vender esos 2 productos juntos en el POS y confirmar que el subtotal aplica el precio de combo.
4. Crear un sorteo con fechas ya vencidas y 2 premios, hacer una venta con cliente en ese rango, sortear y confirmar que hay un ganador distinto por premio (o "sin ganador" si no alcanzan participantes).
5. Registrar un cliente nuevo desde `/[slug]/cliente` sin sesión iniciada.

No requiere paso de commit — es la verificación de cierre del plan completo.
