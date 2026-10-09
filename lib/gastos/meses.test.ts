import { describe, expect, it } from "vitest"
import { correEnMes, mesDe, mesesDesde, montoDelMes, nombreMes, sumarMeses } from "./meses"

describe("sumarMeses", () => {
  it("cruza el fin de año en las dos direcciones", () => {
    expect(sumarMeses("2026-11-01", 1)).toBe("2026-12-01")
    expect(sumarMeses("2026-12-01", 1)).toBe("2027-01-01")
    expect(sumarMeses("2027-01-01", -1)).toBe("2026-12-01")
    expect(sumarMeses("2026-10-01", 15)).toBe("2028-01-01")
  })
})

describe("mesDe / mesesDesde / nombreMes", () => {
  it("usa la fecha local y el día 1", () => {
    expect(mesDe(new Date(2026, 9, 31, 23, 30))).toBe("2026-10-01")
  })

  it("lista meses consecutivos", () => {
    expect(mesesDesde("2026-11-01", 3)).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"])
  })

  it("nombra el mes en español", () => {
    expect(nombreMes("2026-10-01")).toBe("octubre 2026")
  })
})

describe("correEnMes", () => {
  const fijo = { desdeMes: "2026-03-01", hastaMes: "2026-08-01" }

  it("respeta inicio y baja inclusive", () => {
    expect(correEnMes(fijo, "2026-02-01")).toBe(false)
    expect(correEnMes(fijo, "2026-03-01")).toBe(true)
    expect(correEnMes(fijo, "2026-08-01")).toBe(true)
    expect(correEnMes(fijo, "2026-09-01")).toBe(false)
  })

  it("sin baja corre para siempre", () => {
    expect(correEnMes({ desdeMes: "2026-03-01" }, "2030-01-01")).toBe(true)
  })
})

describe("montoDelMes", () => {
  it("usa el monto puntual del mes si existe y si no el base", () => {
    const montos = new Map([["luz", new Map([["2026-10-01", 48000]])]])
    const luz = { id: "luz", monto: 40000 }
    expect(montoDelMes(luz, "2026-10-01", montos)).toBe(48000)
    expect(montoDelMes(luz, "2026-11-01", montos)).toBe(40000)
    expect(montoDelMes({ id: "alquiler", monto: 300000 }, "2026-10-01", montos)).toBe(300000)
  })
})
