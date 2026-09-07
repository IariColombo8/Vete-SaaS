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
| Backend | Supabase (Postgres + Auth + Storage + RLS) |
| Auth | Supabase Auth (Google OAuth 2.0) |
| Forms | react-hook-form + zod |
| Email | Resend, server-side (`/api/email/send`) |
| WhatsApp | WhatsApp Cloud API (Meta) |
| Calendario / Gmail | Google Calendar API + Gmail API, por tenant (OAuth propio) |
| Billing | Mercado Pago (suscripciones/preapproval) |
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
lib/supabase/               → capa de datos (config, auth, queries por dominio)
app/api/                   → server routes (email, whatsapp, billing, google, crons)
```

**Patrón de slug/tenant:** `app/[slug]/layout.tsx` lee `params.slug` y lo provee via `SlugProvider`. Los componentes hijo llaman `useSlug()` para obtenerlo. `VetAdminLayout` valida que el usuario autenticado tenga `tenantId === slug` (o sea `superadmin`) antes de renderizar. Ver `SaaS.md` para el detalle completo de cómo se garantiza el aislamiento entre tenants.

**Patrón de datos en Supabase (Postgres, ver `supabase/schema.sql`):**
- `tenants` (PK `slug`) — datos del tenant (nombre, plan, horarios, servicios, fotos…)
- `turno_config` (PK `tenant_id`) — mascotas, servicios, vacunas disponibles para el booking
- `clientes` / `mascotas` / `historias` / `historia_clinica` — historial clínico, todas con `tenant_id`
- `turnos` — tabla raíz con datos denormalizados (snapshot de cliente/mascota) para lectura rápida en admin
- `dias_bloqueados` — disponibilidad
- `usuarios` — espejo de `auth.users`, con `role` y `tenant_id`
- `productos` / `ventas` / `venta_items` / `cajas` — catálogo, stock y POS (ver sección "Productos y stock")

**Aislamiento entre tenants:** todas las tablas de negocio tienen `tenant_id` y RLS habilitada. Las policies usan `es_staff(tenant_id)` (función `security definer` en Postgres) para que el filtrado ocurra en la base, no en el cliente. Nunca se accede a Supabase con la `service_role` key desde código que sirve datos al usuario — solo en webhooks/crons, y ahí el filtro por tenant se hace a mano en el propio route.

---

## Decisiones tomadas

### Seguridad

**`role: "usuario"` por defecto, sin auto-admin** (`supabase/schema.sql`, trigger `handle_new_user`)
- Todo usuario nuevo se crea en `public.usuarios` con `role: "usuario"` (cliente común).
- El acceso admin (`veterinario`/`empleado`/`superadmin`) se asigna manualmente en Supabase o vía invitación (ver "Sistema de roles").

**`calendarId` obligatorio por env var** (`app/api/calendar/create-event/route.ts`)
- Eliminado el fallback hardcodeado `"veterinariapriscilas@gmail.com"`.
- Requiere `GOOGLE_CALENDAR_CALENDAR_ID` o `CALENDAR_ID` en `.env.local`.
- Si falta, el endpoint responde 503 con mensaje claro.

### Manejo de errores en `lib/supabase/`

**Nunca descartar el `error` de una respuesta de Supabase.** `lib/supabase/assert.ts`
expone `throwIfSupabaseError(error, contexto)`: loguea `message`/`details`/`hint`/`code`
y relanza. Se usa en vez de `const { data } = await supabase...`, que dejaba `data` en
`null`/`[]` cuando la query fallaba (RLS, FK ambiguo, columna renombrada) sin que el
componente que llama tuviera forma de distinguir "sin resultados" de "la query explotó".

Se detectó porque la libreta sanitaria dejaba de mostrar el detalle de un cliente sin
ningún error visible: la migración de co-dueños de mascotas (`022_mascota_coduenos.sql`)
agregó una segunda relación entre `clientes` y `mascotas` (vía `mascota_duenos`), así que
el embed `mascotas(*)` en `getClienteCompleto` quedó ambiguo para PostgREST (`PGRST201`)
y el error se perdía en silencio. Ahora ese `select` usa `mascotas!mascotas_cliente_id_fkey(*)`
para forzar el FK correcto (solo el dueño principal, mismo comportamiento que antes de
que existiera co-dueños).

Al agregar un `select` con relación embebida (`tabla(...)`) entre `clientes` y `mascotas`,
especificar siempre el FK (`mascotas!mascotas_cliente_id_fkey(*)`) para evitar que
PostgREST la vuelva a marcar ambigua.

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
- **Todo el trabajo es local.** No usar git worktrees ni mencionar "working tree". El repo se trabaja directo sobre la carpeta del proyecto, sin crear branches/worktrees paralelos para las tareas. Los cambios se prueban con `npm run dev` en localhost.

---

## Convenciones del proyecto

- Español en UI, nombres de variables y comentarios.
- Interfaces de datos en `lib/supabase/types.ts` (fuente de verdad de tipos) + `lib/supabase/queries.ts`. Columnas en Postgres van en snake_case; esa capa las mapea a camelCase para los componentes.
- Hooks de dominio en `hooks/turnos/` — no mezclar lógica de fetch con componentes.
- Evitar `any` en interfaces nuevas. Los timestamps son `timestamptz` de Postgres, mapeados a `string`/`Date` en la capa de queries.
- `images: { unoptimized: true }` se mantiene intencionalmente (compatibilidad con Vercel + Supabase Storage).

---

## Estructura de rutas

| Ruta | Descripción | Acceso |
|------|-------------|--------|
| `/` | SaaS landing — VetPanel | Público |
| `/[slug]` | Página pública de cada veterinaria | Público |
| `/[slug]/turno` | Reserva de turno para ese tenant | Público |
| `/[slug]/productos` | Catálogo público de productos | Público |
| `/[slug]/libreta/[token]` | Libreta sanitaria pública (QR de la mascota) | Público (el token es el secreto) |
| `/[slug]/cliente` | Área del cliente (sus turnos, sus mascotas) | Autenticado, dueño del email |
| `/[slug]/mi-historia`, `/[slug]/mi-historia/[mascotaId]` | Historia clínica vista por el cliente | ídem |
| `/[slug]/onboarding` | Wizard post-registro (templates de servicios/horarios) | `tenantId === slug` o `superadmin` |
| `/[slug]/admin` | Dashboard del veterinario | `tenantId === slug` o `superadmin` |
| `/[slug]/admin/Turnos` | Gestión de turnos | ídem |
| `/[slug]/admin/Libreta` | Libreta sanitaria / historial | ídem |
| `/[slug]/admin/Clientes` | Listado de clientes | ídem |
| `/[slug]/admin/Productos` | Productos y stock | ídem + plan Plus |
| `/[slug]/admin/Vender` | Punto de venta (mostrador/POS) | ídem + plan Pro |
| `/[slug]/admin/Ventas` | Dashboard de ventas y remitos | ídem + plan Pro |
| `/[slug]/admin/Caja` | Apertura, arqueo y cierre de caja | ídem + plan Pro |
| `/[slug]/admin/CuentaCorriente` | Cuentas corrientes de clientes | ídem + plan Pro |
| `/[slug]/admin/PromosSorteos` | Ofertas, promos y sorteos | ídem |
| `/[slug]/admin/Configuracion` | Config del tenant | ídem |
| `/mis-turnos` | Turnos del cliente | Autenticado |
| `/login` | Google OAuth (Supabase Auth) | Público |
| `/registro` | Registro | Público |
| `/pricing` | Planes y precios | Público |
| `/blog`, `/blog/[slug]` | Blog SEO (file-based, `content/blog/*.md`) | Público |
| `/superadmin` | Panel global | solo `superadmin` |

**Navbar:** componente inteligente en `components/navbar.tsx`:
- `/` → `SaasNavbar` (dark, logo VetPanel, CTA Contratar)
- `/superadmin/*` → `SuperAdminNavbar`
- Resto → `VetNavbar` (logo de la veterinaria actual)

---

## Sistema de roles

Definido en `lib/supabase/types.ts` / `lib/supabase/queries.ts` (enum `user_role` en Postgres):
```typescript
type UserRole = "superadmin" | "veterinario" | "empleado" | "usuario"
```

| Rol | Acceso | Cómo asignar |
|-----|--------|--------------|
| `superadmin` | `/superadmin` + todo | Manual en Supabase: `usuarios.role = 'superadmin'` |
| `veterinario` | Panel completo del tenant, incluida configuración y facturación | Manual en Supabase, o invitación desde el panel |
| `empleado` | Panel operativo (turnos, libreta, clientes, mostrador/POS, ventas, caja, cuenta corriente, promos) — sin configuración ni equipo | Invitación desde `/[slug]/admin/Configuracion` → Equipo |
| `usuario` | Reservar turnos, ver su libreta/turnos | Default al registrarse (trigger `handle_new_user`) |

Los permisos por sección están centralizados en `lib/auth/permissions.ts` (`canAccessSection`, `canManageTeam`) — no repetir ese chequeo ad hoc en componentes.

**`tenant_id` en `usuarios`:** indica a qué veterinaria pertenece el staff. `VetAdminLayout` verifica `usuarios.tenant_id === slug` (vía `es_staff`, ver `SaaS.md`) antes de dar acceso. El `tenantId` siempre se resuelve desde la URL (`useSlug()`) — no hay fallback hardcodeado. RLS en Postgres es la garantía real; la verificación en el layout es una segunda capa de UX, no la única defensa.

**Para dar acceso a un veterinario/empleado:**
1. El usuario debe iniciar sesión una vez (el trigger `handle_new_user` crea su fila en `usuarios`).
2. Se invita desde `/[slug]/admin/Configuracion` → Equipo (tabla `invitaciones`, auto-aceptación al loguear), o se edita manualmente `usuarios.role` y `usuarios.tenant_id` en Supabase.

**Para dar acceso superadmin:**
1. El usuario debe iniciar sesión una vez.
2. En Supabase → tabla `usuarios` → editar `role = 'superadmin'`.

**`ProtectedRoute`** acepta `requiredRole`:
```tsx
<ProtectedRoute requiredRole="superadmin">{children}</ProtectedRoute>
```

---

## Multi-tenant y aislamiento de datos

El proyecto **ya es multi-tenant en producción** sobre Supabase/Postgres: cada
tenant (veterinaria) es una fila en `tenants` (PK `slug`), toda tabla de
negocio lleva `tenant_id`, y Row Level Security filtra en la base de datos —
no en el cliente. Ver **`SaaS.md`** para el detalle completo de cómo funciona
el aislamiento, qué garantías da RLS, y qué checklist seguir al agregar una
tabla o un tenant nuevo (incluye el caso de sumar un negocio de otro rubro,
como una distribuidora, al mismo sistema).

No se usan subdominios por tenant — el aislamiento es por fila (`tenant_id` +
RLS) y por ruta (`/[slug]/...`), no por infraestructura separada.
