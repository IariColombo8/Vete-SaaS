# Demo gratis con trial Pro de 10 días

## Contexto

Hoy cualquiera puede registrarse en `/registro` y crea un tenant en plan
`basico` completamente vacío. La idea es que, al registrarse, el usuario
reciba automáticamente:

- El plan **Pro** activo por **10 días**.
- Datos de ejemplo precargados (turnos, productos, ventas) — como se hizo
  manualmente para "Mundo Animal" — para que el panel no se vea vacío y
  pueda evaluar todas las funciones (POS, caja, productos, etc.) desde el
  primer minuto.
- Al vencer el trial, el panel pasa a **solo lectura** con un aviso para
  contactar a ServiTec y reactivar el plan.

## 1. Modelo de datos y expiración del trial

- Nueva columna `trial_expires_at timestamptz null` en `tenants`.
- `createTenant()` (usada por `/registro`) pasa a crear el tenant con
  `plan: "pro"` y `trial_expires_at = now() + interval '10 days'` en vez de
  `plan: "basico"`.
- `lib/plans.ts` gana:

  ```ts
  interface TrialStatus {
    enTrial: boolean       // el tenant tiene trial_expires_at seteado
    vencido: boolean       // enTrial && trial_expires_at < now()
    diasRestantes: number | null
  }

  function getTrialStatus(config: Pick<TenantConfig, "plan" | "trialExpiresAt">): TrialStatus
  ```

  `trialExpiresAt` se agrega a `TenantConfig` / `aConfig` / `aFila` en
  `lib/supabase/tenants.ts` (columna `trial_expires_at`), igual que el resto
  de los campos.

- `/superadmin`: la tabla de veterinarias gana una columna "Trial" que
  muestra la fecha de vencimiento (o "—" si no tiene trial) y dos acciones,
  al lado del selector de plan y el botón de pausar que ya existen:
  - **Extender 10 días**: `trial_expires_at = now() + 10 días` (o
    `greatest(trial_expires_at, now()) + 10 días` si todavía no venció).
  - **Quitar trial**: `trial_expires_at = null` (el tenant queda en Pro fijo,
    sin vencimiento — es la forma de "activar" a un cliente que pagó).
  - Ambas via `updateTenantConfig`, mismo patrón que `handlePlanChange` /
    `handleTogglePause` ya usan en `app/superadmin/page.tsx`.

## 2. Bloqueo a solo-lectura al vencer

- `VetAdminLayout` (`components/vet-admin-layout.tsx`) calcula
  `getTrialStatus(config)` junto con la carga de `getTenantConfig` que ya
  hace hoy.
- Si `vencido`: se renderiza un banner fijo arriba de todo (`Tu prueba Pro
  terminó — contactate con ServiTec` + link de WhatsApp/email/contacto de
  ServiTec) y se envuelve `children` en un `ReadOnlyContext.Provider` con
  `readOnly = true`. Si no venció, `readOnly = false`.
- Nuevo hook `useReadOnly()` (consume `ReadOnlyContext`, default `false`
  fuera del layout) que los puntos de mutación consultan para
  deshabilitarse con un tooltip ("Reactivá tu cuenta para editar"):
  turnos (crear/cancelar), clientes (crear/editar), productos
  (crear/editar/ajustar stock), POS (registrar venta), caja (abrir/cerrar),
  configuración (guardar).
- El resto del panel (listados, dashboard, libreta) sigue siendo visible en
  modo lectura — no se bloquea la navegación, solo las acciones de escritura.
- **Alcance explícito**: este es un gate del lado del cliente (UI), no una
  barrera dura a nivel de base de datos/RLS. Es aceptable porque es un
  mecanismo comercial de trial, no una protección de datos sensibles de
  terceros. Reforzarlo a nivel de RPC queda fuera de alcance de este trabajo
  y se puede abordar más adelante si hace falta.

## 3. Datos semilla al registrarse

- Nueva migración `supabase/006_seed_demo.sql` con una función
  `seed_demo_data(p_tenant_id text)` que, en una transacción, inserta:
  - `turno_config` del tenant: 2-3 mascotas típicas, 3-4 servicios, 1-2
    vacunas.
  - ~5 turnos de ejemplo (mezcla de próximos y uno pasado con historia
    clínica asociada en `historiaClinica`/`historias`).
  - ~8 productos con stock (alimento, accesorios, medicamentos), al menos
    uno con oferta activa.
  - ~3 ventas ya cerradas con sus `venta_items` (para que el dashboard de
    ventas y el remito tengan contenido real para mostrar).
  - No se abre ninguna caja de demo — se deja simple.
- `createTenant()` (`lib/supabase/tenants.ts`) invoca
  `supabase.rpc("seed_demo_data", { p_tenant_id: tenantId })` inmediatamente
  después de que `crear_veterinaria` confirma éxito.
- Si `seed_demo_data` falla, **no** aborta el registro (el tenant ya existe
  y ya tiene su admin asignado): se loguea el error con `console.error` y
  el flujo de `/registro` sigue normalmente — el usuario simplemente arranca
  con el panel vacío en vez de con la demo cargada.

## Fuera de alcance

- Bloqueo de escritura reforzado a nivel de RLS/RPC.
- Pantalla de reactivación self-service (pagos) — la reactivación es manual
  vía `/superadmin`.
- Notificaciones automáticas (email/WhatsApp) antes o al vencer el trial.
