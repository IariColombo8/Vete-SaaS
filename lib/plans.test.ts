import { describe, it, expect } from "vitest"
import { planAllows, getPlanLimits, normalizePlan, getPlan } from "./plans"

describe("normalizePlan", () => {
  it("acepta planes válidos", () => {
    expect(normalizePlan("plus")).toBe("plus")
    expect(normalizePlan("pro")).toBe("pro")
    expect(normalizePlan("basico")).toBe("basico")
  })

  it("cae a básico ante valores inválidos o vacíos", () => {
    expect(normalizePlan(undefined)).toBe("basico")
    expect(normalizePlan(null)).toBe("basico")
    expect(normalizePlan("enterprise")).toBe("basico")
  })
})

describe("planAllows", () => {
  it("básico no tiene features pagas", () => {
    expect(planAllows("basico", "whatsapp")).toBe(false)
    expect(planAllows("basico", "analytics")).toBe(false)
  })

  it("plus habilita whatsapp y analytics pero no qrMascota", () => {
    expect(planAllows("plus", "whatsapp")).toBe(true)
    expect(planAllows("plus", "analytics")).toBe(true)
    expect(planAllows("plus", "qrMascota")).toBe(false)
  })

  it("pro habilita todo", () => {
    expect(planAllows("pro", "qrMascota")).toBe(true)
    expect(planAllows("pro", "multipleProfesionales")).toBe(true)
    expect(planAllows("pro", "recordatoriosVacunas")).toBe(true)
  })
})

describe("getPlanLimits", () => {
  it("básico limita a 10 turnos/mes y 1 usuario", () => {
    expect(getPlanLimits("basico")).toEqual({ maxTurnosMes: 10, maxUsuarios: 1 })
  })

  it("pro es ilimitado (null)", () => {
    const limits = getPlanLimits("pro")
    expect(limits.maxTurnosMes).toBeNull()
    expect(limits.maxUsuarios).toBeNull()
  })
})

describe("getPlan", () => {
  it("devuelve la definición con nombre y precio", () => {
    expect(getPlan("plus").nombre).toBe("Plus")
    expect(getPlan("plus").precioMensual).toBeGreaterThan(0)
    expect(getPlan("basico").precioMensual).toBe(0)
  })
})
