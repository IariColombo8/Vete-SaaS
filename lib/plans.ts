/**
 * Catálogo de planes y feature-gating.
 *
 * Desde `056_planes_editables.sql` el catálogo vive en la tabla `planes` y se
 * edita desde /superadmin → Planes (precio, límites, secciones incluidas,
 * bullets, orden, visibilidad). Este módulo es puro y sincrónico: guarda el
 * catálogo en memoria y lo consultan los chequeos de permiso sin ir a la base.
 *
 * Quién lo carga:
 *  - En el navegador, `cargarPlanes()` (lib/supabase/planes.ts). La llama
 *    `getTenantConfig`, así todo componente que lee el plan de la config ya
 *    tiene el catálogo cargado cuando pregunta por una feature.
 *  - En el servidor, `cargarPlanesServidor()` (lib/planes-servidor.ts): la
 *    landing, /pricing, el checkout y los crons.
 *
 * `PLANES_BASE` es el respaldo hasta que llega el catálogo (o si la lectura
 * falla): los mismos valores con los que se sembró la tabla.
 *
 * Las features en sí (qué secciones existen) siguen en el código: un plan
 * nuevo combina las que ya existen; una sección nueva de la app pide código.
 *
 * Básico y Pro no se pueden borrar: `DEFAULT_PLAN` y `PLAN_RECOMENDADO` (la
 * prueba de 10 días) los nombran. "Plus" (plan eliminado) se lee como Pro.
 */

import type { TenantConfig } from "./supabase/types"

/** Id del plan (`planes.id`, guardado en `tenants.plan`). */
export type PlanId = string

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

/** Etiqueta legible por feature, en el orden en que se muestran. */
export const FEATURES: { key: Feature; label: string }[] = [
  { key: "analytics", label: "Dashboard de métricas" },
  { key: "multiUsuario", label: "Varios usuarios por clínica" },
  { key: "whatsapp", label: "Notificaciones por WhatsApp" },
  { key: "pdfLibreta", label: "Libreta sanitaria en PDF" },
  { key: "qrMascota", label: "QR público por mascota" },
  { key: "recordatoriosVacunas", label: "Recordatorios de vacunas" },
  { key: "multipleProfesionales", label: "Múltiples profesionales" },
  { key: "productos", label: "Productos y control de stock" },
  { key: "ventas", label: "Mostrador, caja y remitos" },
  { key: "promosSorteos", label: "Ofertas, promos y sorteos" },
  { key: "facturacionElectronica", label: "Factura electrónica (ARCA)" },
  { key: "mercadoPagoPoint", label: "Cobro con Mercado Pago Point" },
]

export interface PlanLimits {
  /** Máximo de turnos por mes. `null` = ilimitado. */
  maxTurnosMes: number | null
  /** Máximo de usuarios (incluye al dueño). `null` = ilimitado. */
  maxUsuarios: number | null
}

export interface PlanDefinition {
  id: PlanId
  nombre: string
  /** Una línea debajo del nombre en las tarjetas de precios. */
  descripcion: string
  /** Precio mensual en ARS. */
  precioMensual: number
  limits: PlanLimits
  features: Record<Feature, boolean>
  /** Bullets para mostrar en /pricing. */
  highlights: string[]
  /** Menor primero. */
  orden: number
  /** Se muestra en precios y se puede contratar. Oculto = solo lo asigna el superadmin. */
  visible: boolean
}

const ALL_FEATURES_OFF: Record<Feature, boolean> = Object.fromEntries(
  FEATURES.map(({ key }) => [key, false]),
) as Record<Feature, boolean>

const ALL_FEATURES_ON: Record<Feature, boolean> = Object.fromEntries(
  FEATURES.map(({ key }) => [key, true]),
) as Record<Feature, boolean>

/** Respaldo mientras no se cargó el catálogo de la base (mismos valores que la siembra de 056). */
export const PLANES_BASE: PlanDefinition[] = [
  {
    id: "basico",
    nombre: "Básico",
    descripcion: "La clínica completa",
    precioMensual: 50000,
    // Hasta 2026-10 tenía tope de 10 turnos/mes y 1 usuario: no alcanzaba ni
    // para una semana de una clínica chica, así que nadie lo podía usar.
    limits: { maxTurnosMes: null, maxUsuarios: 2 },
    features: {
      ...ALL_FEATURES_OFF,
      multiUsuario: true,
      pdfLibreta: true,
      qrMascota: true,
    },
    highlights: [
      "Turnos ilimitados",
      "Página pública y link para sacar turno",
      "Clientes, libreta sanitaria e historia clínica",
      "Libreta en PDF y QR por mascota",
      "Hasta 2 usuarios",
    ],
    orden: 10,
    visible: true,
  },
  {
    id: "pro",
    nombre: "Pro",
    descripcion: "Para clínicas en funcionamiento",
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
    orden: 20,
    visible: true,
  },
]

/** Plan por defecto cuando el tenant no tiene plan asignado. */
export const DEFAULT_PLAN: PlanId = "basico"

/** Plan que se destaca en precios y se ofrece primero al terminar la prueba. */
export const PLAN_RECOMENDADO: PlanId = "pro"

/** Planes que el código nombra y por eso no se pueden borrar. */
export const PLANES_FIJOS: readonly PlanId[] = [DEFAULT_PLAN, PLAN_RECOMENDADO]

/** Días de prueba de Pro al registrarse (sin tarjeta). */
export const TRIAL_DIAS = 10

// ── Catálogo en memoria ──

let catalogo = new Map<PlanId, PlanDefinition>(PLANES_BASE.map((p) => [p.id, p]))

/**
 * Reemplaza el catálogo en memoria. Una lista vacía no pisa nada: si la tabla
 * no se pudo leer, mejor seguir con lo que había que quedarse sin planes.
 */
export function registrarPlanes(planes: PlanDefinition[]): void {
  if (planes.length === 0) return
  catalogo = new Map(planes.map((p) => [p.id, p]))
}

/** Fila de `planes` (snake_case) → PlanDefinition. */
export function filaAPlan(fila: Record<string, unknown>): PlanDefinition {
  const activas = new Set((fila.features as string[] | null) ?? [])
  const features = Object.fromEntries(
    FEATURES.map(({ key }) => [key, activas.has(key)]),
  ) as Record<Feature, boolean>
  return {
    id: fila.id as string,
    nombre: fila.nombre as string,
    descripcion: (fila.descripcion as string | null) ?? "",
    precioMensual: Number(fila.precio_mensual),
    limits: {
      maxTurnosMes: (fila.max_turnos_mes as number | null) ?? null,
      maxUsuarios: (fila.max_usuarios as number | null) ?? null,
    },
    features,
    highlights: (fila.highlights as string[] | null) ?? [],
    orden: (fila.orden as number | null) ?? 0,
    visible: (fila.visible as boolean | null) ?? true,
  }
}

/** PlanDefinition → fila de `planes`. */
export function planAFila(plan: PlanDefinition): Record<string, unknown> {
  return {
    id: plan.id,
    nombre: plan.nombre.trim(),
    descripcion: plan.descripcion.trim(),
    precio_mensual: plan.precioMensual,
    max_turnos_mes: plan.limits.maxTurnosMes,
    max_usuarios: plan.limits.maxUsuarios,
    features: FEATURES.filter(({ key }) => plan.features[key]).map(({ key }) => key),
    highlights: plan.highlights.map((h) => h.trim()).filter(Boolean),
    orden: plan.orden,
    visible: plan.visible,
  }
}

/**
 * Normaliza un valor desconocido a un PlanId del catálogo.
 * `plus` (plan intermedio ya eliminado) se trata como `pro`.
 */
export function normalizePlan(plan: string | undefined | null): PlanId {
  if (plan === "plus") return "pro"
  if (plan && catalogo.has(plan)) return plan
  return DEFAULT_PLAN
}

/** El plan exacto, o null si no existe en el catálogo. */
export function buscarPlan(plan: string | undefined | null): PlanDefinition | null {
  if (!plan) return null
  return catalogo.get(plan === "plus" ? "pro" : plan) ?? null
}

export function getPlan(plan: string | undefined | null): PlanDefinition {
  return (
    catalogo.get(normalizePlan(plan)) ??
    PLANES_BASE.find((p) => p.id === DEFAULT_PLAN) ??
    PLANES_BASE[0]
  )
}

/** ¿El plan (string) permite usar la feature? Versión pura/síncrona. */
export function planAllows(plan: string | undefined | null, feature: Feature): boolean {
  return getPlan(plan).features[feature]
}

export function getPlanLimits(plan: string | undefined | null): PlanLimits {
  return getPlan(plan).limits
}

/** Precio con formato de pesos ("$50.000"). */
export function formatPesos(monto: number): string {
  return `$${monto.toLocaleString("es-AR")}`
}

/** Precio mensual formateado para mostrar ("$50.000"). */
export function formatPrecioPlan(plan: PlanId): string {
  return formatPesos(getPlan(plan).precioMensual)
}

/**
 * Planes ordenados. Por defecto solo los visibles (los que se ofrecen en
 * precios y se pueden contratar); el superadmin pide también los ocultos.
 */
export function getPlanList(opciones: { incluirOcultos?: boolean } = {}): PlanDefinition[] {
  return ordenarPlanes([...catalogo.values()].filter((p) => opciones.incluirOcultos || p.visible))
}

export function ordenarPlanes(planes: PlanDefinition[]): PlanDefinition[] {
  return [...planes].sort((a, b) => a.orden - b.orden || a.precioMensual - b.precioMensual)
}

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
