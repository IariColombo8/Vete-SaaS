import { describe, expect, it } from "vitest"
import { asuntoRecordatorio, escapeHtml, fechaLarga, htmlRecordatorio, type DatosEmailRecordatorio } from "./email"

const datos: DatosEmailRecordatorio = {
  clienteNombre: "María José Pérez",
  mascotaNombre: "Firulais",
  vacuna: "Antirrábica",
  tipo: "vacuna",
  fecha: "2026-12-23",
  veterinaria: "VipVet",
  urlTurno: "https://www.vetpanel.com.ar/vipvet/turno",
  telefonoVeterinaria: "3442 123456",
}

describe("email de recordatorio", () => {
  it("formatea la fecha larga", () => {
    expect(fechaLarga("2026-12-23")).toBe("23 de diciembre")
    expect(fechaLarga("2027-01-05")).toBe("5 de enero")
  })

  it("arma el asunto según esté por vencer o vencida", () => {
    expect(asuntoRecordatorio(datos, "2026-12-20")).toBe("Recordatorio: vacuna Antirrábica de Firulais — VipVet")
    expect(asuntoRecordatorio(datos, "2026-12-28")).toBe("Firulais: quedó pendiente la vacuna Antirrábica — VipVet")
    expect(asuntoRecordatorio({ ...datos, tipo: "desparasitacion", vacuna: "Bravecto" }, "2026-12-20"))
      .toBe("Recordatorio: desparasitación Bravecto de Firulais — VipVet")
  })

  it("incluye saludo, mascota, vacuna, fecha, botón de turno y contacto", () => {
    const html = htmlRecordatorio(datos, "2026-12-20")
    expect(html).toContain("Hola <strong>María</strong>")
    expect(html).toContain("le toca la vacuna <strong>Antirrábica</strong> el <strong>23 de diciembre</strong>")
    expect(html).toContain('href="https://www.vetpanel.com.ar/vipvet/turno"')
    expect(html).toContain("3442 123456")
  })

  it("cambia el texto si ya venció", () => {
    expect(htmlRecordatorio(datos, "2026-12-28")).toContain("le tocaba la vacuna")
  })

  it("escapa lo que carga la veterinaria o el cliente", () => {
    const html = htmlRecordatorio({ ...datos, mascotaNombre: "<script>x</script>", veterinaria: 'Vet "A&B"' }, "2026-12-20")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("Vet &quot;A&amp;B&quot;")
    expect(escapeHtml("O'Neil")).toBe("O&#39;Neil")
  })

  it("sin nombre ni URL de turno sigue siendo un email usable", () => {
    const html = htmlRecordatorio({ ...datos, clienteNombre: "", urlTurno: undefined }, "2026-12-20")
    expect(html).toContain("Hola, te recordamos")
    expect(html).not.toContain("Sacar turno")
  })
})
