import { describe, it, expect } from "vitest"
import { llevaPie } from "./pie-vetpanel"

describe("llevaPie", () => {
  it("aparece en las páginas públicas internas de la veterinaria", () => {
    expect(llevaPie("/vipvet/turno", "vipvet")).toBe(true)
    expect(llevaPie("/vipvet/productos", "vipvet")).toBe(true)
    expect(llevaPie("/vipvet/mi-historia", "vipvet")).toBe(true)
    expect(llevaPie("/vipvet/mi-historia/123/firulais", "vipvet")).toBe(true)
    expect(llevaPie("/vipvet/cliente", "vipvet")).toBe(true)
  })

  // La principal ya tiene el footer grande con ServiTec: dos pies serían ruido.
  it("no aparece en la página principal", () => {
    expect(llevaPie("/vipvet", "vipvet")).toBe(false)
    expect(llevaPie("/vipvet/", "vipvet")).toBe(false)
  })

  it("no aparece en el panel ni en el onboarding de la veterinaria", () => {
    expect(llevaPie("/vipvet/admin/Dashboard", "vipvet")).toBe(false)
    expect(llevaPie("/vipvet/admin", "vipvet")).toBe(false)
    expect(llevaPie("/vipvet/onboarding", "vipvet")).toBe(false)
  })

  it("no aparece en la libreta pública, que lleva la firma adentro", () => {
    expect(llevaPie("/vipvet/libreta/abc123", "vipvet")).toBe(false)
  })

  it("no confunde una ruta que empieza igual que admin", () => {
    expect(llevaPie("/vipvet/administracion", "vipvet")).toBe(true)
  })
})
