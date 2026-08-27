import { describe, it, expect } from "vitest"
import { promocionVigente } from "./promociones"
import type { Promocion } from "./types"

function promo(overrides: Partial<Promocion> = {}): Promocion {
  return {
    id: "1", nombre: "Test", precioFinal: 100, activa: true, items: [],
    ...overrides,
  }
}

describe("promocionVigente", () => {
  it("es vigente sin fechas si esta activa", () => {
    expect(promocionVigente(promo(), new Date("2026-06-01"))).toBe(true)
  })

  it("no es vigente si esta desactivada", () => {
    expect(promocionVigente(promo({ activa: false }), new Date("2026-06-01"))).toBe(false)
  })

  it("no es vigente antes de 'desde'", () => {
    expect(promocionVigente(promo({ desde: "2026-06-10" }), new Date("2026-06-01"))).toBe(false)
  })

  it("no es vigente despues de 'hasta' (incluye todo el dia)", () => {
    expect(promocionVigente(promo({ hasta: "2026-06-01" }), new Date("2026-06-01T23:00:00"))).toBe(true)
    expect(promocionVigente(promo({ hasta: "2026-06-01" }), new Date("2026-06-02T00:00:01"))).toBe(false)
  })
})
