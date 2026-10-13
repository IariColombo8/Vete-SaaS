/**
 * Series para los gráficos del Dashboard. Funciones puras: reciben las fechas y
 * horas de los turnos como strings ("YYYY-MM-DD", "HH:mm") y devuelven la serie
 * ya ordenada y rellenada con ceros.
 *
 * Antes se agrupaba con `reduce` + `Object.entries(...).slice(-30)`: como los
 * turnos llegan ordenados del más nuevo al más viejo, el gráfico mostraba los
 * 30 días MÁS VIEJOS, dibujados al revés, y los meses de distintos años se
 * sumaban bajo el mismo nombre ("Oct" de 2025 y de 2026 en una sola barra).
 */

export interface PuntoSerie {
  /** Clave ordenable: "YYYY-MM-DD" para días, "YYYY-MM" para meses. */
  clave: string
  /** Texto para el eje. */
  etiqueta: string
  cantidad: number
}

function dosDigitos(n: number): string {
  return n.toString().padStart(2, "0")
}

/** Fecha local como "YYYY-MM-DD" (sin pasar por UTC, que corre el día). */
export function claveDia(fecha: Date): string {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`
}

function etiquetaDia(clave: string): string {
  const [anio, mes, dia] = clave.split("-").map(Number)
  return new Date(anio, mes - 1, dia).toLocaleDateString("es-AR", { day: "numeric", month: "short" })
}

function etiquetaMes(clave: string, conAnio: boolean): string {
  const [anio, mes] = clave.split("-").map(Number)
  const texto = new Date(anio, mes - 1, 1).toLocaleDateString(
    "es-AR",
    conAnio ? { month: "short", year: "2-digit" } : { month: "short" },
  )
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function contar(claves: string[]): Map<string, number> {
  const conteo = new Map<string, number>()
  for (const clave of claves) conteo.set(clave, (conteo.get(clave) ?? 0) + 1)
  return conteo
}

/**
 * Turnos por día en los últimos `dias` días calendario, terminando en `hoy`,
 * en orden cronológico y con cero en los días sin turnos.
 */
export function serieUltimosDias(fechas: string[], dias: number, hoy: Date): PuntoSerie[] {
  const conteo = contar(fechas)
  const serie: PuntoSerie[] = []
  for (let i = dias - 1; i >= 0; i--) {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - i)
    const clave = claveDia(fecha)
    serie.push({ clave, etiqueta: etiquetaDia(clave), cantidad: conteo.get(clave) ?? 0 })
  }
  return serie
}

/**
 * Turnos por mes en los últimos `meses` meses calendario (incluido el actual),
 * en orden cronológico y con cero en los meses sin turnos. La etiqueta lleva el
 * año solo si la ventana cruza de un año a otro.
 */
export function serieUltimosMeses(fechas: string[], meses: number, hoy: Date): PuntoSerie[] {
  const conteo = contar(fechas.map((f) => f.slice(0, 7)))
  const claves: string[] = []
  for (let i = meses - 1; i >= 0; i--) {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    claves.push(`${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}`)
  }
  const cruzaAnio = new Set(claves.map((c) => c.slice(0, 4))).size > 1
  return claves.map((clave) => ({
    clave,
    etiqueta: etiquetaMes(clave, cruzaAnio),
    cantidad: conteo.get(clave) ?? 0,
  }))
}

/**
 * Turnos por hora del día. Cubre siempre de 08:00 a 20:00 y se extiende si
 * hay turnos fuera de ese rango (antes se descartaban en silencio).
 */
export function serieHorarios(horas: string[]): PuntoSerie[] {
  const enteras = horas
    .map((h) => Number.parseInt(h.split(":")[0] ?? "", 10))
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)
  const conteo = contar(enteras.map(String))
  const desde = Math.min(8, ...enteras)
  const hasta = Math.max(20, ...enteras)
  const serie: PuntoSerie[] = []
  for (let h = desde; h <= hasta; h++) {
    const etiqueta = `${dosDigitos(h)}:00`
    serie.push({ clave: etiqueta, etiqueta, cantidad: conteo.get(String(h)) ?? 0 })
  }
  return serie
}
