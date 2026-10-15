import { describe, it, expect } from "vitest"
import {
  planAllows, getPlanLimits, normalizePlan, getPlan, getTrialStatus,
  filaAPlan, planAFila, registrarPlanes, getPlanList, PLANES_BASE,
} from "./plans"

describe("normalizePlan", () => {
  it("acepta planes válidos", () => {
    expect(normalizePlan("pro")).toBe("pro")
    expect(normalizePlan("pro")).toBe("pro")
    expect(normalizePlan("basico")).toBe("basico")
  })

  it("plus (plan eliminado) se trata como pro", () => {
    expect(normalizePlan("plus")).toBe("pro")
  })

  it("cae a básico ante valores inválidos o vacíos", () => {
    expect(normalizePlan(undefined)).toBe("basico")
    expect(normalizePlan(null)).toBe("basico")
    expect(normalizePlan("enterprise")).toBe("basico")
  })
})

describe("planAllows", () => {
  it("básico no tiene WhatsApp, métricas ni comercio", () => {
    expect(planAllows("basico", "whatsapp")).toBe(false)
    expect(planAllows("basico", "analytics")).toBe(false)
    expect(planAllows("basico", "productos")).toBe(false)
    expect(planAllows("basico", "ventas")).toBe(false)
  })

  it("básico incluye libreta en PDF, QR por mascota y más de un usuario", () => {
    expect(planAllows("basico", "pdfLibreta")).toBe(true)
    expect(planAllows("basico", "qrMascota")).toBe(true)
    expect(planAllows("basico", "multiUsuario")).toBe(true)
  })

  it("básico no promete recordatorios de vacunas: salen por WhatsApp", () => {
    expect(planAllows("basico", "recordatoriosVacunas")).toBe(planAllows("basico", "whatsapp"))
  })

  it("básico tampoco tiene facturación ni Point", () => {
    expect(planAllows("basico", "facturacionElectronica")).toBe(false)
    expect(planAllows("basico", "mercadoPagoPoint")).toBe(false)
  })

  it("pro habilita todo", () => {
    expect(planAllows("pro", "qrMascota")).toBe(true)
    expect(planAllows("pro", "multipleProfesionales")).toBe(true)
    expect(planAllows("pro", "recordatoriosVacunas")).toBe(true)
    expect(planAllows("pro", "facturacionElectronica")).toBe(true)
    expect(planAllows("pro", "mercadoPagoPoint")).toBe(true)
  })
})

describe("getPlanLimits", () => {
  it("básico tiene turnos ilimitados y hasta 2 usuarios", () => {
    expect(getPlanLimits("basico")).toEqual({ maxTurnosMes: null, maxUsuarios: 2 })
  })

  it("pro es ilimitado (null)", () => {
    const limits = getPlanLimits("pro")
    expect(limits.maxTurnosMes).toBeNull()
    expect(limits.maxUsuarios).toBeNull()
  })
})

describe("getPlan", () => {
  it("devuelve la definición con nombre y precio", () => {
    expect(getPlan("pro").nombre).toBe("Pro")
    expect(getPlan("pro").precioMensual).toBeGreaterThan(0)
    expect(getPlan("basico").precioMensual).toBe(50000)
    expect(getPlan("pro").precioMensual).toBe(80000)
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

describe("catálogo editable", () => {
  it("filaAPlan y planAFila son inversas y descartan features desconocidas", () => {
    const fila = {
      id: "premium", nombre: "Premium", descripcion: "Para cadenas", precio_mensual: "120000.00",
      max_turnos_mes: null, max_usuarios: 10, features: ["ventas", "inexistente"],
      highlights: ["Todo Pro"], orden: 30, visible: false,
    }
    const plan = filaAPlan(fila)
    expect(plan.precioMensual).toBe(120000)
    expect(plan.features.ventas).toBe(true)
    expect(plan.features.whatsapp).toBe(false)
    expect(planAFila(plan)).toEqual({ ...fila, precio_mensual: 120000, features: ["ventas"] })
  })

  it("un plan registrado se reconoce; los ocultos no salen en la lista pública", () => {
    const premium = filaAPlan({ id: "premium", nombre: "Premium", precio_mensual: 1, features: ["whatsapp"], visible: false })
    registrarPlanes([...PLANES_BASE, premium])
    expect(normalizePlan("premium")).toBe("premium")
    expect(planAllows("premium", "whatsapp")).toBe(true)
    expect(getPlanList().map((p) => p.id)).toEqual(["basico", "pro"])
    expect(getPlanList({ incluirOcultos: true }).map((p) => p.id)).toContain("premium")
    registrarPlanes(PLANES_BASE)
  })

  it("una lista vacía no borra el catálogo", () => {
    registrarPlanes([])
    expect(getPlan("pro").nombre).toBe("Pro")
  })
})
