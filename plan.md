# Plan de Mejoras — VetPanel SaaS Multi-Tenant

> Documento vivo. Se actualiza a medida que se completan tareas.

---

## Estado general

| Fase | Estado | Progreso |
|------|--------|----------|
| 1. Fundamentos de Producción | EN CURSO | 6/10 |
| 2. Features SaaS Core | PENDIENTE | 0/8 |
| 3. Producto Completo | PENDIENTE | 0/8 |
| 4. Infraestructura y DevOps | PENDIENTE | 0/8 |
| 5. Growth y Comercialización | PENDIENTE | 0/6 |

---

## Fase 1 — Fundamentos de Producción

### 1.1 Seguridad: cerrar brechas de aislamiento

- [x] **1.1.1** Firestore Rules: restringir `usuarios/{docId}` update — usuario solo puede editar campos seguros (`displayName`, `photoURL`, `lastLogin`). `role` y `tenantId` solo superadmin. Incluye auto-registro veterinario seguro.
- [x] **1.1.2** Firestore Rules: `config/{configDoc}` lectura pública para que la página pública y el booking form funcionen
- [x] **1.1.3** Firestore Rules: validar datos en `allow create` de turnos — campos obligatorios (`cliente`, `mascota`, `turno`, `estado`), estado debe ser `pendiente`
- [x] **1.1.4** Proteger cancelación de turnos: Firestore Rules validan email match + estado pendiente + solo cambia campo `estado`. Hook `useMisTurnosCliente` refactoreado para usar auth email en vez de DNI. Nueva función `getTurnosByClienteEmail`.

### 1.2 Rendimiento: queries que no escalan

- [ ] **1.2.1** `useDisponibilidadTurnos`: filtrar turnos por rango de fechas en vez de full collection scan
- [ ] **1.2.2** Implementar `onSnapshot` real-time en turnos del admin y dashboard
- [ ] **1.2.3** Paginación cursor-based en listados de clientes y turnos admin
- [ ] **1.2.4** Crear `firestore.indexes.json` con índices compuestos necesarios

### 1.3 Auth: hardening

- [x] **1.3.1** Eliminado `DEFAULT_TENANT_ID` y `lib/config.ts`. Todos los hooks ahora requieren `tenantId` explícito (viene del slug via `useSlug()`). Sin fallbacks silenciosos.
- [x] **1.3.2** Creado `lib/auth/resolveUserDashboard.ts`. Lógica de redirect centralizada, reemplazada en `login/page.tsx`, `registro/page.tsx`, `hero-cta.tsx` y `navbar.tsx`.

---

## Fase 2 — Features SaaS Core

### 2.1 Planes y billing

- [ ] **2.1.1** Colección `planes` con feature flags por plan
- [ ] **2.1.2** Middleware de feature-gating: `canUseFeature(tenantId, feature)`
- [ ] **2.1.3** Integración Mercado Pago / Stripe para billing recurrente
- [ ] **2.1.4** Página `/pricing` en el landing

### 2.2 Notificaciones

- [ ] **2.2.1** Migrar EmailJS (client-side) a API route server-side (Resend/SendGrid)
- [ ] **2.2.2** Integración WhatsApp (recordatorio 24h antes, confirmación de reserva)

### 2.3 Multi-usuario por tenant

- [ ] **2.3.1** Rol `empleado` con permisos granulares + invitación por email

### 2.4 Página pública mejorada

- [ ] **2.4.1** SEO dinámico: `generateMetadata` con datos del tenant + Open Graph

---

## Fase 3 — Producto Completo

### 3.1 Libreta sanitaria digital

- [ ] **3.1.1** PDF exportable de libreta sanitaria
- [ ] **3.1.2** QR code por mascota con enlace público a su libreta
- [ ] **3.1.3** Recordatorios automáticos de vacunas
- [ ] **3.1.4** Visualización de fotos en historial clínico

### 3.2 Dashboard analytics

- [ ] **3.2.1** Gráficos de tendencia, tasa cancelación, servicios top, horarios pico

### 3.3 Agenda avanzada

- [ ] **3.3.1** Múltiples profesionales por veterinaria con agendas independientes
- [ ] **3.3.2** Duración variable por servicio (hoy todo es 1h)
- [ ] **3.3.3** Confirmación por parte del vet (pendiente -> confirmado -> completado)

---

## Fase 4 — Infraestructura y DevOps

### 4.1 Testing

- [ ] **4.1.1** Setup Vitest + React Testing Library
- [ ] **4.1.2** Tests unitarios: `generateTimeSlots`, `diaToWeekdays`, `toId`, funciones de firestore
- [ ] **4.1.3** Tests E2E con Playwright: booking completo, onboarding vet, login + redirect

### 4.2 CI/CD

- [ ] **4.2.1** GitHub Actions: lint -> typecheck -> test -> build en cada PR
- [ ] **4.2.2** Firestore Rules tests con `@firebase/rules-unit-testing`

### 4.3 Monitoring

- [ ] **4.3.1** Sentry para error tracking
- [ ] **4.3.2** Eventos custom en Vercel Analytics

### 4.4 Refactoring

- [ ] **4.4.1** Renombrar package name a `"vetpanel"`
- [ ] **4.4.2** Eliminar rutas legacy (`/admin`, `/app/turno/page.tsx`, `/v/[slug]`)
- [ ] **4.4.3** Tipar los `any` restantes en hooks
- [ ] **4.4.4** Extraer `firestore.ts` en módulos: `turnos.ts`, `clientes.ts`, `tenants.ts`

---

## Fase 5 — Growth y Comercialización

### 5.1 Onboarding

- [ ] **5.1.1** Wizard post-registro con templates pre-configurados
- [ ] **5.1.2** Tour interactivo del panel admin

### 5.2 Landing SaaS

- [ ] **5.2.1** Pricing section con planes
- [ ] **5.2.2** Demo interactiva (tenant de ejemplo)
- [ ] **5.2.3** Blog/SEO para tráfico orgánico

### 5.3 Integraciones

- [ ] **5.3.1** WhatsApp Business API
- [ ] **5.3.2** Mercado Pago (pagos online)
- [ ] **5.3.3** Export contable (formatos locales)

---

## Registro de avance

| Fecha | Tarea | Estado |
|-------|-------|--------|
| 2026-05-27 | Plan creado | Completado |
