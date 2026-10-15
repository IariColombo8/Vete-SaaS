import { describe, it, expect } from "vitest"
import { diaArgentina, haceCuanto, resumirActividad, ultimosDias, type FilaActividad } from "./actividad"

// 15 oct 2026, 15:00 en Argentina (18:00 UTC)
const ahora = new Date("2026-10-15T18:00:00Z")

const fila = (usuarioId: string, tenantId: string, dia: string, aperturas = 1): FilaActividad => ({
  usuarioId, tenantId, dia, aperturas, ultima: `${dia}T15:00:00Z`,
})

describe("días en hora de Argentina", () => {
  it("las 23:30 de Argentina siguen siendo ese día aunque en UTC ya sea el siguiente", () => {
    expect(diaArgentina(new Date("2026-10-16T02:30:00Z"))).toBe("2026-10-15")
  })

  it("ultimosDias termina hoy, del más viejo al más nuevo", () => {
    expect(ultimosDias(ahora, 3)).toEqual(["2026-10-13", "2026-10-14", "2026-10-15"])
  })
})

describe("resumirActividad", () => {
  const filas = [
    fila("u1", "vipvet", "2026-10-15", 3),
    fila("u1", "vipvet", "2026-10-14", 2),
    fila("u1", "vipvet", "2026-09-01", 9), // fuera de la ventana de 30 días
    fila("u2", "vipvet", "2026-10-14", 1),
    fila("u3", "mundoanimal", "2026-10-01", 4),
  ]

  it("cuenta días distintos y aperturas dentro de la ventana, por usuario", () => {
    const { porUsuario } = resumirActividad(filas, ahora)
    expect(porUsuario.u1.diasActivos).toBe(2)
    expect(porUsuario.u1.aperturas).toBe(5)
    expect(porUsuario.u1.ultima).toBe("2026-10-15T15:00:00Z")
    expect(porUsuario.u1.dias.at(-1)).toBe(true)
    expect(porUsuario.u1.dias).toHaveLength(30)
  })

  it("por veterinaria, dos usuarios el mismo día cuentan como un día", () => {
    const { porTenant } = resumirActividad(filas, ahora)
    expect(porTenant.vipvet.diasActivos).toBe(2)
    expect(porTenant.vipvet.aperturas).toBe(6)
    expect(porTenant.mundoanimal.diasActivos).toBe(1)
  })
})

describe("haceCuanto", () => {
  it("hoy, ayer y hace N días", () => {
    expect(haceCuanto("2026-10-15T13:05:00Z", ahora)).toBe("Hoy 10:05")
    expect(haceCuanto("2026-10-14T13:05:00Z", ahora)).toMatch(/^Ayer/)
    expect(haceCuanto("2026-10-10T13:05:00Z", ahora)).toBe("Hace 5 días")
    expect(haceCuanto(null, ahora)).toBe("Sin registro")
  })
})
