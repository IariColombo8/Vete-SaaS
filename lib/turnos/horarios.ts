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
