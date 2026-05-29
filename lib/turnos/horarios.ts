import type { HorarioTenant } from "@/lib/firebase/firestore"

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

/** Convierte una etiqueta de día ("Lunes", "Lunes a Viernes") a números de día (0=domingo). */
export function diaToWeekdays(dia: string): number[] {
  const d = normalizeStr(dia)
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

/** Genera slots horarios de 1h entre apertura y cierre (formato "HH:00"). */
export function generateTimeSlots(apertura: string, cierre: string): string[] {
  const ah = parseInt(apertura.split(":")[0], 10)
  const ch = parseInt(cierre.split(":")[0], 10)
  const slots: string[] = []
  for (let h = ah; h < ch; h++) slots.push(`${h.toString().padStart(2, "0")}:00`)
  return slots
}

/** Genera slots respetando horario partido (cierre1/apertura2). */
export function generateTimeSlotsConSiesta(
  apertura: string,
  cierre: string,
  cierre1: string,
  apertura2: string,
): string[] {
  const ah = parseInt(apertura.split(":")[0], 10)
  const ch = parseInt(cierre.split(":")[0], 10)
  const c1 = parseInt(cierre1.split(":")[0], 10)
  const a2 = parseInt(apertura2.split(":")[0], 10)
  const slots: string[] = []
  for (let h = ah; h < ch; h++) {
    if (h >= c1 && h < a2) continue
    slots.push(`${h.toString().padStart(2, "0")}:00`)
  }
  return slots
}

export function getHorarioForDay(dayOfWeek: number, horarios: HorarioTenant[]): HorarioTenant | null {
  return horarios.find((h) => diaToWeekdays(h.dia).includes(dayOfWeek)) ?? null
}

/** Cantidad de slots horarios (de 1h) que ocupa una duración en minutos. */
export function slotsParaDuracion(duracionMin: number | undefined): number {
  return Math.max(1, Math.ceil((duracionMin ?? 60) / 60))
}

function horaToNum(hora: string): number {
  return parseInt(hora.split(":")[0], 10)
}

export interface TurnoOcupado {
  hora: string
  duracionMin?: number
}

/**
 * Calcula los slots de inicio disponibles considerando duración variable.
 * Un slot S está disponible si los `slotsParaDuracion(newDuracionMin)` slots
 * consecutivos desde S existen en `slots` (horario laboral) y ninguno está
 * ocupado por un turno existente (cada uno expande según su propia duración).
 */
export function computeAvailableSlots(
  slots: string[],
  ocupados: TurnoOcupado[],
  newDuracionMin: number,
): string[] {
  const slotSet = new Set(slots)
  const horasSlots = slots.map(horaToNum)

  // Horas ocupadas (expandidas por la duración de cada turno existente)
  const horasOcupadas = new Set<number>()
  for (const o of ocupados) {
    const inicio = horaToNum(o.hora)
    const bloques = slotsParaDuracion(o.duracionMin)
    for (let i = 0; i < bloques; i++) horasOcupadas.add(inicio + i)
  }

  const bloquesNuevo = slotsParaDuracion(newDuracionMin)

  return slots.filter((slot) => {
    const inicio = horaToNum(slot)
    for (let i = 0; i < bloquesNuevo; i++) {
      const h = inicio + i
      // Cada hora del nuevo turno debe ser un slot laboral válido y estar libre
      const horaStr = `${h.toString().padStart(2, "0")}:00`
      if (!slotSet.has(horaStr)) return false
      if (horasOcupadas.has(h)) return false
    }
    return true
  }).filter((slot) => horasSlots.includes(horaToNum(slot)))
}
