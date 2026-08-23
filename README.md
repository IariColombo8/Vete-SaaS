# VetPanel

SaaS multi-tenant de gestión para veterinarias: turnos online, libreta sanitaria
digital, clientes, agenda multi-profesional, notificaciones y panel de métricas.

- **Framework:** Next.js 16 (App Router) · React 19
- **UI:** shadcn/ui + Tailwind v4
- **Backend:** Firebase (Firestore, Auth, Storage) + Firebase Admin SDK (server)
- **Pagos:** Mercado Pago (suscripciones) · **Email:** Resend · **WhatsApp:** Meta Cloud API
- **Deploy:** Vercel

---

## 1. Desarrollo local

```bash
npm install
cp .env.example .env.local      # completar con tus credenciales (ver sección 3)
npm run dev                     # http://localhost:3000
```

Comandos útiles:

```bash
npm run build       # build de producción
npm run typecheck   # tsc --noEmit
npm test            # tests unitarios (Vitest)
```

Testing E2E y de reglas: ver [`TESTING.md`](./TESTING.md).

---

## 2. Qué necesitás para producción (resumen)

VetPanel funciona "a medias" sin credenciales: el sitio carga y se pueden crear
turnos, pero **email, WhatsApp, pagos, invitaciones y recordatorios quedan inertes
hasta cargar las variables de entorno**. La puesta en producción consiste en:

1. Crear el proyecto en **Firebase** (Firestore + Auth + Storage).
2. Cargar las **variables de entorno** en Vercel (sección 3).
3. Desplegar **reglas e índices** de Firestore (sección 4).
4. Configurar los **servicios externos** que quieras usar (sección 5).
5. **Deploy en Vercel** y checklist post-deploy (secciones 6–7).

> Cada integración es opcional e independiente. Podés salir a producción solo con
> Firebase y agregar email/WhatsApp/pagos después.

---

## 3. Variables de entorno

Todas están listadas en [`.env.example`](./.env.example). En Vercel se cargan en
**Project → Settings → Environment Variables**. Agrupadas por función:

### Firebase (cliente) — **obligatorias**
Las saca de Firebase Console → Project Settings → "Tus apps" → SDK config.

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
NEXT_PUBLIC_APP_URL          # URL pública del sitio, ej. https://vetpanel.app
```

### Firebase Admin (servidor) — **necesaria para invitaciones, billing y recordatorios**
Service account: Firebase Console → Project Settings → Service accounts → "Generate
new private key". Pegá el JSON completo en una sola variable:

```
FIREBASE_SERVICE_ACCOUNT_KEY   # el JSON del service account, en una línea
```

(O alternativamente el trío `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` /
`FIREBASE_PRIVATE_KEY`.)

### Email transaccional (Resend) — confirmaciones de turno
```
RESEND_API_KEY     # API key de https://resend.com
EMAIL_FROM         # remitente verificado, ej. "VetPanel <turnos@tudominio.com>"
```

### WhatsApp (Meta Cloud API) — confirmaciones y recordatorios
```
WHATSAPP_TOKEN               # token permanente del System User
WHATSAPP_PHONE_NUMBER_ID     # ID del número emisor
WHATSAPP_API_VERSION=v21.0
WHATSAPP_TEMPLATE_LANG=es_AR
WHATSAPP_CONFIRMACION_TEMPLATE=confirmacion_turno
WHATSAPP_REMINDER_TEMPLATE=recordatorio_turno
WHATSAPP_VACUNA_TEMPLATE=recordatorio_vacuna
RECORDATORIO_VACUNA_DIAS=7
```

### Mercado Pago (suscripciones)
```
MP_ACCESS_TOKEN              # access token de tu cuenta de Mercado Pago
```

### Cron (recordatorios diarios)
```
CRON_SECRET                  # secreto que Vercel Cron envía como Bearer token
```

### Google Calendar (opcional, eventos de turno)
Service account con la Calendar API habilitada y el calendario compartido con ese email:
```
GOOGLE_CALENDAR_CLIENT_EMAIL
GOOGLE_CALENDAR_PRIVATE_KEY
GOOGLE_CALENDAR_CALENDAR_ID
```

### Sentry (opcional, monitoreo de errores)
```
NEXT_PUBLIC_SENTRY_DSN
SENTRY_DSN
SENTRY_TRACES_SAMPLE_RATE=0.1
```

---

## 4. Firebase: reglas e índices

Instalá la CLI y desplegá las reglas de seguridad y los índices compuestos
(necesarios para varias queries — si faltan, esas consultas fallan):

```bash
npm i -g firebase-tools
firebase login
firebase use <tu-project-id>
firebase deploy --only firestore        # reglas + índices
firebase deploy --only storage          # reglas de Storage
```

Archivos involucrados: `firestore.rules`, `firestore.indexes.json`, `storage.rules`,
`firebase.json`.

### CORS de Storage (obligatorio para subir logo y fotos)

Sin esto, cualquier `uploadBytes` desde el navegador falla con
`blocked by CORS policy: Response to preflight request doesn't pass access control check`.
Las reglas de Storage **no** arreglan esto: es configuración del bucket de GCS.

La forma más rápida es [Google Cloud Shell](https://console.cloud.google.com/)
(ya trae `gcloud`/`gsutil`, no hay que instalar nada). Subí `cors.json` y ejecutá:

```bash
gcloud storage buckets update gs://<tu-bucket> --cors-file=cors.json

# alternativa con gsutil
gsutil cors set cors.json gs://<tu-bucket>

# verificar
gcloud storage buckets describe gs://<tu-bucket> --format="default(cors_config)"
```

`<tu-bucket>` es el valor de `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
(ej. `veterinaria-prueba-001.firebasestorage.app`), sin el prefijo `gs://` duplicado.

Notas sobre `cors.json`:

- GCS **no acepta wildcards** en `origin` (`https://*.vercel.app` se ignora).
  Hay que listar cada dominio exacto — reemplazá el placeholder por tu dominio real.
- Incluí el puerto exacto del dev server. `http://localhost:3000` y
  `http://localhost:3001` son orígenes distintos para el navegador.

### Auth
En Firebase Console → Authentication → habilitar **Google** como proveedor y agregar
el dominio de producción a "Authorized domains".

---

## 5. Configurar los servicios externos

| Servicio | Para qué | Pasos |
|----------|----------|-------|
| **Resend** | Email de confirmación de turno | Crear cuenta, verificar dominio, generar API key → `RESEND_API_KEY` + `EMAIL_FROM`. |
| **WhatsApp Cloud API** | Confirmaciones y recordatorios | App en Meta for Developers, número y token permanente. Crear y aprobar las **plantillas** (`confirmacion_turno`, `recordatorio_turno`, `recordatorio_vacuna`). Los mensajes proactivos requieren plantillas aprobadas. |
| **Mercado Pago** | Suscripciones de plan | Access token de producción. Configurar el **webhook** apuntando a `https://tudominio/api/billing/webhook`. |
| **Google Calendar** | Volcar turnos al calendario | Service account + Calendar API + compartir el calendario con el `client_email`. |
| **Sentry** | Errores en producción | Crear proyecto, copiar el DSN. |

---

## 6. Deploy en Vercel

```bash
# opción CLI
npm i -g vercel
vercel link
vercel --prod
```

O conectando el repo de GitHub en el dashboard de Vercel (deploy automático en cada
push a `main`; el workflow `.github/workflows/ci.yml` corre typecheck + tests + build).

**Cron:** `vercel.json` ya define el cron diario de recordatorios
(`/api/cron/recordatorios`, 12:00 UTC). Vercel lo activa solo al detectar el archivo;
asegurate de tener `CRON_SECRET` cargado (Vercel lo envía como `Authorization: Bearer`).

---

## 7. Checklist post-deploy

- [ ] Variables de entorno cargadas en Vercel (sección 3).
- [ ] `firebase deploy --only firestore,storage` ejecutado.
- [ ] Google Auth habilitado + dominio autorizado en Firebase.
- [ ] **Crear el primer superadmin:** iniciá sesión una vez, luego en Firestore
      editá `usuarios/{tu-uid}` → `role: "superadmin"`.
- [ ] (Opcional) Sembrar la veterinaria demo: `npm run seed:demo` (necesita las
      credenciales de Firebase Admin en `.env.local`). Queda disponible en `/demo`.
- [ ] Plantillas de WhatsApp aprobadas en Meta (si usás WhatsApp).
- [ ] Webhook de Mercado Pago configurado (si usás pagos).
- [ ] Probar el flujo completo: registro → onboarding → reservar un turno de prueba.

---

## 8. Cómo funciona el modelo multi-tenant

- Cada veterinaria es un **tenant** identificado por su `slug` (ej. `/mi-clinica`).
- Datos en `veterinarias/{slug}/...` (config, turnos, clientes, etc.).
- **Roles** (`usuarios/{uid}.role`): `superadmin`, `veterinario` (dueño del tenant),
  `empleado` (acceso operativo sin configuración) y `usuario` (cliente).
- Los empleados se suman por **invitación** (config → Equipo); aceptan al iniciar sesión.

Más detalle de arquitectura en [`CLAUDE.md`](./CLAUDE.md) y el detalle de cada feature
implementada en [`plan.md`](./plan.md).

---

## 9. Estructura rápida

```
app/                       páginas (App Router)
app/[slug]/                página pública + panel admin del tenant
app/api/                   rutas server (email, whatsapp, billing, cron, invitaciones, calendar)
components/                UI (admin, turnos, pricing, billing, blog…)
lib/firebase/              capa de datos (firestore barrel + types, collections, dominios)
lib/plans.ts               catálogo de planes y feature-gating
lib/notifications/ lib/billing/ lib/email/ lib/pdf/ lib/export/ lib/onboarding/
content/blog/              posts del blog (.md)
firestore.rules · firestore.indexes.json · vercel.json
```
