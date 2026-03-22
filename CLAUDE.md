# CLAUDE.md — Veterinaria SaaS

Guía de referencia para Claude Code. Refleja decisiones tomadas y el rumbo del proyecto.

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
app/                  → páginas públicas y protegidas (App Router)
components/admin/     → gestión interna (turnos, libreta, clientes)
components/turnos/    → flujo de reserva público
hooks/turnos/         → lógica de dominio separada por responsabilidad
lib/firebase/         → capa de datos (config, auth, firestore)
app/api/              → server routes (solo Google Calendar hoy)
```

**Patrón de datos en Firestore:**
- `clientes/{id}/mascotas/{id}/historias` — historial clínico cronológico
- `clientes/{id}/mascotas/{id}/historiaClinica/registro` — resumen consolidado
- `turnos` — colección raíz (datos denormalizados para lectura rápida en admin)
- `diasBloqueados` — disponibilidad
- `usuarios` — auth + roles

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
| `/v/[slug]` | Página pública de cada veterinaria | Público |
| `/turno` | Reserva de turno (actual: Priscila) | Público |
| `/mis-turnos` | Turnos del cliente | Autenticado |
| `/login` | Google OAuth | Público |
| `/admin` | Dashboard del veterinario | `veterinario` o `superadmin` |
| `/superadmin` | Panel global | solo `superadmin` |

**Navbar:** componente inteligente en `components/navbar.tsx`:
- `/` → `SaasNavbar` (dark, logo VetPanel, CTA Contratar)
- `/superadmin/*` → `SuperAdminNavbar`
- Resto → `VetNavbar` (logo Priscila, comportamiento actual)

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

**Para dar acceso superadmin:**
1. El usuario debe iniciar sesión una vez (se crea su doc en `usuarios/{uid}`)
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
