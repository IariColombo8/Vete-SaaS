/**
 * Cálculos de gastos fijos por mes. Puro, sin Supabase, para poder testearlo.
 *
 * Un mes se representa como "YYYY-MM-01" — el mismo formato que la columna
 * `date` de Postgres, así se compara como string y se manda tal cual.
 */

export interface GastoFijoMes {
  id: string
  /** Monto base, el de todos los meses. */
  monto: number
  desdeMes: string
  hastaMes?: string
}

/** "YYYY-MM-01" del mes de la fecha, en hora local (`toISOString` corre el día). */
export function mesDe(fecha: Date = new Date()): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  return `${fecha.getFullYear()}-${mes}-01`
}

/** Suma (o resta) meses a un "YYYY-MM-01". */
export function sumarMeses(mes: string, n: number): string {
  const [anio, m] = mes.split("-").map(Number)
  const total = anio * 12 + (m - 1) + n
  const nuevoAnio = Math.floor(total / 12)
  const nuevoMes = (total % 12) + 1
  return `${nuevoAnio}-${String(nuevoMes).padStart(2, "0")}-01`
}

/** Los `n` meses que arrancan en `desde`, inclusive. */
export function mesesDesde(desde: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => sumarMeses(desde, i))
}

const NOMBRES_MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

/** "octubre 2026". */
export function nombreMes(mes: string): string {
  const [anio, m] = mes.split("-").map(Number)
  return `${NOMBRES_MES[m - 1]} ${anio}`
}

/** ¿El gasto fijo corre en ese mes? (`hastaMes` es inclusive.) */
export function correEnMes(fijo: Pick<GastoFijoMes, "desdeMes" | "hastaMes">, mes: string): boolean {
  if (mes < fijo.desdeMes) return false
  if (fijo.hastaMes && mes > fijo.hastaMes) return false
  return true
}

/**
 * Monto del gasto fijo en ese mes: el puntual cargado para ese mes si existe,
 * si no el monto base.
 *
 * `montosPorMes` es `gastoFijoId → mes → monto`.
 */
export function montoDelMes(
  fijo: Pick<GastoFijoMes, "id" | "monto">,
  mes: string,
  montosPorMes: Map<string, Map<string, number>>,
): number {
  return montosPorMes.get(fijo.id)?.get(mes) ?? fijo.monto
}
