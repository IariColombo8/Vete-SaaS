import { describe, it, expect } from "vitest"
import { inicioDebito } from "./dia-debito"

// Día D de octubre 2026 a las 12:00 de Argentina.
const dia = (d: number) => new Date(`2026-10-${String(d).padStart(2, "0")}T15:00:00Z`)

describe("inicioDebito", () => {
  it("mes en curso impago, del 1 al 10: cobra ya", () => {
    expect(inicioDebito(dia(1), "2026-10-01")).toBeNull()
    expect(inicioDebito(dia(10), "2026-10-01")).toBeNull()
  })

  it("mes en curso impago, después del 10: arranca el 1 del mes que viene", () => {
    expect(inicioDebito(dia(11), "2026-10-01")).toBe("2026-11-01T09:00:00.000-03:00")
    expect(inicioDebito(dia(31), "2026-10-01")).toBe("2026-11-01T09:00:00.000-03:00")
  })

  it("mes en curso cubierto: arranca el 1 del primer mes impago", () => {
    expect(inicioDebito(dia(3), "2026-11-01")).toBe("2026-11-01T09:00:00.000-03:00")
    expect(inicioDebito(dia(20), "2027-01-01")).toBe("2027-01-01T09:00:00.000-03:00")
  })

  it("diciembre pasa a enero del año siguiente", () => {
    expect(inicioDebito(new Date("2026-12-15T15:00:00Z"), "2026-12-01")).toBe("2027-01-01T09:00:00.000-03:00")
  })
})
