# Plan — Control de cobros de VetPanel a las veterinarias

> Estado: **diseño, esperando confirmación**. Todavía no hay código ni SQL ejecutado.
> Fecha: 2026-10-04.

## Decisiones tomadas

| Tema | Decisión |
|------|----------|
| Si no paga | **Solo aviso.** Se marca "vencido" en superadmin y aparece un cartel en el panel del veterinario. El sistema **nunca corta nada solo**: pasarla a solo lectura o pausarla es una decisión manual. |
| Mercado Pago | **Link de pago por mes** (Checkout Pro). La veterinaria paga cuando quiere; se marca pagado solo vía webhook. |
| Montos | **Precio del plan, editable por veterinaria** (precio especial / descuento). |
| Transferencia | Alias/CBU visible en el panel + **subir comprobante** → superadmin aprueba. |
| Clientes actuales | Pagan por transferencia. Se cargan a mano los meses ya pagados. |
| PagoKit | **Descartado.** No hay documentación pública confiable de su API, comisiones ni acreditación en Argentina. Mercado Pago ya está integrado y acepta tarjeta, débito y dinero en cuenta. |

La suscripción automática que ya existe (`/api/billing/checkout`, preapproval) **no se toca**:
si alguien la usa sigue funcionando igual. Queda para decidir después si se retira.

---

## Modelo de datos (`supabase/045_cobros.sql`)

### `tenants.precio_mensual numeric(12,2) null`
Precio especial. `null` = usa el precio de su plan (`lib/plans.ts`).

### Tabla `cobros` — un renglón por veterinaria y por mes

| Columna | Tipo | Nota |
|--------|------|------|
| `id` | uuid PK | |
| `tenant_id` | text → `tenants(slug)` | |
| `periodo` | date | primer día del mes. **único con `tenant_id`**: no puede haber dos cobros del mismo mes |
| `plan` | text | copia del plan al generarse (si después cambia de plan, el cobro histórico no cambia) |
| `monto` | numeric(12,2) | `> 0`. Copia congelada, igual que el precio en `venta_items` |
| `vencimiento` | date | por defecto día 10 del mes |
| `estado` | `pendiente` · `en_revision` · `pagado` · `anulado` | "vencido" **no es un estado**: es `pendiente` con `vencimiento < hoy`. Así no hace falta un cron que lo actualice |
| `medio` | `transferencia` · `mercadopago` · `efectivo` · `otro` | null hasta que paga |
| `pagado_at` | timestamptz | |
| `comprobante_path` | text | ruta en el bucket privado |
| `mp_preference_id`, `mp_payment_id` | text | `mp_payment_id` **único**: el webhook no puede acreditar dos veces el mismo pago |
| `notas` | text | ej. "pagó en 2 transferencias" |
| `aprobado_por` | uuid | quién lo marcó pagado |
| `created_at` | timestamptz | |

### Quién puede qué (RLS)

Función nueva `es_titular(t)`: superadmin, o **veterinario** del tenant. El `empleado`
**no** ve lo que se le paga a VetPanel.

| Acción | Quién | Cómo |
|-------|-------|------|
| Ver cobros | titular del tenant, superadmin | policy `select` |
| Crear / editar / anular | **solo superadmin** | policies `insert`/`update` con `es_superadmin()` |
| Generar los cobros del mes | solo superadmin | RPC `generar_cobros_mes(periodo)`: crea uno por cada veterinaria **activa** con precio > 0; `on conflict do nothing`, así apretarlo dos veces no duplica |
| Informar una transferencia | titular | RPC `informar_transferencia(cobro_id, comprobante_path)`: solo pasa de `pendiente` a `en_revision`. **No puede tocar el monto ni marcarse pagado** |
| Marcar pagado por Mercado Pago | webhook (service_role) | solo si el pago está `approved` **y el monto coincide** con el del cobro |
| Borrar | nadie | se anula, como las ventas: el historial no tiene agujeros |

### Storage: bucket **privado** `comprobantes`

El bucket actual `veterinarias` es de lectura pública: un comprobante (nombre, CBU, monto)
no puede ir ahí. Bucket nuevo, `public = false`, path `{tenant}/{cobro_id}-{timestamp}.{ext}`:
- subir: `es_titular(carpeta)`
- leer: `es_titular(carpeta)` o superadmin, con **URL firmada** de corta duración
- solo imagen o PDF, hasta 5 MB

---

## Fases

Cada fase se puede subir sola y deja algo útil.

### Fase A — Control en superadmin (lo que pediste primero)
- Migración `045_cobros.sql` (la ejecutás vos en el SQL Editor de Supabase, después de revisarla).
- `lib/supabase/cobros.ts` + `lib/cobros/estado.ts` (vencido, totales del mes; puro y testeado).
- Superadmin → sección **Cobros**:
  - selector de mes, botón **Generar cobros de {mes}** (con confirmación)
  - por veterinaria: monto, vencimiento, estado (Pagado / En revisión / Pendiente / **Vencido**), medio
  - acciones: **Marcar pagado** (medio + fecha + nota), **Ver comprobante**, **Aprobar** / **Rechazar** transferencia, **Anular**
  - indicadores: cobrado del mes, pendiente, vencidas
- Editar veterinaria: campo **Precio especial**.
- **Carga de lo ya pagado**: generás los meses anteriores y los marcás pagados por transferencia.

### Fase B — Pago por transferencia desde el panel de la veterinaria
- Configuración → pestaña **Mi suscripción** (solo veterinario):
  - estado del mes, historial de pagos
  - alias, CBU y titular con botón **Copiar**
  - **Ya transferí → subir comprobante** → queda "En revisión"
- Cartel suave en el panel si tiene un cobro vencido (solo lo ve el veterinario, no el empleado ni los clientes). **No bloquea nada.**
- Aviso para vos cuando entra un comprobante (badge en superadmin; opcional: email).

### Fase C — Pago con Mercado Pago
- `POST /api/billing/pagar` → crea una preferencia de **Checkout Pro** con el monto **leído de la base**, nunca del navegador. `external_reference = cobro:{id}`.
- Webhook: se suma el tipo `payment`; consulta el pago a la API de MP (no confía en el aviso) y marca pagado.
- **Validación de la firma `x-signature`** del webhook: hoy falta, y sin ella cualquiera podría avisarle al sistema de un pago falso.
- Botón **Pagar con Mercado Pago** en Mi suscripción.

---

## Lo que necesito de vos

1. **Alias, CBU/CVU y titular** de la cuenta donde querés recibir transferencias.
2. **Día de vencimiento** (propuesta: el 10 de cada mes).
3. Para la Fase C: una **cuenta de Mercado Pago** con credenciales de producción
   (`MP_ACCESS_TOKEN` y la clave secreta del webhook). No están en `.env.local`;
   si están en Vercel, confirmalo.
4. Desde qué mes cargar los pagos de los 2 clientes actuales.

## Riesgos y cómo se cubren

| Riesgo | Cobertura |
|-------|-----------|
| Tocar datos de los 2 clientes | La migración solo **agrega** una columna nullable y tablas nuevas; no modifica filas existentes. Ningún cobro corta acceso. |
| Doble cobro / doble acreditación | `unique(tenant_id, periodo)` y `unique(mp_payment_id)` |
| Veterinaria se marca pagada sola | Las policies no le dejan hacer update; la RPC solo la pasa a "en revisión" |
| Pago falso por webhook | Firma `x-signature` + consulta del pago a la API + monto que coincida |
| Comprobantes expuestos | Bucket privado + URLs firmadas |
| Plan Básico ($0) | No genera cobros (precio 0) salvo que le pongas precio especial |
