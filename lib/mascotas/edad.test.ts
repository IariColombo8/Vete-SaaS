import { describe, it, expect } from "vitest"
import { calcularEdadActual, formatearEdad } from "./edad"

describe("calcularEdadActual", () => {
  it("suma los meses transcurridos cuando la edad registrada esta en meses", () => {
    // Nix: 8 meses registrados el 1/1, turno el 1/3 -> +2 meses = 10 meses
    const resultado = calcularEdadActual(
      { valor: 8, unidad: "meses", registradaEn: "2026-01-01" },
      new Date("2026-03-01"),
    )
    expect(resultado).toEqual({ valor: 10, unidad: "meses" })
  })

  it("pasa a anios cuando el total llega a 12 meses", () => {
    const resultado = calcularEdadActual(
      { valor: 8, unidad: "meses", registradaEn: "2026-01-01" },
      new Date("2026-05-01"), // +4 meses = 12
    )
    expect(resultado).toEqual({ valor: 1, unidad: "anios" })
  })

  it("suma los anios transcurridos cuando la edad registrada esta en anios", () => {
    const resultado = calcularEdadActual(
      { valor: 2, unidad: "anios", registradaEn: "2024-01-01" },
      new Date("2026-01-01"),
    )
    expect(resultado).toEqual({ valor: 4, unidad: "anios" })
  })

  it("no resta edad si el turno cae antes de la fecha de registro", () => {
    const resultado = calcularEdadActual(
      { valor: 8, unidad: "meses", registradaEn: "2026-03-01" },
      new Date("2026-01-01"),
    )
    expect(resultado).toEqual({ valor: 8, unidad: "meses" })
  })

  it("devuelve null si no hay edad registrada", () => {
    expect(calcularEdadActual(null, new Date())).toBeNull()
  })
})

describe("formatearEdad", () => {
  it("formatea meses en singular", () => {
    expect(formatearEdad({ valor: 1, unidad: "meses" })).toBe("1 mes")
  })

  it("formatea meses en plural", () => {
    expect(formatearEdad({ valor: 10, unidad: "meses" })).toBe("10 meses")
  })

  it("formatea anios en singular", () => {
    expect(formatearEdad({ valor: 1, unidad: "anios" })).toBe("1 año")
  })

  it("formatea anios en plural", () => {
    expect(formatearEdad({ valor: 4, unidad: "anios" })).toBe("4 años")
  })
})
