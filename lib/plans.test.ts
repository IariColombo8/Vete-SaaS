import { describe, it, expect } from "vitest"
import { planAllows, getPlanLimits, normalizePlan, getPlan, getTrialStatus } from "./plans"

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

describe("getTrialStatus", () => {
  it("sin trial_expires_at: no está en trial", () => {
    const status = getTrialStatus({ trialExpiresAt: undefined })
    expect(status).toEqual({ enTrial: false, vencido: false, diasRestantes: null })
  })

  it("con vencimiento futuro: en trial, no vencido", () => {
    const futuro = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
    const status = getTrialStatus({ trialExpiresAt: futuro })
    expect(status.enTrial).toBe(true)
    expect(status.vencido).toBe(false)
    expect(status.diasRestantes).toBeGreaterThanOrEqual(4)
    expect(status.diasRestantes).toBeLessThanOrEqual(5)
  })

  it("con vencimiento pasado: en trial y vencido", () => {
    const pasado = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const status = getTrialStatus({ trialExpiresAt: pasado })
    expect(status.enTrial).toBe(true)
    expect(status.vencido).toBe(true)
    expect(status.diasRestantes).toBe(0)
  })
})
