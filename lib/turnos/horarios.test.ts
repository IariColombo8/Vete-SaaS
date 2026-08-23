import { describe, it, expect } from "vitest"
import {
  diaToWeekdays,
  generateTimeSlots,
  generateTimeSlotsConSiesta,
  getHorarioForDay,
  computeAvailableSlots,
  slotsParaDuracion,
} from "./horarios"
import type { HorarioTenant } from "@/lib/supabase/queries"

describe("diaToWeekdays", () => {
  it("mapea un día simple a su número (0=domingo)", () => {
    expect(diaToWeekdays("Lunes")).toEqual([1])
    expect(diaToWeekdays("Domingo")).toEqual([0])
    expect(diaToWeekdays("Sábado")).toEqual([6])
  })

  it("ignora acentos y mayúsculas", () => {
    expect(diaToWeekdays("MIÉRCOLES")).toEqual([3])
    expect(diaToWeekdays("sabado")).toEqual([6])
  })

  it("expande un rango 'X a Y'", () => {
    expect(diaToWeekdays("Lunes a Viernes")).toEqual([1, 2, 3, 4, 5])
  })

  it("devuelve array vacío para entrada desconocida", () => {
    expect(diaToWeekdays("Feriado")).toEqual([])
    expect(diaToWeekdays("")).toEqual([])
  })
})

describe("generateTimeSlots", () => {
  it("genera slots de 1h entre apertura y cierre", () => {
    expect(generateTimeSlots("09:00", "12:00")).toEqual(["09:00", "10:00", "11:00"])
  })

  it("no incluye la hora de cierre", () => {
    const slots = generateTimeSlots("08:00", "20:00")
    expect(slots).toHaveLength(12)
    expect(slots[0]).toBe("08:00")
    expect(slots.at(-1)).toBe("19:00")
  })

  it("devuelve vacío si apertura >= cierre", () => {
    expect(generateTimeSlots("18:00", "18:00")).toEqual([])
    expect(generateTimeSlots("19:00", "18:00")).toEqual([])
  })
})

describe("generateTimeSlotsConSiesta", () => {
  it("excluye el bloque de siesta (cierre1..apertura2)", () => {
    // 08-20 con siesta de 12 a 16
    const slots = generateTimeSlotsConSiesta("08:00", "20:00", "12:00", "16:00")
    expect(slots).toContain("11:00")
    expect(slots).not.toContain("12:00")
    expect(slots).not.toContain("15:00")
    expect(slots).toContain("16:00")
    expect(slots.at(-1)).toBe("19:00")
  })
})

describe("getHorarioForDay", () => {
  const horarios: HorarioTenant[] = [
    { dia: "Lunes a Viernes", apertura: "09:00", cierre: "18:00", cerrado: false },
    { dia: "Sabado", apertura: "09:00", cierre: "13:00", cerrado: false },
  ]

  it("encuentra el horario que cubre un día (martes = 2)", () => {
    expect(getHorarioForDay(2, horarios)?.dia).toBe("Lunes a Viernes")
  })

  it("encuentra el horario del sábado (6)", () => {
    expect(getHorarioForDay(6, horarios)?.dia).toBe("Sabado")
  })

  it("devuelve null para un día sin horario (domingo = 0)", () => {
    expect(getHorarioForDay(0, horarios)).toBeNull()
  })
})

describe("slotsParaDuracion", () => {
  it("redondea hacia arriba a bloques de 1h, mínimo 1", () => {
    expect(slotsParaDuracion(60)).toBe(1)
    expect(slotsParaDuracion(90)).toBe(2)
    expect(slotsParaDuracion(120)).toBe(2)
    expect(slotsParaDuracion(30)).toBe(1)
    expect(slotsParaDuracion(undefined)).toBe(1)
  })
})

describe("computeAvailableSlots", () => {
  const slots = ["09:00", "10:00", "11:00", "12:00"]

  it("sin ocupados y duración 60, todos disponibles", () => {
    expect(computeAvailableSlots(slots, [], 60)).toEqual(slots)
  })

  it("bloquea el slot ocupado (duración 60)", () => {
    const r = computeAvailableSlots(slots, [{ hora: "10:00", duracionMin: 60 }], 60)
    expect(r).toEqual(["09:00", "11:00", "12:00"])
  })

  it("un turno de 120 min ocupa dos horas", () => {
    const r = computeAvailableSlots(slots, [{ hora: "10:00", duracionMin: 120 }], 60)
    expect(r).toEqual(["09:00", "12:00"])
  })

  it("un servicio nuevo de 120 min necesita dos slots consecutivos libres", () => {
    // 11:00 ocupado → 10:00 no sirve (10-12 choca), 11:00 ocupado, 12:00 no tiene 13:00
    const r = computeAvailableSlots(slots, [{ hora: "11:00", duracionMin: 60 }], 120)
    expect(r).toEqual(["09:00"])
  })

  it("no ofrece un inicio cuyo bloque excede el horario laboral", () => {
    const r = computeAvailableSlots(slots, [], 120)
    // 12:00 no tiene 13:00 disponible
    expect(r).toEqual(["09:00", "10:00", "11:00"])
  })
})
