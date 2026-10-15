import { describe, it, expect } from "vitest"
import {
  diaDelMes, estadoCobroManual, nombreMes, periodoActual, proximoPeriodoImpago, sumarMeses, ultimoPago,
  type PagoManual,
} from "./cobro-manual"

const pago = (periodo: string, extra: Partial<PagoManual> = {}): PagoManual => ({
  id: periodo, tenantId: "vipvet", periodo, monto: 80000, medio: "efectivo", pagadoEl: periodo,
  nota: null, createdAt: `${periodo}T12:00:00Z`, anuladoAt: null, motivoAnulacion: null, ...extra,
})

// Día D de octubre 2026 a las 12:00 de Argentina.
const dia = (d: number) => new Date(`2026-10-${String(d).padStart(2, "0")}T15:00:00Z`)

describe("mes y día en hora de Argentina", () => {
  it("el 1 a las 00:30 de Argentina ya es el mes nuevo, aunque en UTC no", () => {
    expect(periodoActual(new Date("2026-11-01T03:30:00Z"))).toBe("2026-11-01")
    expect(periodoActual(new Date("2026-11-01T02:30:00Z"))).toBe("2026-10-01")
    expect(diaDelMes(new Date("2026-11-01T03:30:00Z"))).toBe(1)
  })

  it("sumarMeses cruza el año", () => {
    expect(sumarMeses("2026-12-01", 1)).toBe("2027-01-01")
    expect(sumarMeses("2026-01-01", -1)).toBe("2025-12-01")
    expect(nombreMes("2026-10-01")).toBe("octubre 2026")
  })
})

describe("estadoCobroManual", () => {
  it("del 1 al 6 sin pago está pendiente y no avisa", () => {
    const e = estadoCobroManual([], dia(6))
    expect(e).toMatchObject({ periodo: "2026-10-01", fase: "pendiente", avisar: false })
  })

  it("del 7 al 10 sin pago avisa que vence el 10", () => {
    expect(estadoCobroManual([], dia(7))).toMatchObject({ fase: "por_vencer", avisar: true })
    expect(estadoCobroManual([], dia(10))).toMatchObject({ fase: "por_vencer", avisar: true })
  })

  it("después del 10 queda atrasado (y sigue avisando)", () => {
    expect(estadoCobroManual([], dia(11))).toMatchObject({ fase: "atrasado", avisar: true })
  })

  it("con el pago del mes registrado, no avisa", () => {
    const e = estadoCobroManual([pago("2026-10-01")], dia(15))
    expect(e.fase).toBe("pagado")
    expect(e.avisar).toBe(false)
  })

  it("un pago anulado no cuenta", () => {
    const anulado = pago("2026-10-01", { anuladoAt: "2026-10-05T00:00:00Z", motivoAnulacion: "error" })
    expect(estadoCobroManual([anulado], dia(8)).fase).toBe("por_vencer")
  })

  it("el pago del mes anterior no cubre el actual", () => {
    expect(estadoCobroManual([pago("2026-09-01")], dia(8)).fase).toBe("por_vencer")
  })
})

describe("ultimoPago y proximoPeriodoImpago", () => {
  it("el último es el mes más reciente vigente", () => {
    const anulado = pago("2026-11-01", { anuladoAt: "x", motivoAnulacion: "error" })
    expect(ultimoPago([pago("2026-09-01"), pago("2026-10-01"), anulado])?.periodo).toBe("2026-10-01")
    expect(ultimoPago([])).toBeNull()
  })

  it("propone el mes en curso, o el siguiente si ya está pago", () => {
    expect(proximoPeriodoImpago([], dia(3))).toBe("2026-10-01")
    expect(proximoPeriodoImpago([pago("2026-10-01")], dia(3))).toBe("2026-11-01")
  })
})
