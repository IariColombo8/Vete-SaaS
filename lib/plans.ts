/**
 * Catálogo de planes y feature-gating.
 *
 * La fuente de verdad de las features por plan vive en código (no en la base):
 * los flags cambian con los deploys, no en runtime, y así evitamos una lectura
 * extra por cada chequeo de permiso. El plan de cada tenant sí vive en la base
 * (`tenants.plan`).
 *
 * Dos planes, los dos pagos: **Básico** ($50.000/mes) y **Pro** ($80.000/mes,
 * todo). No hay plan gratis: lo gratis es la **prueba de 10 días de Pro** al
 * registrarse, sin tarjeta. El plan intermedio "Plus" se eliminó al pasar a
 * suscripción autoservicio; el enum `tenant_plan` de Postgres conserva el
 * valor y `normalizePlan` lo mapea a `pro` para que el resto de la app nunca
 * lo vea.
 */

import type { TenantConfig } from "./supabase/types"

export type PlanId = "basico" | "pro"

/** Capacidades activables por plan. */
export type Feature =
  | "analytics"          // dashboard de métricas avanzadas
  | "multiUsuario"       // varios usuarios (empleados) por veterinaria
  | "whatsapp"           // notificaciones por WhatsApp
  | "pdfLibreta"         // exportar libreta sanitaria a PDF
  | "qrMascota"          // QR público por mascota
  | "recordatoriosVacunas" // recordatorios automáticos de vacunas
  | "multipleProfesionales" // agendas independientes por profesional
  | "productos"          // catálogo de mercadería y control de stock
  | "ventas"             // punto de venta, caja y remitos
  | "promosSorteos"      // ofertas, promociones y sorteos
  | "facturacionElectronica" // factura electrónica ARCA (ex AFIP) desde el mostrador
  | "mercadoPagoPoint"   // cobro con el Point del tenant desde el mostrador

export interface PlanLimits {
  /** Máximo de turnos por mes. `null` = ilimitado. */
  maxTurnosMes: number | null
  /** Máximo de usuarios (incluye al dueño). `null` = ilimitado. */
  maxUsuarios: number | null
}

export interface PlanDefinition {
  id: PlanId
  nombre: string
  /** Precio mensual en ARS. */
  precioMensual: number
  limits: PlanLimits
  features: Record<Feature, boolean>
  /** Bullets para mostrar en /pricing. */
  highlights: string[]
}

const ALL_FEATURES_OFF: Record<Feature, boolean> = {
  analytics: false,
  multiUsuario: false,
  whatsapp: false,
  pdfLibreta: false,
  qrMascota: false,
  recordatoriosVacunas: false,
  multipleProfesionales: false,
  productos: false,
  ventas: false,
  promosSorteos: false,
  facturacionElectronica: false,
  mercadoPagoPoint: false,
}

const ALL_FEATURES_ON: Record<Feature, boolean> = Object.fromEntries(
  Object.keys(ALL_FEATURES_OFF).map((k) => [k, true]),
) as Record<Feature, boolean>

export const PLANS: Record<PlanId, PlanDefinition> = {
  basico: {
    id: "basico",
    nombre: "Básico",
    precioMensual: 50000,
    limits: { maxTurnosMes: 10, maxUsuarios: 1 },
    features: { ...ALL_FEATURES_OFF },
    highlights: [
      "Hasta 10 turnos por mes",
      "Página pública de la veterinaria",
      "Gestión de turnos y clientes",
      "Libreta sanitaria e historia clínica",
      "1 usuario",
    ],
  },
  pro: {
    id: "pro",
    nombre: "Pro",
    precioMensual: 80000,
    limits: { maxTurnosMes: null, maxUsuarios: null },
    features: { ...ALL_FEATURES_ON },
    highlights: [
      "Turnos ilimitados",
      "Usuarios ilimitados",
      "Dashboard de métricas",
      "Notificaciones por WhatsApp y recordatorios de vacunas",
      "Libreta sanitaria en PDF y QR por mascota",
      "Productos, stock, mostrador, caja y remitos",
      "Cuenta corriente, gastos y promos",
      "Factura electrónica (ARCA)",
      "Cobro con Mercado Pago Point",
    ],
  },
}

/** Plan por defecto cuando el tenant no tiene plan asignado. */
export const DEFAULT_PLAN: PlanId = "basico"

/** Plan que se destaca en precios y se ofrece primero al terminar la prueba. */
export const PLAN_RECOMENDADO: PlanId = "pro"

/** Días de prueba de Pro al registrarse (sin tarjeta). */
export const TRIAL_DIAS = 10

/**
 * Normaliza un valor desconocido a un PlanId válido.
 * `plus` (plan intermedio ya eliminado) se trata como `pro`.
 */
export function normalizePlan(plan: string | undefined | null): PlanId {
  if (plan === "pro" || plan === "plus") return "pro"
  if (plan === "basico") return "basico"
  return DEFAULT_PLAN
}

export function getPlan(plan: string | undefined | null): PlanDefinition {
  return PLANS[normalizePlan(plan)]
}

/** ¿El plan (string) permite usar la feature? Versión pura/síncrona. */
export function planAllows(plan: string | undefined | null, feature: Feature): boolean {
  return getPlan(plan).features[feature]
}

export function getPlanLimits(plan: string | undefined | null): PlanLimits {
  return getPlan(plan).limits
}

/** Precio mensual formateado para mostrar ("$50.000"). */
export function formatPrecioPlan(plan: PlanId): string {
  return `$${PLANS[plan].precioMensual.toLocaleString("es-AR")}`
}

/** Lista ordenada de planes para mostrar en /pricing. */
export const PLAN_LIST: PlanDefinition[] = [PLANS.basico, PLANS.pro]

export interface TrialStatus {
  /** El tenant tiene un vencimiento de trial asignado. */
  enTrial: boolean
  /** enTrial && ya pasó la fecha. */
  vencido: boolean
  /** Días enteros restantes (0 si ya venció, null si no está en trial). */
  diasRestantes: number | null
}

/**
 * Estado del trial de un tenant a partir de su `trialExpiresAt`.
 *
 * `vencido` también es el estado "sin suscripción activa": cuando una
 * suscripción se cancela, el servidor pone `trial_expires_at = now()` y el
 * panel queda en solo lectura hasta que el dueño contrate un plan.
 */
export function getTrialStatus(
  config: Pick<TenantConfig, "trialExpiresAt">,
): TrialStatus {
  if (!config.trialExpiresAt) {
    return { enTrial: false, vencido: false, diasRestantes: null }
  }

  const vencimiento = new Date(config.trialExpiresAt).getTime()
  const restanteMs = vencimiento - Date.now()
  const vencido = restanteMs <= 0
  const diasRestantes = vencido ? 0 : Math.ceil(restanteMs / (24 * 60 * 60 * 1000))

  return { enTrial: true, vencido, diasRestantes }
}
