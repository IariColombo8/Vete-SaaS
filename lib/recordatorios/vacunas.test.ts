import { describe, expect, it } from "vitest"
import {
  diasHasta,
  fechaArgentina,
  fechaCorta,
  linkRecordatorio,
  mensajeRecordatorio,
  rangoCron,
  sumarDias,
  textoVencimiento,
  type DatosMensajeRecordatorio,
} from "./vacunas"

const datos: DatosMensajeRecordatorio = {
  clienteNombre: "María José Pérez",
  mascotaNombre: "Firulais",
  vacuna: "Antirrábica",
  tipo: "vacuna",
  fecha: "2026-10-20",
  veterinaria: "VipVet",
  urlTurno: "https://www.vetpanel.com.ar/vipvet/turno",
}

describe("fechas", () => {
  it("usa la fecha de Argentina, no la UTC", () => {
    // 01:00 UTC del 17 = 22:00 del 16 en Argentina
    expect(fechaArgentina(new Date("2026-10-17T01:00:00Z"))).toBe("2026-10-16")
    expect(fechaArgentina(new Date("2026-10-17T12:00:00Z"))).toBe("2026-10-17")
  })

  it("suma días cruzando meses y años", () => {
    expect(sumarDias("2026-10-30", 7)).toBe("2026-11-06")
    expect(sumarDias("2026-12-30", 3)).toBe("2027-01-02")
    expect(sumarDias("2026-03-02", -3)).toBe("2026-02-27")
  })

  it("cuenta días hasta una fecha", () => {
    expect(diasHasta("2026-10-20", "2026-10-16")).toBe(4)
    expect(diasHasta("2026-10-16", "2026-10-16")).toBe(0)
    expect(diasHasta("2026-10-13", "2026-10-16")).toBe(-3)
  })

  it("el rango del cron incluye las vencidas hace pocos días", () => {
    // Si el cron no corrió algún día, lo que quedó atrás se manda igual.
    expect(rangoCron(new Date("2026-10-16T12:00:00Z"))).toEqual({ desde: "2026-10-13", hasta: "2026-10-23" })
    expect(rangoCron(new Date("2026-10-16T12:00:00Z"), 3)).toEqual({ desde: "2026-10-13", hasta: "2026-10-19" })
  })

  it("formatea fecha corta y texto de vencimiento", () => {
    expect(fechaCorta("2026-11-05")).toBe("05/11")
    expect(textoVencimiento("2026-10-16", "2026-10-16")).toBe("vence hoy")
    expect(textoVencimiento("2026-10-17", "2026-10-16")).toBe("vence mañana")
    expect(textoVencimiento("2026-10-21", "2026-10-16")).toBe("vence en 5 días")
    expect(textoVencimiento("2026-10-15", "2026-10-16")).toBe("venció ayer")
    expect(textoVencimiento("2026-10-10", "2026-10-16")).toBe("venció hace 6 días")
  })
})

describe("mensaje de WhatsApp", () => {
  it("saluda por el primer nombre e incluye vacuna, fecha, turno y veterinaria", () => {
    const m = mensajeRecordatorio(datos, "2026-10-16")
    expect(m).toContain("¡Hola María!")
    expect(m).toContain("a Firulais le toca la vacuna Antirrábica el 20/10")
    expect(m).toContain("https://www.vetpanel.com.ar/vipvet/turno")
    expect(m.trim().endsWith("VipVet")).toBe(true)
  })

  it("cambia el texto si ya venció", () => {
    expect(mensajeRecordatorio(datos, "2026-10-25")).toContain("A Firulais le tocaba la vacuna Antirrábica el 20/10.")
  })

  it("nombra la desparasitación como tal", () => {
    const m = mensajeRecordatorio({ ...datos, tipo: "desparasitacion", vacuna: "Bravecto" }, "2026-10-16")
    expect(m).toContain("le toca la desparasitación (Bravecto)")
  })

  it("sin nombre ni URL de turno sigue armando un mensaje usable", () => {
    const m = mensajeRecordatorio({ ...datos, clienteNombre: "", urlTurno: undefined }, "2026-10-16")
    expect(m.startsWith("¡Hola!")).toBe(true)
    expect(m).toContain("Escribinos para coordinar el turno.")
  })

  it("arma el link de wa.me con el teléfono normalizado", () => {
    expect(linkRecordatorio("0351 155-123456", datos, "2026-10-16")).toMatch(/^https:\/\/wa\.me\/54351155123456\?text=/)
    expect(linkRecordatorio("", datos, "2026-10-16")).toMatch(/^https:\/\/wa\.me\/\?text=/)
  })
})
