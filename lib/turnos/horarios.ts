import type { HorarioTenant } from "@/lib/supabase/queries"

/**
 * Helpers puros de horarios y generación de slots de turnos.
 * Extraídos de useTurnoForm para poder testearlos sin arrastrar React/Firebase.
 */

export function normalizeStr(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
}

export const DAY_NUM: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3,
  jueves: 4, viernes: 5, sabado: 6,
}

/** Días de la semana en orden de exhibición (lunes primero, domingo al final). */
export const DIAS_SEMANA: { num: number; nombre: string }[] = [
  { num: 1, nombre: "Lunes" }, { num: 2, nombre: "Martes" }, { num: 3, nombre: "Miercoles" },
  { num: 4, nombre: "Jueves" }, { num: 5, nombre: "Viernes" }, { num: 6, nombre: "Sabado" },
  { num: 0, nombre: "Domingo" },
]

/**
 * Convierte una etiqueta de día a números de día (0=domingo). Soporta:
 * - un día suelto: "Lunes"
 * - un rango: "Lunes a Viernes"
 * - una lista: "Lunes,Martes,Viernes" (formato que genera el selector de días)
 * - sufijos entre paréntesis, que se ignoran: "Lunes a Viernes (URGENCIAS)"
 */
export function diaToWeekdays(dia: string): number[] {
  const d = normalizeStr(dia).replace(/\([^)]*\)/g, "").trim()
  if (d.includes(",")) {
    const nums = d.split(",").map((s) => DAY_NUM[s.trim()]).filter((n): n is number => n !== undefined)
    return Array.from(new Set(nums)).sort((a, b) => a - b)
  }
  const range = d.match(/^(\w+)\s+a\s+(\w+)$/)
  if (range) {
    const s = DAY_NUM[range[1]], e = DAY_NUM[range[2]]
    if (s !== undefined && e !== undefined) {
      const out: number[] = []
      for (let i = s; i <= e; i++) out.push(i)
      return out
    }
  }
  return DAY_NUM[d] !== undefined ? [DAY_NUM[d]] : []
}

/** Arma el string interno de días (formato lista) a partir de los números de día seleccionados. */
export function weekdaysToDiaString(dias: number[]): string {
  return DIAS_SEMANA.filter((d) => dias.includes(d.num)).map((d) => d.nombre).join(",")
}

/** Etiqueta legible para mostrar, comprimiendo días consecutivos en rangos ("Lunes a Viernes"). */
export function formatDiasLabel(dias: number[]): string {
  if (dias.length === 0) return ""
  const orden = DIAS_SEMANA.map((d) => d.num)
  const nombreDe = (n: number) => DIAS_SEMANA.find((d) => d.num === n)!.nombre
  const seleccionados = orden.filter((n) => dias.includes(n))

  const grupos: number[][] = []
  for (const n of seleccionados) {
    const anterior = grupos.at(-1)
    const ultimoDelGrupo = anterior?.at(-1)
    const esConsecutivo = ultimoDelGrupo !== undefined && orden.indexOf(n) === orden.indexOf(ultimoDelGrupo) + 1
    if (esConsecutivo && anterior) anterior.push(n)
    else grupos.push([n])
  }

  return grupos
    .map((g) => (g.length > 1 ? `${nombreDe(g[0])} a ${nombreDe(g.at(-1)!)}` : nombreDe(g[0])))
    .join(", ")
}

function minToHora(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}

export function horaToMin(hora: string): number {
  const [h, m] = hora.split(":").map((s) => parseInt(s, 10))
  return h * 60 + (m || 0)
}

/** Genera slots entre apertura y cierre cada `intervaloMin` minutos (default 60, formato "HH:MM"). */
export function generateTimeSlots(apertura: string, cierre: string, intervaloMin = 60): string[] {
  const desde = horaToMin(apertura)
  const hasta = horaToMin(cierre)
  const slots: string[] = []
  for (let m = desde; m < hasta; m += intervaloMin) slots.push(minToHora(m))
  return slots
}

/** Genera slots respetando horario partido (cierre1/apertura2), cada `intervaloMin` minutos. */
export function generateTimeSlotsConSiesta(
  apertura: string,
  cierre: string,
  cierre1: string,
  apertura2: string,
  intervaloMin = 60,
): string[] {
  const desde = horaToMin(apertura)
  const hasta = horaToMin(cierre)
  const c1 = horaToMin(cierre1)
  const a2 = horaToMin(apertura2)
  const slots: string[] = []
  for (let m = desde; m < hasta; m += intervaloMin) {
    if (m >= c1 && m < a2) continue
    slots.push(minToHora(m))
  }
  return slots
}

export function getHorarioForDay(dayOfWeek: number, horarios: HorarioTenant[]): HorarioTenant | null {
  return horarios.find((h) => diaToWeekdays(h.dia).includes(dayOfWeek)) ?? null
}

/**
 * Todos los bloques horarios que cubren un día (ej: horario normal + urgencias
 * de madrugada pueden ser dos filas distintas que incluyen el mismo día).
 */
export function getHorariosForDay(dayOfWeek: number, horarios: HorarioTenant[]): HorarioTenant[] {
  return horarios.filter((h) => diaToWeekdays(h.dia).includes(dayOfWeek))
}

/** Combina los slots de todos los bloques horarios de un día (sin duplicados, ordenados). */
export function computeSlotsForHorarios(bloques: HorarioTenant[], intervaloMin = 60): string[] {
  const slotSet = new Set<string>()
  for (const h of bloques) {
    if (h.cerrado) continue
    const slots = h.corrido === false && h.cierre1 && h.apertura2
      ? generateTimeSlotsConSiesta(h.apertura, h.cierre, h.cierre1, h.apertura2, intervaloMin)
      : generateTimeSlots(h.apertura, h.cierre, intervaloMin)
    slots.forEach((s) => slotSet.add(s))
  }
  return Array.from(slotSet).sort()
}

/** Cantidad de slots (de `intervaloMin` minutos, default 60) que ocupa una duración en minutos. */
export function slotsParaDuracion(duracionMin: number | undefined, intervaloMin = 60): number {
  return Math.max(1, Math.ceil((duracionMin ?? 60) / intervaloMin))
}

export interface TurnoOcupado {
  hora: string
  duracionMin?: number
}

/**
 * Calcula los slots de inicio disponibles considerando duración variable.
 * Un slot S está disponible si los `slotsParaDuracion(newDuracionMin)` slots
 * consecutivos desde S existen en `slots` (horario laboral) y ninguno alcanzó
 * el `cupoSimultaneo` de turnos ya reservados (default 1 = sin superposición).
 */
export function computeAvailableSlots(
  slots: string[],
  ocupados: TurnoOcupado[],
  newDuracionMin: number,
  opts?: { intervaloMin?: number; cupoSimultaneo?: number },
): string[] {
  const intervaloMin = opts?.intervaloMin ?? 60
  const cupoSimultaneo = opts?.cupoSimultaneo ?? 1
  const slotSet = new Set(slots)

  // Ocupación por minuto de inicio (expandida por la duración de cada turno existente)
  const ocupacionPorMinuto = new Map<number, number>()
  for (const o of ocupados) {
    const inicio = horaToMin(o.hora)
    const bloques = slotsParaDuracion(o.duracionMin, intervaloMin)
    for (let i = 0; i < bloques; i++) {
      const m = inicio + i * intervaloMin
      ocupacionPorMinuto.set(m, (ocupacionPorMinuto.get(m) ?? 0) + 1)
    }
  }

  const bloquesNuevo = slotsParaDuracion(newDuracionMin, intervaloMin)

  return slots.filter((slot) => {
    const inicio = horaToMin(slot)
    for (let i = 0; i < bloquesNuevo; i++) {
      const m = inicio + i * intervaloMin
      // Cada tramo del nuevo turno debe ser un slot laboral válido y tener cupo libre
      if (!slotSet.has(minToHora(m))) return false
      if ((ocupacionPorMinuto.get(m) ?? 0) >= cupoSimultaneo) return false
    }
    return true
  })
}
