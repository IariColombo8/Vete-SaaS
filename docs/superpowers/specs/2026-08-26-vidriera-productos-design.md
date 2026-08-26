# Vidriera de productos + reorganización de tabla admin + migración de rutas admin

Fecha: 2026-08-26

## Contexto

El módulo de productos (ver CLAUDE.md, sección "Productos y stock") ya tiene
catálogo, stock, ofertas y precios resueltos en `lib/productos/precios.ts`.
Falta: (1) ajustar columnas de la tabla admin, (2) permitir publicar productos
en la página pública del tenant, (3) reorganizar las rutas del panel admin a
un esquema `/[slug]/admin/<Nombre>`.

Se decidió encarar los tres puntos en un mismo ciclo de diseño/implementación
porque la vidriera pública necesita la ruta `/[slug]/productos` libre, y esa
ruta hoy la ocupa el admin de productos.

## 1. Migración de rutas admin

Todas las rutas bajo `app/[slug]/(vetadmin)/` (excepto el propio grupo de
layout) se mueven de planas a anidadas bajo `admin/`:

| Ruta actual | Ruta nueva |
|---|---|
| `/[slug]/admin` (era el dashboard) | `/[slug]/admin/Dashboard` |
| `/[slug]/turnoadmin` | `/[slug]/admin/Turnos` |
| `/[slug]/libretasanitaria` | `/[slug]/admin/Libreta` |
| `/[slug]/clientes` | `/[slug]/admin/Clientes` |
| `/[slug]/pos` | `/[slug]/admin/Vender` |
| `/[slug]/productos` | `/[slug]/admin/Productos` |
| `/[slug]/ventas` | `/[slug]/admin/Ventas` |
| `/[slug]/caja` | `/[slug]/admin/Caja` |
| `/[slug]/cuenta-corriente` | `/[slug]/admin/CuentaCorriente` |
| `/[slug]/configuracion` | `/[slug]/admin/Configuracion` |

`/[slug]/admin` deja de ser una page propia; pasa a ser solo el segmento
contenedor. El dashboard vive en `/[slug]/admin/Dashboard/page.tsx`. Se agrega
un `redirect()` desde cualquier acceso a `/[slug]/admin` a pelo (sin subruta)
hacia `/[slug]/admin/Dashboard`, para no romper bookmarks ni links viejos.

Puntos a actualizar (mecánico, sin tocar lógica de negocio):

- `components/vet-admin-sidebar.tsx`: todos los `href` de `gruposNav()`.
- `components/navbar.tsx`: regex `isVetAdmin` debe seguir matcheando las
  rutas nuevas (ahora todas comparten el prefijo `/[slug]/admin/`, lo cual
  simplifica el regex).
- Cualquier `redirect()`/`router.push()` hacia estas rutas tras login o
  registro.
- `hooks/useCurrentTenantId.ts` y `VetAdminLayout` si hardcodean algún path.
- Único link que NO cambia: el botón "Mi página" del sidebar, que apunta a
  `/[slug]` (público).

Riesgo: bajo pero amplio en superficie — cualquier link olvidado rompe una
sección del panel. Mitigación: `grep -r` de cada ruta vieja después de mover
las carpetas, y recorrido manual de cada ítem del sidebar antes de dar por
terminada la tarea.

## 2. Tabla admin de productos — columnas

Ubicación: `components/admin/productos-management.tsx` (tabla ~línea 398).

Columnas finales, en orden:

`[checkbox] | Producto | Rubro | Precio original | Margen | Precio con oferta | Stock | Acciones`

- Se elimina la columna "Vence" de la tabla (el dato de vencimiento sigue
  existiendo en el producto y se sigue pudiendo ver/editar en
  `ProductoDialog`; solo desaparece de esta vista de lista).
- "Precio con oferta" es una columna nueva, separada de "Precio original".
  Usa `precioFinal(p)` de `lib/productos/precios.ts` (ya existente, sin
  cambios). Si el producto no tiene oferta activa (`tieneOferta(p)` es
  `false`) o es un combo (`comboLabel(p)` no nulo — no tiene precio unitario
  fijo), la celda muestra `—`.
- "Precio original" pasa a mostrar siempre `formatCurrency(p.precio)` sin
  el tachado/oferta que hoy comparte con la celda de precio (esa lógica se
  traslada íntegra a la nueva columna).

## 3. Publicar producto en la landing (`publicadoEnLanding`)

### Modelo de datos

Nuevo campo en `Producto` (`lib/supabase/types.ts`):

```typescript
/** true = aparece en la vidriera pública del tenant (/[slug]/productos). */
publicadoEnLanding: boolean
```

Migración SQL (nuevo archivo `supabase/00X_productos_publicados.sql`):
columna `publicado_en_landing boolean not null default false` en `productos`.
Default `false` para filas existentes y nuevas — el vet elige manualmente qué
publicar, no hay migración implícita de productos ya cargados.

`lib/supabase/productos.ts`: `ProductoInput`/`updateProducto` deben poder
setear este campo. Se agrega una función chica dedicada,
`setPublicadoEnLanding(id, valor)`, en vez de forzar el flujo completo de
edición del producto — es un toggle de un solo campo, no una edición de
producto.

### UI en la tabla admin

En la columna Acciones, un botón más (además de Oferta/Editar/Dar de baja):
ícono tipo `Eye`/`EyeOff` (lucide-react) que alterna `publicadoEnLanding`.
Estado visual: ícono resaltado (verde, mismo patrón que el botón de Oferta
cuando `enOferta`) cuando está publicado. Tooltip: "Publicado en tu página" /
"No publicado".

No depende de `activo` ni de `estadoStock` — se puede publicar un producto
con stock bajo o agotado (igual que hoy se puede vender agotado desde el
POS); es una decisión de marketing del vet, no de disponibilidad.

## 4. Sección "Productos" en la landing pública

Ubicación: `app/[slug]/vet-public-view.tsx`, nueva sección debajo de
"Servicios" (después del bloque que termina cerca de la línea 510).

Condiciones para renderizar la sección (ambas):
1. El tenant tiene el feature `productos` habilitado (`PLANS[plan].features.productos`,
   desde `lib/plans.ts` — hoy solo plan Plus y Pro).
2. Existe al menos un producto con `publicadoEnLanding === true` para ese
   tenant.

Si cualquiera de las dos falla, la sección no se renderiza (igual patrón que
otras secciones opcionales de la landing).

### Fetch de datos

`vet-public-view.tsx` es `"use client"` y ya hace fetch de tenant/config vía
`lib/supabase/queries`. Se agrega un fetch adicional (client-side, mismo
patrón que el resto del componente) a una función nueva
`getProductosPublicados(tenantId)` en `lib/supabase/productos.ts`, que trae
`select` filtrado por `tenant_id` y `publicado_en_landing = true` (sin traer
costo/margen — esos campos no deben llegar al cliente público).

### Tarjeta de producto

Reutiliza el estilo visual de `ServiceCard` (mismo grid, mismo tipo de
tarjeta) pero con imagen en vez de emoji:

- Imagen: `producto.imagenUrl` → si no existe, `tenantConfig.logo` → si
  tampoco existe, ícono `Package` de lucide-react centrado sobre fondo
  neutro (`bg-slate-100 dark:bg-slate-800`, mismo criterio de fallback que
  el resto de la landing).
- Nombre del producto.
- Precio: si tiene oferta (`tieneOferta`), precio de lista tachado + precio
  final en verde; si no, precio de lista solo. Se reutiliza
  `lib/productos/precios.ts` sin cambios — es código ya puro y testeado.
- Toda la sección (título + grilla) linkea con un CTA "Ver todos los
  productos" a `/[slug]/productos`.

## 5. Página pública `/[slug]/productos`

Nueva ruta `app/[slug]/productos/page.tsx` (pública, fuera del grupo
`(vetadmin)` — coexiste con `app/[slug]/turno/`, mismo nivel).

Contenido: grilla de todas las tarjetas de productos publicados (mismo
componente de tarjeta que la sección de la landing, reutilizado), sin
carrito ni checkout — catálogo de solo lectura, igual filosofía que la
sección de Servicios (el cliente consulta por WhatsApp/teléfono, no compra
online). Si el tenant no tiene el feature o no hay productos publicados,
la página redirige a `/[slug]`.

`navbar.tsx` no debe tratar esta ruta como admin (el regex `isVetAdmin` no
debe matchearla) — es pública, lleva `VetNavbar` normal.

## Fuera de alcance

- Carrito de compra o checkout online desde la vidriera pública — descartado
  explícitamente, es catálogo informativo.
- Filtros/búsqueda dentro de `/[slug]/productos` — no pedido, YAGNI.
- Tocar la lógica de precios, ofertas o stock — se reutiliza tal cual está.
- Cualquier cambio a los flujos de venta/POS/caja.
