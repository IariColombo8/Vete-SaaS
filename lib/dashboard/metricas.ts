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

export interface ResumenEstados {
  pendiente: number
  confirmado: number
  completado: number
  cancelado: number
  /** Pendientes + confirmados: todavía no se atendieron. */
  porAtender: number
  /** Completados + cancelados: ya tienen desenlace. Base de las tasas. */
  resueltos: number
}

/**
 * Cuenta los turnos por estado. "confirmado" existe en el enum de Postgres y
 * antes no se contaba en ningún lado: el total no cuadraba con la suma de
 * estados y un turno confirmado no aparecía como "por atender".
 */
export function resumenEstados(estados: string[]): ResumenEstados {
  const r = { pendiente: 0, confirmado: 0, completado: 0, cancelado: 0 }
  for (const e of estados) if (e in r) r[e as keyof typeof r]++
  return {
    ...r,
    porAtender: r.pendiente + r.confirmado,
    resueltos: r.completado + r.cancelado,
  }
}

/** Porcentaje con un decimal ("0.0" si no hay base): las tasas de éxito y
 *  cancelación se miden sobre los turnos resueltos, no sobre los futuros. */
export function tasaPorcentaje(parte: number, base: number): string {
  return (base > 0 ? (parte / base) * 100 : 0).toFixed(1)
}

export interface MascotaTurno {
  id?: string
  nombre: string
  tipo: string
}

/** Identidad de una mascota en un turno: el id si lo tiene, si no el nombre. */
function claveMascota(m: MascotaTurno): string | null {
  if (m.id) return `id:${m.id}`
  const nombre = m.nombre.trim().toLowerCase()
  return nombre ? `nombre:${nombre}` : null
}

/** Cantidad de mascotas distintas con turno (antes se contaba por nombre:
 *  dos perros llamados "Toby" eran uno solo). */
export function contarMascotasUnicas(mascotas: MascotaTurno[]): number {
  const claves = new Set<string>()
  for (const m of mascotas) {
    const clave = claveMascota(m)
    if (clave) claves.add(clave)
  }
  return claves.size
}

/**
 * Mascotas distintas por especie, de mayor a menor. Cuenta mascotas, no turnos:
 * un perro con cinco turnos es un perro. "perro" y "Perro" son la misma especie.
 */
export function mascotasPorEspecie(mascotas: MascotaTurno[]): PuntoSerie[] {
  const vistas = new Set<string>()
  const conteo = new Map<string, number>()
  for (const m of mascotas) {
    const tipo = m.tipo.trim().toLowerCase()
    const clave = claveMascota(m)
    if (!tipo || !clave || vistas.has(clave)) continue
    vistas.add(clave)
    conteo.set(tipo, (conteo.get(tipo) ?? 0) + 1)
  }
  return [...conteo.entries()]
    .map(([tipo, cantidad]) => ({
      clave: tipo,
      etiqueta: tipo.split(" ").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" "),
      cantidad,
    }))
    .sort((a, b) => b.cantidad - a.cantidad)
}

// ---------------------------------------------------------------------------
// Ventas
// ---------------------------------------------------------------------------

/** Un día de ventas tal como lo devuelve `getMetricasVentas().porDia`. */
export interface VentasDia {
  fecha: string
  total: number
  ventas: number
}

export interface PuntoVentas extends PuntoSerie {
  total: number
  /** Cantidad de ventas del día; `cantidad` (de PuntoSerie) vale lo mismo. */
  ventas: number
}

/** Primer día del mes de `hoy`, como "YYYY-MM-01". */
export function primerDiaDelMes(hoy: Date): string {
  return `${hoy.getFullYear()}-${dosDigitos(hoy.getMonth() + 1)}-01`
}

/** "YYYY-MM-DD" de hace `dias - 1` días: el inicio de una ventana de `dias` días que termina hoy. */
export function inicioVentana(dias: number, hoy: Date): string {
  return claveDia(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (dias - 1)))
}

/**
 * Facturación por día en los últimos `dias` días calendario terminando en
 * `hoy`, con cero en los días sin ventas.
 */
export function serieVentasUltimosDias(porDia: VentasDia[], dias: number, hoy: Date): PuntoVentas[] {
  const indice = new Map(porDia.map((d) => [d.fecha, d]))
  return serieUltimosDias([], dias, hoy).map((p) => {
    const dia = indice.get(p.clave)
    return { ...p, total: dia?.total ?? 0, ventas: dia?.ventas ?? 0, cantidad: dia?.ventas ?? 0 }
  })
}

export interface TotalVentas {
  total: number
  ventas: number
}

export interface ResumenVentas {
  hoy: TotalVentas
  mes: TotalVentas & { ticketPromedio: number }
  ultimos30: TotalVentas
  /** Día con más facturación del mes, o null si no hubo ventas. */
  mejorDiaMes: VentasDia | null
}

function sumar(dias: VentasDia[]): TotalVentas {
  return dias.reduce(
    (acc, d) => ({ total: acc.total + d.total, ventas: acc.ventas + d.ventas }),
    { total: 0, ventas: 0 },
  )
}

/** Totales de hoy, del mes en curso y de los últimos 30 días a partir de la serie diaria. */
export function resumenVentas(porDia: VentasDia[], hoy: Date): ResumenVentas {
  const claveHoy = claveDia(hoy)
  const desdeMes = primerDiaDelMes(hoy)
  const desde30 = inicioVentana(30, hoy)
  const hastaHoy = porDia.filter((d) => d.fecha <= claveHoy)

  const delMes = hastaHoy.filter((d) => d.fecha >= desdeMes)
  const mes = sumar(delMes)
  const mejorDiaMes = delMes.reduce<VentasDia | null>(
    (mejor, d) => (d.total > 0 && (!mejor || d.total > mejor.total) ? d : mejor),
    null,
  )

  return {
    hoy: sumar(hastaHoy.filter((d) => d.fecha === claveHoy)),
    mes: { ...mes, ticketPromedio: mes.ventas > 0 ? mes.total / mes.ventas : 0 },
    ultimos30: sumar(hastaHoy.filter((d) => d.fecha >= desde30)),
    mejorDiaMes,
  }
}
