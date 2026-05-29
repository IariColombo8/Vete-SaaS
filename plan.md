# Plan de Mejoras — VetPanel SaaS Multi-Tenant

> Documento vivo. Se actualiza a medida que se completan tareas.

---

## Estado general

| Fase | Estado | Progreso |
|------|--------|----------|
| 1. Fundamentos de Producción | COMPLETADO | 10/10 |
| 2. Features SaaS Core | COMPLETADO | 8/8 |
| 3. Producto Completo | EN CURSO | 7/8 |
| 4. Infraestructura y DevOps | EN CURSO | 4/11 |
| 5. Growth y Comercialización | PENDIENTE | 0/6 |

---

## Fase 1 — Fundamentos de Producción

### 1.1 Seguridad: cerrar brechas de aislamiento

- [x] **1.1.1** Firestore Rules: restringir `usuarios/{docId}` update — usuario solo puede editar campos seguros (`displayName`, `photoURL`, `lastLogin`). `role` y `tenantId` solo superadmin. Incluye auto-registro veterinario seguro.
- [x] **1.1.2** Firestore Rules: `config/{configDoc}` lectura pública para que la página pública y el booking form funcionen
- [x] **1.1.3** Firestore Rules: validar datos en `allow create` de turnos — campos obligatorios (`cliente`, `mascota`, `turno`, `estado`), estado debe ser `pendiente`
- [x] **1.1.4** Proteger cancelación de turnos: Firestore Rules validan email match + estado pendiente + solo cambia campo `estado`. Hook `useMisTurnosCliente` refactoreado para usar auth email en vez de DNI. Nueva función `getTurnosByClienteEmail`.

### 1.2 Rendimiento: queries que no escalan

- [x] **1.2.1** `useDisponibilidadTurnos` refactoreado: nueva función `getTurnosByDateRange` filtra por mes actual + siguiente, solo pendientes. Tipado `any[]` → `Turno[]` en hook y consumers. Tipado `getDiasBloqueados` → `DiaBloqueado[]`.
- [x] **1.2.2** `onSnapshot` real-time: nuevas funciones `subscribeTurnos` y `subscribeDiasBloqueados` en `firestore.ts`. `useTurnosManagement` y `DashboardCharts` ahora se actualizan en vivo (sin refetch manual tras mutaciones). Corregido bug de deps `[]` en dashboard.
- [x] **1.2.3** Paginación cursor-based en clientes: `getClientesPaginated` (orderBy nombre, `startAfter`, `limit`) + tipo `ClientesCursor`/`ClientesPage`. UI con botón "Cargar más" (page size 20) y aviso de alcance de búsqueda. Turnos admin usan suscripción real-time (1.2.2) en vez de paginación dado el volumen single-tenant actual.
- [x] **1.2.4** `firestore.indexes.json` creado y registrado en `firebase.json`. Índice compuesto `turnos (estado ASC, turno.fecha ASC)` para `getTurnosByDateRange`. El resto de queries son single-field (índices automáticos).

### 1.3 Auth: hardening

- [x] **1.3.1** Eliminado `DEFAULT_TENANT_ID` y `lib/config.ts`. Todos los hooks ahora requieren `tenantId` explícito (viene del slug via `useSlug()`). Sin fallbacks silenciosos.
- [x] **1.3.2** Creado `lib/auth/resolveUserDashboard.ts`. Lógica de redirect centralizada, reemplazada en `login/page.tsx`, `registro/page.tsx`, `hero-cta.tsx` y `navbar.tsx`.

---

## Fase 2 — Features SaaS Core

### 2.1 Planes y billing

- [x] **2.1.1** Catálogo de planes con feature flags y límites en `lib/plans.ts` (fuente única en código; evita lectura extra por chequeo). Límite de turnos por plan ya no hardcodeado.
- [x] **2.1.2** Feature-gating: `canUseFeature(tenantId, feature)` (async) + `planAllows(plan, feature)` (síncrono). Usado por WhatsApp y dashboard.
- [x] **2.1.3** Billing recurrente con Mercado Pago (suscripciones/preapproval): `lib/billing/mercadopago.ts`, `/api/billing/checkout` (verifica dueño vía ID token), `/api/billing/webhook` (actualiza plan vía Admin SDK), botón "Mejorar plan" en dashboard. Env-gated (`MP_ACCESS_TOKEN`).
- [x] **2.1.4** Página `/pricing` con tarjetas (componente `PricingCards` reutilizado en landing), comparativa de features y FAQ.

### 2.2 Notificaciones

- [x] **2.2.1** EmailJS → API route server-side `/api/email/send` con Resend (REST, sin SDK). Dep `@emailjs/browser` removida. Env-gated (`RESEND_API_KEY`, `EMAIL_FROM`).
- [x] **2.2.2** WhatsApp Cloud API (Meta): `lib/notifications/whatsapp.ts` (texto + plantillas), `/api/whatsapp/notify` (confirmación gated por plan), `/api/cron/recordatorios` (24h antes, protegido por `CRON_SECRET`), cron diario en `vercel.json`.

### 2.3 Multi-usuario por tenant

- [x] **2.3.1** Rol `empleado` con permisos granulares (`lib/auth/permissions.ts`) + invitaciones por email (colección `invitaciones`, auto-aceptación server-side vía Admin SDK al loguear, UI en config → Equipo). Reglas Firestore: empleado opera turnos/clientes/días pero no config.

### 2.4 Página pública mejorada

- [x] **2.4.1** SEO dinámico: `generateMetadata` en `/[slug]` (split server/client: `page.tsx` server + `vet-public-view.tsx` client) con título, descripción y Open Graph por tenant.

---

## Fase 3 — Producto Completo

### 3.1 Libreta sanitaria digital

- [x] **3.1.1** PDF exportable de libreta sanitaria: `lib/pdf/libreta-pdf.ts` (jsPDF) genera datos de mascota + dueño + historial cronológico. Botón de descarga en la cabecera de cada mascota en `libreta-sanitaria-management`.
- [x] **3.1.2** QR por mascota con libreta pública: token aleatorio (`libretaToken`) + snapshot curado en `veterinarias/{slug}/libretasPublicas/{token}` (lectura pública, sin datos del dueño). Ruta `/[slug]/libreta/[token]`, botón QR en libreta-management (gated por feature `qrMascota` del plan Pro). Reglas + sin exponer subárbol de clientes.
- [ ] **3.1.3** Recordatorios automáticos de vacunas (requiere modelo de calendario de vacunas por mascota; reutilizará cron de `vercel.json`)
- [x] **3.1.4** Visualización de fotos en historial clínico — ya implementado: `LibretaDetallesModal` muestra adjuntos de imagen como miniaturas con enlace; upload en `libreta-sanitaria-management`.

### 3.2 Dashboard analytics

- [x] **3.2.1** Dashboard analytics: tendencia, horarios pico, estados (ya existían) + servicios top y tasa de cancelación (agregados en `dashboard-charts.tsx`).

### 3.3 Agenda avanzada

- [x] **3.3.1** Múltiples profesionales con agendas independientes: `Profesional` en `TurnoConfig.profesionales`, selector en booking (`ServicioSection`), disponibilidad filtrada por profesional, persistido en turno (`profesionalId`/`profesionalNombre`), visible en admin. Backward-compatible (sin profesionales = agenda única).
- [x] **3.3.2** Duración variable por servicio: `ServicioTurnoConfig.duracionMin`, helper puro `computeAvailableSlots` (consciente de duración, con tests), persistido en turno (`duracionMin`), config UI con campo de duración, mostrado en booking y admin.
- [x] **3.3.3** Confirmación por parte del vet: estado `confirmado` añadido (pendiente → confirmado → completado). Disponibilidad considera ambos estados como ocupados.

---

## Fase 4 — Infraestructura y DevOps

### 4.1 Testing

- [x] **4.1.1** Setup Vitest + jsdom + Testing Library. `vitest.config.ts`, `vitest.setup.ts`, scripts `test`/`test:watch`/`test:coverage`/`typecheck`.
- [x] **4.1.2** Tests unitarios: `diaToWeekdays`, `generateTimeSlots`, `generateTimeSlotsConSiesta`, `getHorarioForDay` (extraídos a `lib/turnos/horarios.ts`) y catálogo de planes (`planAllows`, `getPlanLimits`, `normalizePlan`). 19 tests verdes.
- [ ] **4.1.3** Tests E2E con Playwright: booking completo, onboarding vet, login + redirect

### 4.2 CI/CD

- [x] **4.2.1** GitHub Actions (`.github/workflows/ci.yml`): typecheck → test → build en push/PR a main. (Lint omitido: ESLint no está instalado en el proyecto.)
- [ ] **4.2.2** Firestore Rules tests con `@firebase/rules-unit-testing` (requiere emulador Firebase)

### 4.3 Monitoring

- [ ] **4.3.1** Sentry para error tracking
- [ ] **4.3.2** Eventos custom en Vercel Analytics

### 4.4 Refactoring

- [x] **4.4.1** Package name renombrado a `"vetpanel"`.
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
| 2026-05-27 | 1.1.1 Firestore Rules: restringir update usuarios | Completado |
| 2026-05-27 | 1.1.2 Config lectura pública | Completado |
| 2026-05-27 | 1.1.3 Validación create turnos | Completado |
| 2026-05-27 | 1.1.4 Proteger cancelación (auth email) | Completado |
| 2026-05-27 | 1.3.1 Eliminar DEFAULT_TENANT_ID | Completado |
| 2026-05-27 | 1.3.2 Extraer resolveUserDashboard | Completado |
| 2026-05-28 | 1.2.1 useDisponibilidadTurnos: filtro por rango | Completado |
| 2026-05-29 | 1.2.4 firestore.indexes.json + índice compuesto turnos | Completado |
| 2026-05-29 | 1.2.2 onSnapshot real-time turnos admin + dashboard | Completado |
| 2026-05-29 | 1.2.3 Paginación cursor-based clientes | Completado |
| 2026-05-29 | 2.1.1/2.1.2 Catálogo de planes + feature-gating | Completado |
| 2026-05-29 | 2.1.4 Página /pricing + componente compartido | Completado |
| 2026-05-29 | 2.4.1 SEO dinámico por tenant | Completado |
| 2026-05-29 | 2.2.1 Email server-side (Resend) | Completado |
| 2026-05-29 | 2.2.2 WhatsApp (Cloud API) + cron recordatorios | Completado |
| 2026-05-29 | 2.3.1 Rol empleado + invitaciones | Completado |
| 2026-05-29 | 2.1.3 Billing Mercado Pago | Completado |
| 2026-05-29 | 3.3.3 Estado confirmado en turnos | Completado |
| 2026-05-29 | 3.2.1 Analytics: servicios top + tasa cancelación | Completado |
| 2026-05-29 | 3.1.4 Fotos en historial (ya existía) | Completado |
| 2026-05-29 | 3.1.1 PDF de libreta sanitaria (jsPDF) | Completado |
| 2026-05-29 | 4.1.1/4.1.2 Vitest + tests unitarios (19) | Completado |
| 2026-05-29 | 4.2.1 GitHub Actions CI | Completado |
| 2026-05-29 | 4.4.1 Rename package a vetpanel | Completado |
| 2026-05-29 | 3.1.2 QR + libreta pública con token | Completado |
| 2026-05-29 | 3.3.1/3.3.2 Agenda avanzada (profesionales + duración) | Completado |
