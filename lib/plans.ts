/**
 * Catálogo de planes y feature-gating.
 *
 * La fuente de verdad de las features por plan vive en código (no en Firestore):
 * los flags cambian con los deploys, no en runtime, y así evitamos una lectura
 * extra por cada chequeo de permiso. El plan de cada tenant sí vive en Firestore
 * (`veterinarias/{slug}/config/datos.plan`).
 */

import type { TenantConfig } from "./supabase/types"

export type PlanId = "basico" | "plus" | "pro"

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

export interface PlanLimits {
  /** Máximo de turnos por mes. `null` = ilimitado. */
  maxTurnosMes: number | null
  /** Máximo de usuarios (incluye al dueño). `null` = ilimitado. */
  maxUsuarios: number | null
}

export interface PlanDefinition {
  id: PlanId
  nombre: string
  /** Precio mensual en ARS. 0 = gratis / a convenir. */
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
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  basico: {
    id: "basico",
    nombre: "Básico",
    precioMensual: 0,
    limits: { maxTurnosMes: 10, maxUsuarios: 1 },
    features: { ...ALL_FEATURES_OFF },
    highlights: [
      "Hasta 10 turnos por mes",
      "Página pública de la veterinaria",
      "Gestión de turnos y clientes",
      "1 usuario",
    ],
  },
  plus: {
    id: "plus",
    nombre: "Plus",
    precioMensual: 14999,
    limits: { maxTurnosMes: 150, maxUsuarios: 3 },
    features: {
      ...ALL_FEATURES_OFF,
      analytics: true,
      multiUsuario: true,
      whatsapp: true,
      pdfLibreta: true,
      productos: true,
    },
    highlights: [
      "Hasta 150 turnos por mes",
      "Dashboard de métricas",
      "Notificaciones por WhatsApp",
      "Libreta sanitaria en PDF",
      "Productos y control de stock",
      "Hasta 3 usuarios",
    ],
  },
  pro: {
    id: "pro",
    nombre: "Pro",
    precioMensual: 29999,
    limits: { maxTurnosMes: null, maxUsuarios: null },
    features: {
      analytics: true,
      multiUsuario: true,
      whatsapp: true,
      pdfLibreta: true,
      qrMascota: true,
      recordatoriosVacunas: true,
      multipleProfesionales: true,
      productos: true,
      ventas: true,
    },
    highlights: [
      "Turnos ilimitados",
      "Todo lo de Plus",
      "Punto de venta, caja y remitos",
      "QR público por mascota",
      "Recordatorios automáticos de vacunas",
      "Múltiples profesionales con agendas",
      "Usuarios ilimitados",
    ],
  },
}

/** Plan por defecto cuando el tenant no tiene plan asignado. */
export const DEFAULT_PLAN: PlanId = "basico"

/** Normaliza un valor desconocido a un PlanId válido. */
export function normalizePlan(plan: string | undefined | null): PlanId {
  if (plan === "plus" || plan === "pro" || plan === "basico") return plan
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

/** Lista ordenada de planes para mostrar en /pricing. */
export const PLAN_LIST: PlanDefinition[] = [PLANS.basico, PLANS.plus, PLANS.pro]

export interface TrialStatus {
  /** El tenant tiene un vencimiento de trial asignado. */
  enTrial: boolean
  /** enTrial && ya pasó la fecha. */
  vencido: boolean
  /** Días enteros restantes (0 si ya venció, null si no está en trial). */
  diasRestantes: number | null
}

/** Estado del trial de un tenant a partir de su `trialExpiresAt`. */
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
