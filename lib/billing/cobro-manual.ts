/**
 * Veterinarias que pagan en efectivo (o transferencia) directo a VetPanel, por
 * fuera de Mercado Pago (`tenants.cobro_manual`, ver 058_cobro_manual.sql).
 *
 * Cada mes se paga del 1 al 10. Desde el día `DIA_AVISO` sin pago registrado
 * se avisa (cartel en el panel + email); pasado `DIA_VENCIMIENTO` queda
 * "atrasado". El panel nunca se bloquea por esto.
 *
 * Puro y con `ahora` inyectable: los días se cuentan en hora de Argentina.
 */

export const DIA_AVISO = 7
export const DIA_VENCIMIENTO = 10

export type MedioPagoManual = "efectivo" | "transferencia" | "otro"

export const MEDIOS_PAGO_MANUAL: { id: MedioPagoManual; label: string }[] = [
  { id: "efectivo", label: "Efectivo" },
  { id: "transferencia", label: "Transferencia" },
  { id: "otro", label: "Otro" },
]

export interface PagoManual {
  id: string
  tenantId: string
  /** "2026-10-01": el mes que paga. */
  periodo: string
  monto: number
  medio: MedioPagoManual
  /** "2026-10-04" */
  pagadoEl: string
  nota: string | null
  createdAt: string
  anuladoAt: string | null
  motivoAnulacion: string | null
}

export type FaseCobro = "pagado" | "pendiente" | "por_vencer" | "atrasado"

export interface EstadoCobroManual {
  /** Mes en curso, "2026-10-01". */
  periodo: string
  fase: FaseCobro
  /** El pago del mes en curso, si está. */
  pago: PagoManual | null
  /** Corresponde avisar: desde el día 7 y sin pago del mes. */
  avisar: boolean
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

/** Fecha de Argentina (UTC-3, sin horario de verano) como "AAAA-MM-DD". */
function fechaArgentina(ahora: Date): string {
  return new Date(ahora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** Mes en curso en Argentina, "2026-10-01". */
export function periodoActual(ahora: Date): string {
  return `${fechaArgentina(ahora).slice(0, 7)}-01`
}

/** Día del mes en Argentina. */
export function diaDelMes(ahora: Date): number {
  return Number(fechaArgentina(ahora).slice(8, 10))
}

/** "2026-10-01" ± n meses. */
export function sumarMeses(periodo: string, n: number): string {
  const [a, m] = periodo.split("-").map(Number)
  const total = a * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`
}

/** "2026-10-01" → "octubre 2026" */
export function nombreMes(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number)
  return `${MESES[m - 1]} ${a}`
}

export function vigentes(pagos: PagoManual[]): PagoManual[] {
  return pagos.filter((p) => p.anuladoAt === null)
}

export function estadoCobroManual(pagos: PagoManual[], ahora: Date): EstadoCobroManual {
  const periodo = periodoActual(ahora)
  const pago = vigentes(pagos).find((p) => p.periodo === periodo) ?? null
  if (pago) return { periodo, fase: "pagado", pago, avisar: false }
  const dia = diaDelMes(ahora)
  const fase: FaseCobro = dia > DIA_VENCIMIENTO ? "atrasado" : dia >= DIA_AVISO ? "por_vencer" : "pendiente"
  return { periodo, fase, pago: null, avisar: dia >= DIA_AVISO }
}

/** El último pago vigente (el mes más reciente). */
export function ultimoPago(pagos: PagoManual[]): PagoManual | null {
  return vigentes(pagos).reduce<PagoManual | null>((max, p) => (max === null || p.periodo > max.periodo ? p : max), null)
}

/** Próximo mes sin pagar a partir del mes en curso (para proponerlo al registrar). */
export function proximoPeriodoImpago(pagos: PagoManual[], ahora: Date): string {
  const pagados = new Set(vigentes(pagos).map((p) => p.periodo))
  let periodo = periodoActual(ahora)
  // Si el mes en curso ya está, se propone el siguiente (pago adelantado).
  for (let i = 0; i < 24 && pagados.has(periodo); i++) periodo = sumarMeses(periodo, 1)
  return periodo
}
