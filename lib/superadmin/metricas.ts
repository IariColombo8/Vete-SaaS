/**
 * Métricas de crecimiento de la plataforma y proyección al ritmo actual.
 * Puro (`ahora` inyectable) para testear sin base ni reloj.
 *
 * La proyección es deliberadamente simple y explícita en sus supuestos:
 *  - altas por mes: promedio de los últimos 3 meses (o desde la primera alta,
 *    si la plataforma es más nueva);
 *  - conversión: de las veterinarias que ya terminaron la prueba, qué parte
 *    pagó alguna vez;
 *  - bajas: suscripciones cortadas en los últimos 3 meses sobre las que pagan;
 *  - ticket: lo que paga hoy en promedio cada una (o, sin ninguna, el promedio
 *    de los planes que se ofrecen).
 * Cada supuesto se puede pisar desde la pantalla ("¿y si consigo 5 por mes?").
 */

import type { IngresoTenant } from "./ingresos"

const DIA_MS = 24 * 60 * 60 * 1000
const MES_MS = 30.44 * DIA_MS
const VENTANA_MESES = 3

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

export interface PuntoMensual {
  /** "2026-10" */
  mes: string
  /** "oct 26" */
  etiqueta: string
  altas: number
  /** Veterinarias registradas al cierre del mes. */
  veterinarias: number
  /** Con suscripción activa al cierre del mes. */
  pagantes: number
  /** Ingreso mensual al cierre del mes (montos de hoy). */
  ingresoMensual: number
  proyectado: boolean
}

export interface Supuestos {
  altasPorMes: number
  /** 0–1 */
  conversion: number
  /** 0–1, por mes */
  bajaMensual: number
  ticket: number
}

export interface TenantMetricas {
  slug: string
  createdAt?: string
}

function claveMes(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`
}

function etiquetaMes(fecha: Date): string {
  return `${MESES_CORTOS[fecha.getMonth()]} ${String(fecha.getFullYear()).slice(2)}`
}

function finDeMes(anio: number, mes: number): Date {
  return new Date(anio, mes + 1, 0, 23, 59, 59, 999)
}

function activoEn(ingreso: IngresoTenant | undefined, fecha: Date): boolean {
  if (!ingreso) return false
  const t = fecha.getTime()
  return ingreso.periodos.some(
    (p) => new Date(p.desde).getTime() <= t && (p.hasta === null || new Date(p.hasta).getTime() > t),
  )
}

/**
 * Serie real mes a mes, desde el mes de la primera alta (como mucho `maxMeses`
 * hacia atrás) hasta el mes actual. El ingreso de cada mes usa el monto que
 * paga hoy cada veterinaria: el histórico exacto de cobros no existe.
 */
export function serieMensual(
  tenants: TenantMetricas[],
  ingresos: Record<string, IngresoTenant>,
  ahora: Date,
  maxMeses = 12,
): PuntoMensual[] {
  const altas = tenants
    .map((t) => (t.createdAt ? new Date(t.createdAt) : null))
    .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()))
  if (altas.length === 0) return []

  const primera = new Date(Math.min(...altas.map((d) => d.getTime())))
  const mesesDesdePrimera =
    (ahora.getFullYear() - primera.getFullYear()) * 12 + (ahora.getMonth() - primera.getMonth())
  const cantidad = Math.min(mesesDesdePrimera, maxMeses - 1) + 1

  const puntos: PuntoMensual[] = []
  for (let i = cantidad - 1; i >= 0; i--) {
    const inicio = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
    const cierre = i === 0 ? ahora : finDeMes(inicio.getFullYear(), inicio.getMonth())
    const clave = claveMes(inicio)
    const pagan = tenants.filter((t) => activoEn(ingresos[t.slug], cierre))
    puntos.push({
      mes: clave,
      etiqueta: etiquetaMes(inicio),
      altas: altas.filter((d) => claveMes(d) === clave).length,
      veterinarias: altas.filter((d) => d.getTime() <= cierre.getTime()).length,
      pagantes: pagan.length,
      // Con el monto de su suscripción actual. Una que pagó y hoy no paga
      // cuenta en `pagantes` de esos meses pero suma 0 al ingreso: su monto
      // de entonces no está guardado.
      ingresoMensual: pagan.reduce((acc, t) => acc + (ingresos[t.slug]?.montoMensual ?? 0), 0),
      proyectado: false,
    })
  }
  return puntos
}

/** Supuestos sacados de los datos reales. */
export function supuestosReales(
  tenants: TenantMetricas[],
  ingresos: Record<string, IngresoTenant>,
  ahora: Date,
  opciones: { diasPrueba: number; ticketSinDatos: number },
): Supuestos {
  const altas = tenants
    .map((t) => (t.createdAt ? new Date(t.createdAt).getTime() : NaN))
    .filter((t) => !Number.isNaN(t))

  // Altas por mes: últimos 3 meses, o el tiempo real si la plataforma es más nueva.
  let altasPorMes = 0
  if (altas.length > 0) {
    const desdeVentana = ahora.getTime() - VENTANA_MESES * MES_MS
    const primera = Math.min(...altas)
    const inicio = Math.max(desdeVentana, primera)
    const meses = Math.max((ahora.getTime() - inicio) / MES_MS, 1)
    altasPorMes = altas.filter((t) => t >= inicio).length / meses
  }

  // Conversión: solo cuentan las que ya tuvieron tiempo de decidir.
  const limitePrueba = ahora.getTime() - opciones.diasPrueba * DIA_MS
  const decididas = tenants.filter((t) => t.createdAt && new Date(t.createdAt).getTime() <= limitePrueba)
  const pagaronAlgunaVez = decididas.filter((t) => (ingresos[t.slug]?.periodos.length ?? 0) > 0)
  const conversion = decididas.length > 0 ? pagaronAlgunaVez.length / decididas.length : 0

  // Bajas: cortes de los últimos 3 meses sobre las que pagan (o pagaban).
  const desde = ahora.getTime() - VENTANA_MESES * MES_MS
  const valores = Object.values(ingresos)
  const cortes = valores
    .flatMap((i) => i.periodos)
    .filter((p) => p.hasta !== null && new Date(p.hasta).getTime() >= desde).length
  const pagantes = valores.filter((i) => i.pagando).length
  const base = pagantes + cortes
  const bajaMensual = base > 0 ? cortes / VENTANA_MESES / base : 0

  const activos = valores.filter((i) => i.pagando)
  const ticket =
    activos.length > 0
      ? activos.reduce((acc, i) => acc + i.montoMensual, 0) / activos.length
      : opciones.ticketSinDatos

  return {
    altasPorMes: redondear(altasPorMes, 1),
    conversion: redondear(conversion, 2),
    bajaMensual: redondear(bajaMensual, 3),
    ticket: Math.round(ticket),
  }
}

function redondear(valor: number, decimales: number): number {
  const f = 10 ** decimales
  return Math.round(valor * f) / f
}

/**
 * Proyección mes a mes a partir del último punto real. Las veterinarias crecen
 * con las altas; las que pagan, con las altas que convierten menos las bajas.
 */
export function proyectar(
  ultimo: Pick<PuntoMensual, "veterinarias" | "pagantes">,
  supuestos: Supuestos,
  ahora: Date,
  meses = 12,
): PuntoMensual[] {
  const puntos: PuntoMensual[] = []
  let veterinarias = ultimo.veterinarias
  let pagantes = ultimo.pagantes
  for (let k = 1; k <= meses; k++) {
    const inicio = new Date(ahora.getFullYear(), ahora.getMonth() + k, 1)
    veterinarias += supuestos.altasPorMes
    pagantes = pagantes * (1 - supuestos.bajaMensual) + supuestos.altasPorMes * supuestos.conversion
    puntos.push({
      mes: claveMes(inicio),
      etiqueta: etiquetaMes(inicio),
      altas: supuestos.altasPorMes,
      veterinarias: redondear(veterinarias, 1),
      pagantes: redondear(pagantes, 1),
      ingresoMensual: Math.round(pagantes * supuestos.ticket),
      proyectado: true,
    })
  }
  return puntos
}

export interface Meta {
  /** Veterinarias que pagan. */
  pagantes: number
  /** Ingreso mensual a esa altura. */
  ingresoMensual: number
  /** Mes estimado ("2027-03"), null si al ritmo actual no se llega en `horizonte` meses. */
  mes: string | null
  etiqueta: string | null
  /** Ya se superó. */
  alcanzada: boolean
}

/** ¿Cuándo se llega a N veterinarias pagando, al ritmo de los supuestos? */
export function estimarMetas(
  actual: Pick<PuntoMensual, "veterinarias" | "pagantes">,
  supuestos: Supuestos,
  ahora: Date,
  objetivos: number[],
  horizonte = 60,
): Meta[] {
  const futuro = proyectar(actual, supuestos, ahora, horizonte)
  return objetivos.map((objetivo) => {
    const ingresoMensual = Math.round(objetivo * supuestos.ticket)
    if (actual.pagantes >= objetivo) {
      return { pagantes: objetivo, ingresoMensual, mes: null, etiqueta: null, alcanzada: true }
    }
    const punto = futuro.find((p) => p.pagantes >= objetivo)
    return {
      pagantes: objetivo,
      ingresoMensual,
      mes: punto?.mes ?? null,
      etiqueta: punto?.etiqueta ?? null,
      alcanzada: false,
    }
  })
}
