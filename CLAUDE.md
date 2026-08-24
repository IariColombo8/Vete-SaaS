# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Guía de referencia para Claude Code. Refleja decisiones tomadas y el rumbo del proyecto.

---

## Comandos

```bash
npm run dev        # servidor de desarrollo
npm run build      # build de producción
npm run lint       # ESLint
npx tsc --noEmit   # verificar tipos sin compilar
```

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + shadcn/ui + Tailwind v4 |
| Backend | Firebase (Firestore, Auth, Storage) |
| Auth | Google OAuth 2.0 |
| Forms | react-hook-form + zod |
| Email | EmailJS (cliente) |
| Calendario | Google Calendar API (servidor, JWT) |
| Deploy | Vercel |

---

## Arquitectura

```
app/                       → páginas públicas y protegidas (App Router)
app/[slug]/                → layout que inyecta el slug via SlugProvider
app/[slug]/(vetadmin)/     → rutas protegidas del panel veterinario
app/v/[slug]/              → página pública de cada veterinaria
components/admin/          → gestión interna (turnos, libreta, clientes)
components/turnos/         → flujo de reserva público
context/slug-context.tsx   → SlugProvider + useSlug() hook
hooks/turnos/              → lógica de dominio separada por responsabilidad
hooks/useCurrentTenantId.ts → resuelve tenantId del usuario autenticado
lib/firebase/              → capa de datos (config, auth, firestore, storage)
app/api/                   → server routes (solo Google Calendar hoy)
```

**Patrón de slug/tenant:** `app/[slug]/layout.tsx` lee `params.slug` y lo provee via `SlugProvider`. Los componentes hijo llaman `useSlug()` para obtenerlo. `VetAdminLayout` valida que el usuario autenticado tenga `tenantId === slug` (o sea `superadmin`) antes de renderizar.

**Patrón de datos en Firestore:**
- `veterinarias/{slug}` — doc raíz de cada tenant
- `veterinarias/{slug}/config/datos` — `TenantConfig` (nombre, plan, horarios, servicios, fotos…)
- `veterinarias/{slug}/config/turno` — `TurnoConfig` (mascotas, servicios, vacunas disponibles)
- `clientes/{id}/mascotas/{id}/historias` — historial clínico cronológico
- `clientes/{id}/mascotas/{id}/historiaClinica/registro` — resumen consolidado
- `turnos` — colección raíz (datos denormalizados para lectura rápida en admin)
- `diasBloqueados` — disponibilidad
- `usuarios` — auth + roles (`role`, `tenantId`, `isAdmin` deprecado)

---

## Decisiones tomadas

### Seguridad

**`isAdmin: false` por defecto** (`lib/firebase/auth.ts`)
- Antes: todos los usuarios nuevos recibían `isAdmin: true` automáticamente.
- Ahora: `isAdmin: false`. El acceso admin se asigna manualmente en Firestore.
- Para dar acceso admin a un usuario: editar su documento en `usuarios/{uid}` → `isAdmin: true`.

**`calendarId` obligatorio por env var** (`app/api/calendar/create-event/route.ts`)
- Eliminado el fallback hardcodeado `"veterinariapriscilas@gmail.com"`.
- Requiere `GOOGLE_CALENDAR_CALENDAR_ID` o `CALENDAR_ID` en `.env.local`.
- Si falta, el endpoint responde 503 con mensaje claro.

### Calidad de código

**Sin `ignoreBuildErrors`** (`next.config.mjs`)
- Eliminado `typescript: { ignoreBuildErrors: true }`.
- Los errores de TypeScript ahora bloquean el build. Corregir antes de deployar.

**Sin console.log en producción**
- Eliminados todos los `console.log` de debug con emojis de `auth.ts`, `firestore.ts` y `useTurnoForm.ts`.
- Se conservan únicamente los `console.error` y `console.warn` en bloques catch (errores reales).
- Regla: no agregar `console.log` de debug. Si se necesita tracing, usar condicional: `if (process.env.NODE_ENV === "development")`.

### Productos y stock (port del POS "Kiosko Despensa")

La carpeta `parte de kiosko/` es el proyecto de referencia desde el que se portó
este módulo. **No es código vivo**: está excluida de `tsconfig.json` y de
`vitest.config.ts`. Se puede borrar cuando ya no haga falta consultarla.

Qué se portó y qué se dejó afuera:

| Del kiosko | Estado |
|-----------|--------|
| Catálogo, stock, ofertas/combos, venta por peso, vencimientos, importación Excel, auditoría de precios | Portado |
| POS de venta, caja diaria, ventas, reportes | Portado (ver "Ventas, caja y remitos") |
| Mercado Pago Point/QR, fiado, sync con distribuidora, offline PWA | Descartado |
| Login por PIN (tabla `usuarios` propia) | Descartado — usa el auth del SaaS |

Diferencias de diseño respecto del original:

- `comercio_id text` → `tenant_id text references tenants(slug)`; PK uuid.
- Columnas en español (`nombre`/`precio`/`categoria`), como el resto del schema.
- **RLS encendida.** En el kiosko estaba apagada y todo pasaba por API routes con
  service_role. Acá `es_staff(tenant_id)` alcanza, así que el cliente escribe
  directo y no hay ninguna ruta nueva en `app/api/`.
- La auditoría de precios la hace un **trigger** en Postgres, no el cliente: en el
  original era una llamada aparte después del update que se podía olvidar.
- `stock_bajo` es una columna generada porque PostgREST no compara columna contra
  columna (`stock <= stock_minimo` no se puede filtrar desde el cliente).
- `lote` (unidades por paquete en el kiosko) se renombró a `unidades_por_bulto`:
  en una veterinaria "lote" se lee como el lote de un medicamento.

Archivos:

```
supabase/004_productos.sql              → tablas, RPC, RLS (ejecutar en el SQL Editor)
lib/productos/precios.ts                → cálculo de ofertas/margen/estado (puro, testeado)
lib/productos/importar.ts               → parseo del Excel, en el navegador
lib/supabase/productos.ts               → capa de datos
lib/format.ts                           → formatCurrency / fechas en es-AR
components/admin/productos-management.tsx
components/admin/productos/*.tsx        → diálogos de producto, oferta e importación
app/[slug]/(vetadmin)/productos/page.tsx
```

**El stock nunca se edita con un UPDATE directo.** Se mueve con la RPC
`ajustar_stock`, que valida, actualiza y registra el movimiento en una
transacción. La única excepción es el stock inicial al dar de alta un producto.

Feature `productos` en `lib/plans.ts`: disponible desde el plan **Plus**.
Sección `productos` en `lib/auth/permissions.ts`: la ve también el `empleado`.

### Ventas, caja y remitos

Segunda etapa del port del kiosko. El catálogo ya estaba; acá se agregó el
mostrador.

```
supabase/005_ventas.sql          → cajas, ventas, venta_items, RPC, RLS
lib/ventas/carrito.ts            → carrito puro y testeado (stock, ofertas, kg)
lib/ventas/remito.ts             → PDF con jsPDF + mensaje/link de WhatsApp
lib/supabase/ventas.ts           → capa de datos y métricas
components/admin/pos-management.tsx      + components/admin/pos/*
components/admin/ventas-management.tsx   + components/admin/ventas/*
components/admin/caja-management.tsx
app/[slug]/(vetadmin)/pos/page.tsx      → mostrador
app/[slug]/(vetadmin)/ventas/page.tsx   → dashboard e historial de remitos
app/[slug]/(vetadmin)/caja/page.tsx     → apertura, arqueo y cierre
```

**Vender es una sola RPC.** `registrar_venta` valida el stock, lo descuenta,
inserta los `stock_movimientos` tipo `venta`, asigna el correlativo y guarda
cabecera y detalle en una transacción. Las policies de `ventas` y `venta_items`
son de `select` solamente: no existe forma de tocar el total de una venta ya
cobrada con un update suelto. Anular va por `anular_venta`, que devuelve el
stock y marca la fila — **la venta nunca se borra**, el correlativo del remito
no puede tener agujeros.

`ajustar_stock` sigue rechazando el tipo `venta`: ese movimiento lo escribe
`registrar_venta`, no se hace a mano.

**Alimento.** Tres campos nuevos en `productos` (`marca`, `linea`, `peso_kg`) en
lugar de una tabla de variantes: cada bolsa sigue siendo un producto normal con
su stock y su precio, que es como se compran en la práctica.
- `unidad = 'un'` + `peso_kg` → bolsa cerrada (Royal Canin Adulto 15 kg)
- `unidad = 'kg'` → suelto, y `precio` se lee como **precio por kilo**

**Caja.** Índice único parcial: una sola caja abierta por tenant, garantizado por
la base y no por la aplicación. Vender sin caja abierta está permitido — la venta
se registra igual, solo que sin imputarse a ningún turno. `cerrar_caja` recalcula
el esperado sumando las ventas del turno en vez de confiar en un contador: si
alguna se anuló, el contador queda mal y el arqueo acusa una diferencia falsa.

**Descuento por monto o por porcentaje.** `lib/ventas/carrito.ts` expone
`Descuento = { tipo: "monto" | "porcentaje", valor }`. El porcentaje se calcula
sobre el subtotal **ya con las ofertas del catálogo aplicadas**, no sobre el
precio de lista. `montoDescuento` recorta el resultado al subtotal, así que a la
RPC siempre le llega un monto en pesos que no puede dejar el total en negativo.

**Remito.** Los `venta_items` guardan copia congelada del nombre, la marca y el
precio. El PDF se arma en el navegador con jsPDF y no se persiste: se regenera
desde la venta, que es el dato real. WhatsApp no acepta archivos por URL, así que
el flujo es descargar el PDF y abrir `wa.me` con el mensaje ya escrito.

El PDF sigue la estructura del comprobante argentino, que es la que la gente
reconoce: marco por bloques, **recuadro de la letra "R"** montado sobre la
división entre emisor y comprobante, numeración `0001-00000042`, y bloque de
destinatario con domicilio, DNI/CUIT y condición frente al IVA. Por eso `ventas`
guarda también `cliente_dni` y `cliente_domicilio` en el snapshot.

La tabla de detalle **se estira con renglones vacíos hasta los totales**, como en
el remito de papel: sin eso, una venta de tres ítems dejaba media hoja A4 en
blanco. Las primitivas de dibujo viven aparte en `lib/ventas/remito-layout.ts`
(clase `Lienzo`) para que `remito.ts` se lea como el documento que describe.

Detalles del PDF que conviene no romper:

- **El logo se baja a data URL** (`cargarLogo`): jsPDF no incrusta una URL
  remota. Falla en silencio ante red, CORS o formato raro —los SVG no los
  rasteriza— porque un logo que no carga no puede impedir que salga el remito.
  Por eso `descargarRemitoPDF` es `async`.
- **`splitTextToSize` mide con la fuente ACTIVA**, no con la que se va a usar
  para dibujar. Hay que fijar `setFontSize` antes de partir el texto o el
  recorte se calcula mal y el nombre del producto se desborda sobre la columna
  de cantidad. Cubierto por un test que fija la separación mínima entre esas dos
  columnas.
- **La cebra de la tabla usa un contador de filas propio**, no la distancia
  recorrida: las filas tienen alto variable (una con presentación mide más), así
  que dividir la distancia da una paridad equivocada y el rayado se corta.
- **La ventana de WhatsApp se abre ANTES del `await`** que genera el PDF: si se
  abre después, el navegador ya no la asocia al click y la bloquea como popup.

Feature `ventas` en `lib/plans.ts`: **solo plan Pro**.
Secciones `pos`, `ventas` y `caja` en `lib/auth/permissions.ts`: las ve también
el `empleado`.

**Sidebar del panel.** La barra horizontal se reemplazó por un sidebar lateral
colapsable (`components/vet-admin-sidebar.tsx` sobre `components/ui/sidebar`).
Tres grupos con título: **Clínica** (dashboard, turnos, libreta, clientes),
**Comercio** (vender, productos, ventas, caja) y **Cuenta** (configuración). Un grupo
cuyos items no pasan el filtro de rol desaparece entero, título incluido.

- `collapsible="icon"`: plegado deja los iconos, con el nombre en tooltip.
- El estado se guarda en cookie (`sidebar_state`), así queda como lo dejó el
  usuario entre páginas y recargas. Atajo Ctrl/Cmd+B.
- En mobile es un `Sheet`; navegar lo cierra solo, si no el usuario aterriza en
  la página nueva sin poder verla.
- El `main` ya no tiene `container mx-auto`: con el menú plegado el contenido
  tiene que aprovechar el ancho liberado, sobre todo el mostrador.

**`components/navbar.tsx` tiene que conocer las rutas del panel.** Su regex
`isVetAdmin` decide si el navbar público se dibuja o no; si falta una ruta de
`app/[slug]/(vetadmin)/`, aparecen dos barras encimadas. Le faltaban
`/productos`, `/pos` y `/ventas`.

**Eliminado `app/turno/page copy.tsx`**
- Era un archivo de backup sin uso. Borrado del repo.

---

## Reglas de trabajo con Claude

- **Nunca entregar código con errores de TypeScript.** Antes de dar código al usuario, verificar que compila (`tsc --noEmit`). Si hay errores, corregirlos antes de responder.
- Sin `console.log` de debug (ver sección Calidad de código).

---

## Convenciones del proyecto

- Español en UI, nombres de variables y comentarios.
- Interfaces de Firestore en `lib/firebase/firestore.ts` (fuente de verdad de tipos).
- Hooks de dominio en `hooks/turnos/` — no mezclar lógica de fetch con componentes.
- Evitar `any` en interfaces nuevas. Usar `import { Timestamp } from "firebase/firestore"` para timestamps.
- `images: { unoptimized: true }` se mantiene intencionalmente (compatibilidad con Vercel + Firebase Storage).

---

## Estructura de rutas

| Ruta | Descripción | Acceso |
|------|-------------|--------|
| `/` | SaaS landing — VetPanel | Público |
| `/[slug]` | Página pública de cada veterinaria | Público |
| `/[slug]/turno` | Reserva de turno para ese tenant | Público |
| `/[slug]/admin` | Dashboard del veterinario | `tenantId === slug` o `superadmin` |
| `/[slug]/turnoadmin` | Gestión de turnos | ídem |
| `/[slug]/libretasanitaria` | Libreta sanitaria / historial | ídem |
| `/[slug]/clientes` | Listado de clientes | ídem |
| `/[slug]/productos` | Productos y stock | ídem + plan Plus |
| `/[slug]/pos` | Punto de venta (mostrador) | ídem + plan Pro |
| `/[slug]/ventas` | Dashboard de ventas y remitos | ídem + plan Pro |
| `/[slug]/caja` | Apertura, arqueo y cierre de caja | ídem + plan Pro |
| `/[slug]/configuracion` | Config del tenant | ídem |
| `/v/[slug]` | Alias público alternativo | Público |
| `/mis-turnos` | Turnos del cliente | Autenticado |
| `/login` | Google OAuth | Público |
| `/registro` | Registro | Público |
| `/superadmin` | Panel global | solo `superadmin` |

**Navbar:** componente inteligente en `components/navbar.tsx`:
- `/` → `SaasNavbar` (dark, logo VetPanel, CTA Contratar)
- `/superadmin/*` → `SuperAdminNavbar`
- Resto → `VetNavbar` (logo de la veterinaria actual)

---

## Sistema de roles

Definido en `lib/firebase/firestore.ts`:
```typescript
type UserRole = "superadmin" | "veterinario" | "usuario"
```

| Rol | Acceso | Cómo asignar |
|-----|--------|--------------|
| `superadmin` | `/superadmin` + todo | Firestore manual: `role: "superadmin"` |
| `veterinario` | `/admin` | Firestore manual: `role: "veterinario"` |
| `usuario` | Reservar turnos | Default en registro |

**Backward compat:** si el campo `role` no existe pero `isAdmin: true`, se trata como `veterinario`.

**`tenantId` en `usuarios/{uid}`:** indica a qué veterinaria pertenece el veterinario. `VetAdminLayout` verifica `userData.tenantId === slug` antes de dar acceso. El `tenantId` siempre se resuelve desde la URL (`useSlug()`) — no hay fallback hardcodeado.

**Para dar acceso a un veterinario:**
1. El usuario debe iniciar sesión una vez (se crea su doc en `usuarios/{uid}`)
2. En Firestore → `usuarios/{uid}` → editar `role: "veterinario"` y `tenantId: "<slug>"`

**Para dar acceso superadmin:**
1. El usuario debe iniciar sesión una vez
2. En Firestore → `usuarios/{uid}` → editar `role: "superadmin"`

**`ProtectedRoute`** acepta `requiredRole`:
```tsx
<ProtectedRoute requiredRole="superadmin">{children}</ProtectedRoute>
```

---

## Preparación para SaaS multi-tenant

El proyecto está hoy en modo **single-tenant** (una veterinaria). Las siguientes decisiones de diseño lo preparan para escalar sin reescritura total:

### Qué ya está bien encaminado

- **Datos aislables por `clienteId`/`mascotaId`**: la estructura de subcolecciones de Firestore es compatible con aislamiento por tenant. Agregar un campo `tenantId` a nivel raíz es suficiente.
- **Auth desacoplada del rol**: `isAdmin` vive en Firestore, no en Firebase Auth Custom Claims. Migrar a claims o agregar `tenantId` + `role` en el documento `usuarios` es un cambio localizado en `lib/firebase/auth.ts`.
- **API Routes en servidor**: `app/api/` ya corre server-side. Agregar middleware de autenticación multi-tenant es directo con Next.js middleware.
- **EmailJS y Google Calendar configurados por env vars**: reemplazable por configuración por tenant sin tocar lógica.

### Camino hacia multi-tenant (cuando se necesite)

1. **Modelo de datos**: agregar `tenantId: string` a documentos `turnos`, `clientes`, `diasBloqueados`. Las subcolecciones de mascotas e historias heredan el aislamiento por su path.

2. **Firestore Security Rules**: cambiar reglas de `request.auth != null` a `request.auth.token.tenantId == resource.data.tenantId`. Requiere Firebase Custom Claims.

3. **Colección `tenants`**: crear colección raíz con configuración por veterinaria (nombre, logo, calendarId, emailjs keys, horarios, timezone). Reemplaza las env vars hardcodeadas por tenant.

4. **Middleware de Next.js**: `middleware.ts` resuelve el tenant desde el subdominio (`clinica-a.app.com`) o path (`/app/clinica-a/`) y lo inyecta en el contexto de cada request.

5. **Admin por tenant**: el campo `isAdmin` pasa a ser `role: "owner" | "staff" | "client"` con `tenantId` asociado.

### Lo que NO cambiar para facilitar la migración

- No romper la estructura de subcolecciones de Firestore (ya es correcta para multi-tenant).
- No mezclar datos de configuración dentro de los documentos de turnos/clientes.
- No hardcodear IDs de calendario, emails ni keys (ya corregido).
