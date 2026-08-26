# Vidriera de Productos + Migración de Rutas Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar la tabla de productos del admin, permitir publicar productos en la página pública del tenant, y migrar todas las rutas admin de `/[slug]/<nombre>` a `/[slug]/admin/<Nombre>`.

**Architecture:** (1) Migración mecánica de carpetas de rutas Next.js + actualización de todos los links/redirects que las referencian. (2) Nueva columna `publicado_en_landing` en Supabase + toggle en la tabla admin. (3) Nueva sección en la landing pública y nueva página `/[slug]/productos` (liberada por la migración) que leen productos publicados.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), React 19, Tailwind v4, Vitest.

---

## Orden de ejecución

Los tres bloques son secuenciales por dependencia real: la vidriera pública (Tareas 8-11) necesita que `/[slug]/productos` esté libre, lo cual requiere que la migración de rutas (Tareas 1-6) haya movido el admin de productos a `/[slug]/admin/Productos` primero. La reorganización de columnas de la tabla (Tarea 7) es independiente y puede ir en cualquier momento, pero al estar en el mismo archivo que se toca en Tarea 12 (toggle), se hace justo antes.

1. Migración de rutas admin (Tareas 1-6)
2. Columnas de la tabla admin (Tarea 7)
3. Campo `publicadoEnLanding` + toggle (Tareas 8-9)
4. Vidriera pública (Tareas 10-13)

---

### Task 1: Mover las carpetas de rutas admin

**Files:**
- Move: `app/[slug]/(vetadmin)/admin/page.tsx` → `app/[slug]/(vetadmin)/admin/Dashboard/page.tsx`
- Move: `app/[slug]/(vetadmin)/turnoadmin/page.tsx` → `app/[slug]/(vetadmin)/admin/Turnos/page.tsx`
- Move: `app/[slug]/(vetadmin)/libretasanitaria/page.tsx` → `app/[slug]/(vetadmin)/admin/Libreta/page.tsx`
- Move: `app/[slug]/(vetadmin)/clientes/page.tsx` → `app/[slug]/(vetadmin)/admin/Clientes/page.tsx`
- Move: `app/[slug]/(vetadmin)/pos/page.tsx` → `app/[slug]/(vetadmin)/admin/Vender/page.tsx`
- Move: `app/[slug]/(vetadmin)/productos/page.tsx` → `app/[slug]/(vetadmin)/admin/Productos/page.tsx`
- Move: `app/[slug]/(vetadmin)/ventas/page.tsx` → `app/[slug]/(vetadmin)/admin/Ventas/page.tsx`
- Move: `app/[slug]/(vetadmin)/caja/page.tsx` → `app/[slug]/(vetadmin)/admin/Caja/page.tsx`
- Move: `app/[slug]/(vetadmin)/cuenta-corriente/page.tsx` → `app/[slug]/(vetadmin)/admin/CuentaCorriente/page.tsx`
- Move: `app/[slug]/(vetadmin)/configuracion/page.tsx` → `app/[slug]/(vetadmin)/admin/Configuracion/page.tsx`
- Create: `app/[slug]/(vetadmin)/admin/page.tsx` (nuevo, solo redirect)

`app/[slug]/(vetadmin)/onboarding/page.tsx` **no se mueve** — no forma parte del
menú del sidebar y queda fuera del alcance de esta migración (sigue siendo
`/[slug]/onboarding`).

- [ ] **Step 1: Mover cada carpeta con git, preservando historial**

```bash
git mv "app/[slug]/(vetadmin)/admin/page.tsx" "app/[slug]/(vetadmin)/admin/Dashboard/page.tsx"
git mv "app/[slug]/(vetadmin)/turnoadmin" "app/[slug]/(vetadmin)/admin/Turnos"
git mv "app/[slug]/(vetadmin)/libretasanitaria" "app/[slug]/(vetadmin)/admin/Libreta"
git mv "app/[slug]/(vetadmin)/clientes" "app/[slug]/(vetadmin)/admin/Clientes"
git mv "app/[slug]/(vetadmin)/pos" "app/[slug]/(vetadmin)/admin/Vender"
git mv "app/[slug]/(vetadmin)/productos" "app/[slug]/(vetadmin)/admin/Productos"
git mv "app/[slug]/(vetadmin)/ventas" "app/[slug]/(vetadmin)/admin/Ventas"
git mv "app/[slug]/(vetadmin)/caja" "app/[slug]/(vetadmin)/admin/Caja"
git mv "app/[slug]/(vetadmin)/cuenta-corriente" "app/[slug]/(vetadmin)/admin/CuentaCorriente"
git mv "app/[slug]/(vetadmin)/configuracion" "app/[slug]/(vetadmin)/admin/Configuracion"
```

Expected: cada `git mv` termina sin error; `git status` muestra los archivos
como renombrados (`R`), no como borrado+creado.

- [ ] **Step 2: Crear el nuevo `admin/page.tsx` que redirige al dashboard**

```tsx
import { redirect } from "next/navigation"

export default async function AdminIndexPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/${slug}/admin/Dashboard`)
}
```

- [ ] **Step 3: Verificar que no quedaron carpetas viejas vacías**

Run: `find "app/[slug]/(vetadmin)" -maxdepth 1 -type d`
Expected: solo aparecen `admin` y `onboarding` (además del propio directorio).

- [ ] **Step 4: Commit**

```bash
git add "app/[slug]/(vetadmin)"
git commit -m "refactor: mover rutas admin a /[slug]/admin/<Nombre>"
```

---

### Task 2: Actualizar `vet-admin-sidebar.tsx`

**Files:**
- Modify: `components/vet-admin-sidebar.tsx`

- [ ] **Step 1: Actualizar todos los `href` de `gruposNav()`**

Reemplazar el cuerpo de la función (líneas 37-67) por:

```tsx
function gruposNav(slug: string): { titulo: string; tour?: string; items: ItemNav[] }[] {
  return [
    {
      titulo: "Clínica",
      items: [
        { href: `/${slug}/admin/Dashboard`,       label: "Dashboard", icon: LayoutDashboard, section: "dashboard" },
        { href: `/${slug}/admin/Turnos`,          label: "Turnos",    icon: Calendar,        section: "turnos" },
        { href: `/${slug}/admin/Libreta`,         label: "Libreta",   icon: FileText,        section: "libreta" },
        { href: `/${slug}/admin/Clientes`,        label: "Clientes",  icon: Users,           section: "clientes" },
      ],
    },
    {
      titulo: "Comercio",
      tour: "comercio",
      items: [
        { href: `/${slug}/admin/Vender`,          label: "Vender",     icon: ShoppingCart, section: "pos" },
        { href: `/${slug}/admin/Productos`,       label: "Productos",  icon: Package,      section: "productos" },
        { href: `/${slug}/admin/Ventas`,          label: "Ventas",     icon: Receipt,      section: "ventas" },
        { href: `/${slug}/admin/Caja`,            label: "Caja",       icon: Wallet,       section: "caja" },
        { href: `/${slug}/admin/CuentaCorriente`, label: "Cta Cte",    icon: Landmark,     section: "cuentaCorriente" },
      ],
    },
    {
      titulo: "Cuenta",
      tour: "cuenta",
      items: [
        { href: `/${slug}/admin/Configuracion`, label: "Configuración", icon: Settings, section: "configuracion" },
      ],
    },
  ]
}
```

- [ ] **Step 2: Actualizar el link del logo/header del sidebar (línea 94)**

```tsx
              <Link href={`/${slug}/admin/Dashboard`} onClick={cerrarEnMobile}>
```

- [ ] **Step 3: Commit**

```bash
git add components/vet-admin-sidebar.tsx
git commit -m "refactor: sidebar apunta a las rutas /admin/<Nombre>"
```

---

### Task 3: Actualizar `vet-admin-layout.tsx`

**Files:**
- Modify: `components/vet-admin-layout.tsx`

- [ ] **Step 1: Actualizar `sectionFromPath` (líneas 28-40)**

El orden importa: `/${slug}/admin/Dashboard` también empieza con
`/${slug}/admin`, así que el chequeo de `admin` genérico tiene que ir último
o el resto nunca matchea. Con el prefijo común `/${slug}/admin/` en todas las
rutas, alcanza con un chequeo por nombre exacto de segmento:

```tsx
function sectionFromPath(pathname: string, slug: string): AdminSection | null {
  const base = `/${slug}/admin/`
  if (!pathname.startsWith(base)) return null
  const resto = pathname.slice(base.length)
  if (resto.startsWith("Configuracion")) return "configuracion"
  if (resto.startsWith("Turnos")) return "turnos"
  if (resto.startsWith("Libreta")) return "libreta"
  if (resto.startsWith("Clientes")) return "clientes"
  if (resto.startsWith("Productos")) return "productos"
  if (resto.startsWith("Vender")) return "pos"
  if (resto.startsWith("Ventas")) return "ventas"
  if (resto.startsWith("Caja")) return "caja"
  if (resto.startsWith("CuentaCorriente")) return "cuentaCorriente"
  if (resto.startsWith("Dashboard")) return "dashboard"
  return null
}
```

- [ ] **Step 2: Actualizar los dos `router.push` que apuntan al dashboard (líneas 83 y 130)**

```tsx
      if (section && !canAccessSection(userRole, section)) {
        router.push(`/${slug}/admin/Dashboard`)
        return
      }
```

```tsx
              onClick={() => router.push(`/${slug}/admin/Dashboard?tour=1`)}
```

- [ ] **Step 3: Commit**

```bash
git add components/vet-admin-layout.tsx
git commit -m "refactor: layout admin reconoce las rutas /admin/<Nombre>"
```

---

### Task 4: Actualizar `navbar.tsx`

**Files:**
- Modify: `components/navbar.tsx:276-279`

- [ ] **Step 1: Simplificar el regex `isVetAdmin`**

Con todas las rutas del panel bajo el mismo prefijo `/admin/`, el regex se
simplifica y ya no hay que mantener una lista de segmentos sueltos:

```tsx
  // Vet admin pages have their own nav via VetAdminLayout.
  // Todas viven bajo /[slug]/admin/ — si se agrega una ruta admin nueva bajo
  // ese prefijo, no hace falta tocar este regex.
  const isVetAdmin = /^\/[^/]+\/admin(\/|$)/.test(pathname) ||
    /^\/[^/]+\/onboarding/.test(pathname)
  if (isVetAdmin) return null
```

- [ ] **Step 2: Commit**

```bash
git add components/navbar.tsx
git commit -m "refactor: navbar detecta rutas admin por el prefijo /admin/"
```

---

### Task 5: Actualizar los links restantes hacia rutas admin

**Files:**
- Modify: `app/[slug]/(vetadmin)/admin/Dashboard/page.tsx` (líneas 82, 91, 100, 109, 253, 274 en el archivo original — buscar por contenido tras el move)
- Modify: `app/[slug]/(vetadmin)/onboarding/page.tsx:39,54`
- Modify: `components/admin/dashboard-tour.tsx:78`

- [ ] **Step 1: Buscar todas las referencias restantes a las rutas viejas**

Run: `grep -rn '\${slug}/turnoadmin\|\${slug}/libretasanitaria\|\${slug}/clientes\|\${slug}/pos\|\${slug}/productos\|\${slug}/ventas\|\${slug}/caja\|\${slug}/cuenta-corriente\|\${slug}/configuracion' --include='*.tsx' .`

Expected: solo aparecen los 6 hits ya identificados (Dashboard/page.tsx x4
para los quick-links + 1 dashboard-charts callback, y ninguno más). Si
aparece alguno no listado acá, agregarlo a este mismo paso antes de seguir.

- [ ] **Step 2: Actualizar `admin/Dashboard/page.tsx`**

Los 4 quick-links (antes líneas 82, 91, 100, 109):

```tsx
      href: `/${slug}/admin/Turnos`,
```
```tsx
      href: `/${slug}/admin/Libreta`,
```
```tsx
      href: `/${slug}/admin/Clientes`,
```
```tsx
      href: `/${slug}/admin/Configuracion`,
```

El breadcrumb (antes línea 253):

```tsx
              { label: "Panel admin", path: `/${slug}/admin/Dashboard` },
```

El callback del gráfico (antes línea 274):

```tsx
          <DashboardCharts tenantId={slug} onNavigateToTurnos={() => router.push(`/${slug}/admin/Turnos`)} />
```

- [ ] **Step 3: Actualizar `onboarding/page.tsx`**

Las dos ocurrencias (líneas 39 y 54):

```tsx
      router.push(`/${slug}/admin/Dashboard`)
```

- [ ] **Step 4: Actualizar `dashboard-tour.tsx`**

Línea 78:

```tsx
          if (forzado) router.replace(`/${slug}/admin/Dashboard`)
```

- [ ] **Step 5: Commit**

```bash
git add "app/[slug]/(vetadmin)/admin/Dashboard/page.tsx" "app/[slug]/(vetadmin)/onboarding/page.tsx" components/admin/dashboard-tour.tsx
git commit -m "refactor: actualizar links internos a las nuevas rutas /admin/<Nombre>"
```

---

### Task 6: Verificación manual de la migración de rutas

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Levantar el dev server**

Run: `npm run dev`

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores. Si hay imports rotos por el `git mv` (paths relativos
dentro de los `page.tsx` movidos, si los hubiera), corregirlos acá.

- [ ] **Step 3: Recorrido manual de cada ruta del sidebar**

Con un usuario `veterinario` o `superadmin` logueado en un tenant de prueba,
hacer click en cada ítem del sidebar (Dashboard, Turnos, Libreta, Clientes,
Vender, Productos, Ventas, Caja, Cta Cte, Configuración) y confirmar:
- La URL en la barra del navegador usa el patrón `/[slug]/admin/<Nombre>`.
- La página carga sin el navbar público superpuesto (confirma que
  `isVetAdmin` sigue detectando correctamente).
- El ítem activo en el sidebar se resalta (confirma que el `pathname.startsWith(href)`
  de `vet-admin-sidebar.tsx:119` sigue funcionando con las rutas nuevas).

- [ ] **Step 4: Verificar el redirect de `/[slug]/admin` a pelo**

Navegar manualmente a `/<slug>/admin` (sin subruta) y confirmar que redirige
a `/<slug>/admin/Dashboard`.

- [ ] **Step 5: Verificar el botón "Ayuda" del header (tour)**

Click en "Ayuda" desde cualquier sección; confirmar que lleva a
`/<slug>/admin/Dashboard?tour=1` y dispara el tour.

- [ ] **Step 6: Verificar el onboarding**

Como usuario recién registrado, completar el wizard de onboarding y
confirmar que redirige a `/<slug>/admin/Dashboard` al terminar (o al saltarlo).

No hay commit en esta tarea — es solo verificación. Si algo falla, corregirlo
en el archivo correspondiente de las Tareas 2-5 y volver a commitear ahí.

---

### Task 7: Reorganizar columnas de la tabla admin de productos

**Files:**
- Modify: `components/admin/productos-management.tsx:408-531`

- [ ] **Step 1: Actualizar el encabezado de la tabla (líneas 408-414)**

```tsx
                  <TableHead>Producto</TableHead>
                  <TableHead className="hidden md:table-cell">Rubro</TableHead>
                  <TableHead className="text-right">Precio original</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Margen</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Precio con oferta</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
```

Se elimina el `<TableHead>Vence</TableHead>` (antes línea 413).

- [ ] **Step 2: Separar la celda de precio en dos columnas (líneas 461-493)**

Reemplazar el bloque completo de la celda "Precio" + la celda "Margen"
existente por tres celdas: precio original simple, margen (sin cambios), y
precio con oferta nueva:

```tsx
                      <TableCell className="text-right">
                        {formatCurrency(p.precio)}
                      </TableCell>

                      <TableCell className="hidden text-right text-xs lg:table-cell">
                        {margen === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={margen < 0 ? "font-medium text-red-600" : "text-muted-foreground"}>
                            {margen.toFixed(0)}%
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="hidden text-right lg:table-cell">
                        {combo ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                            <Tag className="h-3 w-3" /> {combo}
                          </span>
                        ) : enOferta ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                            <Tag className="h-3 w-3" /> {formatCurrency(precioFinal(p))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
```

- [ ] **Step 3: Eliminar la celda "Vence" (antes líneas 521-531)**

Borrar el bloque:

```tsx
                      <TableCell className="hidden text-right text-xs lg:table-cell">
                        {dias === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={cn(
                            dias < 0 ? "font-medium text-red-600" : dias <= 30 ? "text-amber-600" : "text-muted-foreground",
                          )}>
                            {formatFechaISO(p.fechaVencimiento)}
                          </span>
                        )}
                      </TableCell>
```

La variable `dias` (línea 421: `const dias = diasHastaVencimiento(p.fechaVencimiento)`)
y el import de `diasHastaVencimiento` y `formatFechaISO` quedan sin uso —
eliminarlos también:

- Línea 421: borrar `const dias = diasHastaVencimiento(p.fechaVencimiento)`.
- Línea 37: sacar `diasHastaVencimiento` del import de `lib/productos/precios`.
- Línea 40: sacar `formatFechaISO` del import de `lib/format` (revisar que no
  se use en otra parte del archivo antes de sacarlo — no se usa: es la única
  referencia).

- [ ] **Step 4: Verificar tipos y lint**

Run: `npx tsc --noEmit`
Expected: sin errores (en particular, sin "declared but never read" de
`dias`, `diasHastaVencimiento` o `formatFechaISO`).

Run: `npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add components/admin/productos-management.tsx
git commit -m "feat(productos): separar precio original y precio con oferta en columnas, sacar Vence de la tabla"
```

---

### Task 8: Migración SQL para `publicado_en_landing`

**Files:**
- Create: `supabase/015_productos_publicados.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- ============================================================================
-- 015. Publicación de productos en la landing pública del tenant.
--
-- Campo manual, independiente de `activo` y del stock: el vet decide qué
-- mostrar en su vidriera pública, no es automático. Default false para no
-- exponer de golpe todo el catálogo ya cargado de los tenants existentes.
-- ============================================================================

alter table public.productos
  add column if not exists publicado_en_landing boolean not null default false;

create index if not exists productos_publicados_idx
  on public.productos (tenant_id)
  where publicado_en_landing;
```

- [ ] **Step 2: Ejecutar la migración en el SQL Editor de Supabase**

Correr el contenido del archivo en el SQL Editor del proyecto Supabase
(igual que las migraciones anteriores — no hay CLI de migraciones automática
en este repo, ver `supabase/004_productos.sql` como referencia de flujo).

- [ ] **Step 3: Commit**

```bash
git add supabase/015_productos_publicados.sql
git commit -m "feat(db): agregar publicado_en_landing a productos"
```

---

### Task 9: Campo `publicadoEnLanding` en el tipo y capa de datos

**Files:**
- Modify: `lib/supabase/types.ts:287-326`
- Modify: `lib/supabase/productos.ts:30-59` (mapeo `aProducto`)
- Modify: `lib/supabase/productos.ts` (nueva función `setPublicadoEnLanding`)

- [ ] **Step 1: Agregar el campo a la interfaz `Producto`**

En `lib/supabase/types.ts`, dentro de `interface Producto` (después de
`revisar: boolean`, línea 323):

```typescript
  /** true = aparece en la vidriera pública del tenant (/[slug]/productos). */
  publicadoEnLanding: boolean
```

- [ ] **Step 2: Mapear la columna en `aProducto`**

En `lib/supabase/productos.ts`, dentro de `aProducto` (después de
`revisar: (f.revisar as boolean) ?? false,`, línea 55):

```typescript
    publicadoEnLanding: (f.publicado_en_landing as boolean) ?? false,
```

- [ ] **Step 3: Agregar la función `setPublicadoEnLanding`**

Justo debajo de `setOferta` (después de la línea 567) en
`lib/supabase/productos.ts`:

```typescript
/**
 * Alterna la visibilidad del producto en la vidriera pública. Es un toggle de
 * un solo campo, separado del flujo de edición completa del producto (que
 * pasa por `updateProducto`) para no forzar a abrir el diálogo entero solo
 * para publicar/despublicar.
 */
export async function setPublicadoEnLanding(
  tenantId: string,
  id: string,
  publicado: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("productos").update({ publicado_en_landing: publicado })
    .eq("tenant_id", tenantId).eq("id", id)

  if (error) throw mensajeError(error, "No se pudo actualizar la publicación")
}
```

- [ ] **Step 4: Agregar la función `getProductosPublicados`**

Al final de `lib/supabase/productos.ts`, después de `aplicarMargen`:

```typescript
// ── Vidriera pública ──

/**
 * Productos publicados en la landing, para el fetch client-side de
 * `vet-public-view.tsx` y de `/[slug]/productos`. No trae `costo` ni datos
 * de stock/margen — esos campos no deben llegar al cliente público, aunque
 * `aProducto` los deje en `undefined`/`0` porque la fila no los trae.
 */
export async function getProductosPublicados(tenantId: string): Promise<Producto[]> {
  const { data, error } = await supabase
    .from("productos")
    .select(
      "id, nombre, imagen_url, precio, unidad, oferta_activa, oferta_tipo, oferta_valor, oferta_cantidad",
    )
    .eq("tenant_id", tenantId)
    .eq("activo", true)
    .eq("publicado_en_landing", true)
    .order("nombre")

  if (error) {
    console.error("Error listando productos publicados:", error.message)
    return []
  }

  return (data ?? []).map(aProducto)
}
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores. `aProducto` recibe un `Fila` (`Record<string, unknown>`)
así que el `select` parcial de `getProductosPublicados` sigue tipando bien
aunque falten columnas — los campos ausentes caen en sus defaults dentro de
`aProducto` (`descripcion: ""`, `stock: 0`, `activo: true` vía `?? true`,
etc.), lo cual es aceptable porque el consumidor de esta función solo lee
`nombre`, `imagenUrl`, `precio` y los campos de oferta.

- [ ] **Step 6: Commit**

```bash
git add lib/supabase/types.ts lib/supabase/productos.ts
git commit -m "feat(productos): campo publicadoEnLanding y queries de vidriera publica"
```

---

### Task 10: Test de `getProductosPublicados` y `setPublicadoEnLanding`

Estas dos funciones pegan contra Supabase real (no hay mocks de red en este
repo para la capa `lib/supabase/*`, a diferencia de `lib/productos/precios.ts`
que es puro — ver `precios.test.ts` como referencia de qué SÍ se testea con
Vitest hoy). No se agrega test unitario para estas dos funciones por el mismo
motivo por el que no existen para `setOferta`, `createProducto`, etc.: son
wrappers finos de una query, y su corrección se verifica en la Tarea 12
(prueba manual del toggle) y en la Tarea 13 (prueba manual de la vidriera).

**Files:** ninguno — tarea informativa, no produce cambios.

- [ ] **Step 1: Confirmar el patrón existente**

Run: `grep -l "describe\|it(" lib/supabase/*.test.ts 2>/dev/null || echo "sin tests en lib/supabase"`
Expected: "sin tests en lib/supabase" (confirma que el patrón del repo es no
testear unitariamente la capa de datos de Supabase, solo la lógica pura en
`lib/productos/precios.ts` y `lib/productos/importar.ts`).

No hay commit — este paso solo confirma la convención antes de seguir.

---

### Task 11: Toggle de publicación en la tabla admin

**Files:**
- Modify: `components/admin/productos-management.tsx`

- [ ] **Step 1: Importar `setPublicadoEnLanding` y los íconos**

Línea 6-9 (imports de `lucide-react`): agregar `Eye` y `EyeOff` a la lista
existente.

Línea 30 (import de `lib/supabase/productos`): agregar `setPublicadoEnLanding`
a la lista de funciones importadas.

- [ ] **Step 2: Agregar el handler de toggle**

Junto a los demás handlers del componente (buscar `guardarOferta` o
`moverStock` como referencia de forma — reciben `tenantId` del closure del
componente y llaman `recargarTodo()` o actualizan estado local al final):

```tsx
  const [publicando, setPublicando] = useState<string | null>(null)

  const togglePublicado = useCallback(async (p: Producto) => {
    setPublicando(p.id)
    try {
      await setPublicadoEnLanding(tenantId, p.id, !p.publicadoEnLanding)
      await recargarTodo()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar la publicación")
    } finally {
      setPublicando(null)
    }
  }, [tenantId, recargarTodo])
```

Si `recargarTodo` no está memoizado con `useCallback` en el archivo actual,
agregarlo a las dependencias tal como esté declarado (revisar la firma real
al editar — no cambiar su implementación).

- [ ] **Step 3: Agregar el botón en la celda de Acciones**

En el bloque de botones de Acciones (línea 534, dentro de
`<div className="flex justify-end gap-1">`), antes del botón de Oferta:

```tsx
                          <Button
                            size="sm" variant="ghost"
                            className={cn("h-8 px-2", p.publicadoEnLanding && "text-emerald-600")}
                            onClick={() => togglePublicado(p)}
                            disabled={publicando === p.id || readOnly}
                            title={p.publicadoEnLanding ? "Publicado en tu página" : "No publicado"}
                          >
                            {p.publicadoEnLanding
                              ? <Eye className="h-3.5 w-3.5" />
                              : <EyeOff className="h-3.5 w-3.5" />}
                          </Button>
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Prueba manual**

Con el dev server corriendo, en `/[slug]/admin/Productos`:
1. Click en el ícono de publicación de un producto — confirmar que cambia a
   verde/`Eye` y que un refresh de página mantiene el estado (persistió en
   Supabase).
2. Click de nuevo — confirmar que vuelve a `EyeOff` gris.
3. Con `readOnly` (trial vencido, si hay forma fácil de simularlo en el
   entorno de prueba) confirmar que el botón está deshabilitado, igual que
   los demás botones de Acciones.

- [ ] **Step 6: Commit**

```bash
git add components/admin/productos-management.tsx
git commit -m "feat(productos): toggle para publicar/despublicar en la landing"
```

---

### Task 12: Sección "Productos" en la landing pública

**Files:**
- Modify: `app/[slug]/vet-public-view.tsx`

- [ ] **Step 1: Importar lo necesario**

Después de los imports existentes (línea 13, `import Link from "next/link"`):

```tsx
import { Package } from "lucide-react"
import { getProductosPublicados } from "@/lib/supabase/productos"
import { normalizePlan, PLANS } from "@/lib/plans"
import { precioFinal, tieneOferta } from "@/lib/productos/precios"
import { formatCurrency } from "@/lib/format"
import type { Producto } from "@/lib/supabase/types"
```

(`Package` se suma a la lista ya importada de `lucide-react` en vez de una
import nueva — revisar si ya está en la lista existente antes de duplicar.)

- [ ] **Step 2: Agregar estado y fetch de productos publicados**

En el componente `VetPublicPage` (después de `const [heroVisible, setHeroVisible] = useState(false)`,
línea 276):

```tsx
  const [productos, setProductos] = useState<Producto[]>([])
```

Y dentro del `useEffect` existente (líneas 278-285), sumar el fetch en
paralelo:

```tsx
  useEffect(() => {
    Promise.all([getTenant(slug), getTenantConfig(slug), getProductosPublicados(slug)]).then(
      ([t, cfg, prods]) => {
        setExists(!!t)
        setConfig(cfg)
        setProductos(prods)
        setLoading(false)
        requestAnimationFrame(() => setTimeout(() => setHeroVisible(true), 100))
      },
    )
  }, [slug])
```

- [ ] **Step 3: Calcular si corresponde mostrar la sección**

Después de la línea `const muestraMapa = ...` (línea 335):

```tsx
  const tieneFeatureProductos = PLANS[normalizePlan(config?.plan)].features.productos
  const muestraProductos = tieneFeatureProductos && productos.length > 0
```

- [ ] **Step 4: Agregar el componente `ProductCard`**

Después de la función `ServiceCard` (después de la línea 243, antes de
`/* ═══ FEATURE PILL ═══ */`):

```tsx
/* ═══════════════════════ PRODUCT CARD ═══════════════════════ */

function ProductCard({ p, i, logo, vetNombre }: { p: Producto; i: number; logo?: string; vetNombre: string }) {
  const enOferta = tieneOferta(p)
  const imagen = p.imagenUrl || logo

  return (
    <Reveal delay={i * 80} direction={i % 2 === 0 ? "left" : "right"}>
      <div className="group relative h-full rounded-3xl p-[1px] bg-gradient-to-br from-emerald-500/20 via-transparent to-teal-500/20
                      hover:from-emerald-500/40 hover:to-teal-500/40 transition-all duration-700">
        <div className="relative h-full rounded-3xl bg-white dark:bg-slate-900 overflow-hidden
                        transition-all duration-500 group-hover:shadow-2xl group-hover:shadow-emerald-500/10">
          <div className="aspect-square w-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
            {imagen ? (
              <img
                src={imagen}
                alt={p.nombre}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <Package className="h-12 w-12 text-slate-300 dark:text-slate-600" />
            )}
          </div>
          <div className="p-5">
            <h3 className="font-bold text-slate-900 dark:text-white text-base mb-2 line-clamp-1
                           group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors duration-300">
              {p.nombre}
            </h3>
            {enOferta ? (
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-slate-400 line-through">{formatCurrency(p.precio)}</span>
                <span className="font-bold text-emerald-600">{formatCurrency(precioFinal(p))}</span>
              </div>
            ) : (
              <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(p.precio)}</span>
            )}
          </div>
        </div>
      </div>
    </Reveal>
  )
}
```

`vetNombre` queda en la firma para uso futuro de `alt` más descriptivo, pero
si no se usa dentro del cuerpo hay que sacarlo para no dejar una prop sin
leer — usarlo en el `alt` de la imagen en vez de `p.nombre` cuando la imagen
es el logo del tenant (fallback), ya que ahí `alt={p.nombre}` sería engañoso:

```tsx
                alt={p.imagenUrl ? p.nombre : `Logo de ${vetNombre}`}
```

(reemplaza el `alt={p.nombre}` del Step anterior).

- [ ] **Step 5: Agregar la sección en el JSX, después de Servicios**

Justo después del `</section>` que cierra Servicios (línea 515, antes del
comentario `HORARIOS + CONTACTO`):

```tsx
      {/* ╔══════════════════════════════════════════════════╗
          ║                  PRODUCTOS                       ║
          ╚══════════════════════════════════════════════════╝ */}
      {muestraProductos && (
        <section className="py-28 bg-slate-50 dark:bg-slate-900 relative">
          <div className="container max-w-6xl mx-auto px-6 relative">
            <Reveal>
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-4 py-1.5 mb-5">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.15em]">
                    Productos
                  </span>
                </div>
                <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white tracking-tight mb-4">
                  Todo lo que tu mascota<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500">
                    puede necesitar
                  </span>
                </h2>
              </div>
            </Reveal>

            <div className="flex flex-wrap justify-center gap-6 mb-12">
              {productos.slice(0, 8).map((p, i) => (
                <div key={p.id} className="w-[calc(50%-12px)] lg:w-[calc(25%-18px)]">
                  <ProductCard p={p} i={i} logo={logo} vetNombre={nombre} />
                </div>
              ))}
            </div>

            <div className="flex justify-center">
              <Button
                size="lg"
                variant="outline"
                className="rounded-full font-bold border-2"
                onClick={() => router.push(`/${slug}/productos`)}
              >
                Ver todos los productos
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      )}
```

Se limita a `slice(0, 8)` para no saturar la landing si hay muchos productos
publicados — el catálogo completo vive en `/[slug]/productos` (Tarea 13).

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add "app/[slug]/vet-public-view.tsx"
git commit -m "feat(landing): seccion de productos publicados debajo de Servicios"
```

---

### Task 13: Página pública `/[slug]/productos`

**Files:**
- Create: `app/[slug]/productos/page.tsx`

Esta ruta queda libre porque la Tarea 1 movió el admin de productos a
`/[slug]/admin/Productos`. Vive al mismo nivel que `app/[slug]/turno/`
(pública, fuera del grupo `(vetadmin)`).

- [ ] **Step 1: Crear la página**

```tsx
"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2, ArrowLeft, Stethoscope } from "lucide-react"
import { getTenant, getTenantConfig } from "@/lib/supabase/queries"
import { getProductosPublicados } from "@/lib/supabase/productos"
import { normalizePlan, PLANS } from "@/lib/plans"
import type { TenantConfig } from "@/lib/supabase/queries"
import type { Producto } from "@/lib/supabase/types"
import { Button } from "@/components/ui/button"

export default function ProductosPublicosPage() {
  const params = useParams()
  const slug = params.slug as string
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<TenantConfig | null>(null)
  const [productos, setProductos] = useState<Producto[]>([])

  useEffect(() => {
    Promise.all([getTenant(slug), getTenantConfig(slug), getProductosPublicados(slug)]).then(
      ([t, cfg, prods]) => {
        const tieneFeature = PLANS[normalizePlan(cfg?.plan)].features.productos
        if (!t || !tieneFeature || prods.length === 0) {
          router.replace(`/${slug}`)
          return
        }
        setConfig(cfg)
        setProductos(prods)
        setLoading(false)
      },
    )
  }, [slug, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-white dark:bg-slate-950">
      <div className="container max-w-6xl mx-auto px-6 py-16">
        <Button
          variant="ghost"
          className="mb-8 -ml-3 text-slate-500"
          onClick={() => router.push(`/${slug}`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver a {config?.nombre || slug}
        </Button>

        <div className="flex items-center gap-3 mb-12">
          <Stethoscope className="h-6 w-6 text-emerald-500" />
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
            Productos de {config?.nombre || slug}
          </h1>
        </div>

        <div className="flex flex-wrap gap-6">
          {productos.map((p) => (
            <div key={p.id} className="w-[calc(50%-12px)] sm:w-[calc(33.333%-16px)] lg:w-[calc(25%-18px)]">
              <ProductoTarjeta producto={p} logo={config?.logo} />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Extraer la tarjeta a un componente compartido**

Para no duplicar el JSX de `ProductCard` (Tarea 12) entre la landing y esta
página, se extrae a un archivo propio y ambos lo importan.

Create: `components/public/producto-tarjeta.tsx`

```tsx
import { Package } from "lucide-react"
import { precioFinal, tieneOferta } from "@/lib/productos/precios"
import { formatCurrency } from "@/lib/format"
import type { Producto } from "@/lib/supabase/types"

interface Props {
  producto: Producto
  logo?: string
}

/**
 * Tarjeta de producto para vistas públicas (landing y /[slug]/productos).
 * Sin acciones de compra: es catálogo informativo, el cliente consulta por
 * WhatsApp/teléfono igual que con los servicios.
 */
export function ProductoTarjeta({ producto: p, logo }: Props) {
  const enOferta = tieneOferta(p)
  const imagen = p.imagenUrl || logo

  return (
    <div className="group relative h-full rounded-3xl p-[1px] bg-gradient-to-br from-emerald-500/20 via-transparent to-teal-500/20
                    hover:from-emerald-500/40 hover:to-teal-500/40 transition-all duration-700">
      <div className="relative h-full rounded-3xl bg-white dark:bg-slate-900 overflow-hidden
                      transition-all duration-500 group-hover:shadow-2xl group-hover:shadow-emerald-500/10">
        <div className="aspect-square w-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
          {imagen ? (
            <img
              src={imagen}
              alt={p.nombre}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <Package className="h-12 w-12 text-slate-300 dark:text-slate-600" />
          )}
        </div>
        <div className="p-5">
          <h3 className="font-bold text-slate-900 dark:text-white text-base mb-2 line-clamp-1
                         group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors duration-300">
            {p.nombre}
          </h3>
          {enOferta ? (
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-slate-400 line-through">{formatCurrency(p.precio)}</span>
              <span className="font-bold text-emerald-600">{formatCurrency(precioFinal(p))}</span>
            </div>
          ) : (
            <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(p.precio)}</span>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Reemplazar `ProductCard` en `vet-public-view.tsx` por `ProductoTarjeta`**

En `app/[slug]/vet-public-view.tsx`, borrar la función `ProductCard` agregada
en la Tarea 12 (Step 4) y su import de `Package` si quedó sin otro uso.
Importar en su lugar:

```tsx
import { ProductoTarjeta } from "@/components/public/producto-tarjeta"
```

Y en el JSX de la sección Productos (Tarea 12, Step 5), reemplazar:

```tsx
                <div key={p.id} className="w-[calc(50%-12px)] lg:w-[calc(25%-18px)]">
                  <ProductoTarjeta producto={p} logo={logo} />
                </div>
```

(envuelto en `<Reveal delay={i * 80} direction={i % 2 === 0 ? "left" : "right"}>`
alrededor del `<div>`, para conservar la animación de entrada que tenía
`ProductCard`):

```tsx
              {productos.slice(0, 8).map((p, i) => (
                <Reveal key={p.id} delay={i * 80} direction={i % 2 === 0 ? "left" : "right"}>
                  <div className="w-[calc(50%-12px)] lg:w-[calc(25%-18px)]">
                    <ProductoTarjeta producto={p} logo={logo} />
                  </div>
                </Reveal>
              ))}
```

Nota: `Reveal` espera un único hijo directo y hoy se usa envolviendo un
`<div>` con `className` (ver `ServiceCard`, línea 214) — pero como `Reveal`
en sí ya acepta `className`, y acá el `w-[calc(...)]` es del grid item (el
`<div>` externo), la envoltura correcta es `Reveal` afuera y el `div` de
ancho adentro, tal como se muestra arriba.

- [ ] **Step 4: Usar `ProductoTarjeta` en `productos/page.tsx`**

En el `page.tsx` del Step 1, agregar el import:

```tsx
import { ProductoTarjeta } from "@/components/public/producto-tarjeta"
```

Y reemplazar el uso de `<ProductoTarjeta producto={p} logo={config?.logo} />`
que ya está en el Step 1 — no requiere cambios adicionales, ya se escribió
con el nombre final del componente.

- [ ] **Step 5: Excluir la ruta pública del regex `isVetAdmin`**

Confirmar en `components/navbar.tsx` (Tarea 4) que `/[slug]/productos`
(pública) no matchea `isVetAdmin` — el regex de la Tarea 4 es
`/^\/[^/]+\/admin(\/|$)/`, que no matchea `/vipvet/productos` porque no tiene
el segmento `admin`. Sin acción adicional, solo verificar.

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add app/[slug]/productos components/public/producto-tarjeta.tsx "app/[slug]/vet-public-view.tsx"
git commit -m "feat(landing): pagina publica /[slug]/productos con catalogo de vidriera"
```

---

### Task 14: Verificación end-to-end de la vidriera

**Files:** ninguno — solo verificación manual.

- [ ] **Step 1: Publicar un producto de prueba**

En `/[slug]/admin/Productos` (tenant con plan Plus o Pro), activar el toggle
de publicación en 2-3 productos, al menos uno con oferta activa.

- [ ] **Step 2: Verificar la landing pública**

Navegar a `/[slug]` (sin sesión, en una ventana privada) y confirmar:
- Aparece la sección "Productos" debajo de "Servicios".
- Los productos publicados se ven con imagen (o el logo del tenant, o el
  ícono `Package` si no hay ninguna de las dos).
- El producto con oferta muestra precio tachado + precio final en verde.
- El botón "Ver todos los productos" navega a `/[slug]/productos`.

- [ ] **Step 3: Verificar la página de catálogo**

En `/[slug]/productos`:
- Se ven todos los productos publicados (no solo los primeros 8).
- El botón "Volver" navega a `/[slug]`.
- El navbar público (no el de admin) se muestra en esta página.

- [ ] **Step 4: Verificar el caso sin productos publicados**

Con un tenant sin ningún producto publicado (o plan Básico sin feature
`productos`), confirmar:
- La sección "Productos" no aparece en la landing.
- Navegar manualmente a `/[slug]/productos` redirige de vuelta a `/[slug]`.

No hay commit en esta tarea — es la verificación final de todo el trabajo.
Si algo falla, volver a la tarea correspondiente (12 o 13) y corregir ahí.

---

## Self-Review

**Cobertura del spec:**
- Migración de rutas admin → Tareas 1-6.
- Columnas de la tabla (`Producto | Rubro | Precio original | Margen | Precio con oferta | Stock | Acciones`, sin Vence) → Tarea 7.
- Campo `publicadoEnLanding` + migración SQL → Tareas 8-9.
- Toggle en Acciones → Tarea 11.
- Sección "Productos" en landing con gating por plan y por existencia de productos → Tarea 12.
- Página pública `/[slug]/productos` → Tarea 13.
- Fallback de imagen (imagenUrl → logo tenant → ícono genérico) → Tareas 12-13, componente `ProductoTarjeta`.
- Verificación manual de todo lo anterior → Tareas 6 y 14.

**Consistencia de tipos:** `Producto.publicadoEnLanding` (Tarea 9) se usa con
ese mismo nombre en `productos-management.tsx` (Tarea 11) y no se referencia
en ningún otro lado con nombre distinto. `getProductosPublicados` (Tarea 9)
se consume igual en `vet-public-view.tsx` (Tarea 12) y en
`app/[slug]/productos/page.tsx` (Tarea 13). `ProductoTarjeta` reemplaza al
`ProductCard` intermedio de la Tarea 12 explícitamente en la Tarea 13, Step 3,
para no dejar dos componentes duplicados.
