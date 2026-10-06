import { describe, it, expect } from "vitest"
import { resumenHistoriasPublicas, MAX_HISTORIAS_PUBLICAS } from "./resumen-publico"
import type { Historia } from "@/lib/supabase/types"

const historia = (extra: Partial<Historia>): Historia => ({
  fechaAtencion: "2026-09-01",
  diagnostico: "Sano",
  tratamiento: "Ninguno",
  ...extra,
})

describe("resumenHistoriasPublicas", () => {
  it("no expone las notas marcadas como privadas", () => {
    const r = resumenHistoriasPublicas([
      historia({ motivo: "Control", esPrivada: false }),
      historia({ motivo: "Nota interna", diagnostico: "Sospecha de maltrato", esPrivada: true }),
    ])
    expect(r.map((h) => h.motivo)).toEqual(["Control"])
    expect(JSON.stringify(r)).not.toContain("maltrato")
  })

  it("deja afuera los turnos programados, que no son atenciones", () => {
    const r = resumenHistoriasPublicas([historia({ tipoVisita: "turno_programado", esPrivada: false })])
    expect(r).toEqual([])
  })

  it("trata como visible una nota sin el campo de privacidad (entradas viejas)", () => {
    const r = resumenHistoriasPublicas([historia({ motivo: undefined })])
    expect(r).toEqual([{ fecha: "2026-09-01", motivo: "Consulta", diagnostico: "Sano", tratamiento: "Ninguno" }])
  })

  it("corta en el máximo después de filtrar, no antes", () => {
    const privadas = Array.from({ length: MAX_HISTORIAS_PUBLICAS }, () => historia({ esPrivada: true }))
    const r = resumenHistoriasPublicas([...privadas, historia({ motivo: "Visible", esPrivada: false })])
    expect(r.map((h) => h.motivo)).toEqual(["Visible"])
  })
})
