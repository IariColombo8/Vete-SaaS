import { describe, expect, it } from "vitest"
import type { Caja } from "@/lib/supabase/types"
import { generarCajaPDF } from "./caja-pdf"

function caja(over: Partial<Caja> = {}): Caja {
  return {
    id: "c1",
    estado: "cerrada",
    saldoInicial: 10000,
    saldoDeclarado: 50000,
    saldoEsperado: 50000,
    diferencia: 0,
    totalEfectivo: 120000,
    totalOtros: 0,
    totalVentas: 120000,
    cantidadVentas: 3,
    totalGastos: 80000,
    abiertaPorNombre: "Ana",
    cerradaPorNombre: "Ana",
    observaciones: "",
    aperturaAt: "2026-10-16T12:00:00.000Z",
    cierreAt: "2026-10-16T22:00:00.000Z",
    ...over,
  }
}

/** Textos que el PDF escribe con el operador Tj, sin comprimir. */
function textosDelPdf(c: Caja): string[] {
  const doc = generarCajaPDF(c, [], { nombre: "Veterinaria de prueba" })
  return doc
    .output()
    .split("\n")
    .filter((l) => l.endsWith(" Tj"))
    .map((l) => l.slice(l.indexOf("(") + 1, l.lastIndexOf(")")))
}

describe("generarCajaPDF", () => {
  it("escribe los gastos de la caja con caracteres que la fuente conoce", () => {
    const textos = textosDelPdf(caja())
    const gastos = textos.find((t) => t.includes("80.000"))
    // Con un carácter fuera de la fuente (el signo "−"), jsPDF escribe cada
    // letra separada por espacios ("8 0 . 0 0 0") y el monto se sale del margen.
    expect(gastos).toBeDefined()
    expect(gastos).toMatch(/^- \$\s?80\.000/)
  })
})
