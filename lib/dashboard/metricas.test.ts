import { describe, expect, it } from "vitest"
import {
  claveDia,
  contarMascotasUnicas,
  mascotasPorEspecie,
  resumenEstados,
  serieHorarios,
  serieUltimosDias,
  serieUltimosMeses,
  tasaPorcentaje,
  inicioVentana,
  primerDiaDelMes,
  resumenVentas,
  serieVentasUltimosDias,
} from "./metricas"

const hoy = new Date(2026, 9, 12) // 12 de octubre de 2026

describe("serieUltimosDias", () => {
  it("devuelve exactamente N días en orden cronológico terminando hoy", () => {
    const serie = serieUltimosDias([], 30, hoy)
    expect(serie).toHaveLength(30)
    expect(serie[0].clave).toBe("2026-09-13")
    expect(serie[29].clave).toBe("2026-10-12")
    expect(serie.every((p) => p.cantidad === 0)).toBe(true)
  })

  it("cuenta los turnos aunque lleguen del más nuevo al más viejo", () => {
    const fechas = ["2026-10-12", "2026-10-12", "2026-10-10", "2026-09-01", "2026-10-20"]
    const serie = serieUltimosDias(fechas, 30, hoy)
    const porClave = Object.fromEntries(serie.map((p) => [p.clave, p.cantidad]))
    expect(porClave["2026-10-12"]).toBe(2)
    expect(porClave["2026-10-10"]).toBe(1)
    expect(porClave["2026-10-11"]).toBe(0)
    // fuera de la ventana: ni el viejo ni el futuro
    expect(porClave["2026-09-01"]).toBeUndefined()
    expect(porClave["2026-10-20"]).toBeUndefined()
  })

  it("cruza el cambio de mes sin pasar por UTC", () => {
    const serie = serieUltimosDias([], 3, new Date(2026, 2, 1)) // 1 de marzo
    expect(serie.map((p) => p.clave)).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"])
  })
})

describe("serieUltimosMeses", () => {
  it("separa el mismo mes de años distintos y rellena con ceros", () => {
    const fechas = ["2025-10-05", "2026-10-01", "2026-10-02", "2026-07-15"]
    const serie = serieUltimosMeses(fechas, 6, hoy)
    expect(serie.map((p) => p.clave)).toEqual([
      "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ])
    expect(serie.map((p) => p.cantidad)).toEqual([0, 0, 1, 0, 0, 2])
  })

  it("agrega el año a la etiqueta solo cuando la ventana cruza de año", () => {
    const sinCruce = serieUltimosMeses([], 6, hoy)
    expect(sinCruce.every((p) => !/\d{2}$/.test(p.etiqueta))).toBe(true)

    const conCruce = serieUltimosMeses([], 6, new Date(2026, 1, 10)) // febrero
    expect(conCruce[0].clave).toBe("2025-09")
    expect(conCruce.every((p) => /\d{2}$/.test(p.etiqueta))).toBe(true)
  })
})

describe("serieHorarios", () => {
  it("cubre de 08:00 a 20:00 aunque no haya turnos", () => {
    const serie = serieHorarios([])
    expect(serie[0].clave).toBe("08:00")
    expect(serie[serie.length - 1].clave).toBe("20:00")
    expect(serie).toHaveLength(13)
  })

  it("agrupa por hora entera y extiende el rango si hay turnos afuera", () => {
    const serie = serieHorarios(["09:30", "09:00", "21:15", "07:00"])
    expect(serie[0].clave).toBe("07:00")
    expect(serie[serie.length - 1].clave).toBe("21:00")
    const porClave = Object.fromEntries(serie.map((p) => [p.clave, p.cantidad]))
    expect(porClave["09:00"]).toBe(2)
    expect(porClave["21:00"]).toBe(1)
    expect(porClave["07:00"]).toBe(1)
  })

  it("ignora horas inválidas", () => {
    expect(serieHorarios(["", "abc"])).toHaveLength(13)
  })
})

describe("claveDia", () => {
  it("usa la fecha local con dos dígitos", () => {
    expect(claveDia(new Date(2026, 0, 5))).toBe("2026-01-05")
  })
})

describe("resumenEstados", () => {
  it("cuenta los confirmados y los suma como por atender", () => {
    const r = resumenEstados(["pendiente", "confirmado", "confirmado", "completado", "cancelado", "raro"])
    expect(r).toEqual({
      pendiente: 1, confirmado: 2, completado: 1, cancelado: 1, porAtender: 3, resueltos: 2,
    })
  })
})

describe("tasaPorcentaje", () => {
  it("mide sobre la base dada y no explota con base cero", () => {
    expect(tasaPorcentaje(1, 2)).toBe("50.0")
    expect(tasaPorcentaje(0, 0)).toBe("0.0")
  })
})

describe("mascotas", () => {
  const mascotas = [
    { id: "a", nombre: "Toby", tipo: "Perro" },
    { id: "a", nombre: "Toby", tipo: "perro" }, // mismo perro, segundo turno
    { id: "b", nombre: "Toby", tipo: "perro" }, // otro perro con el mismo nombre
    { nombre: "Michi", tipo: "Gato" }, // turno viejo sin id
    { nombre: "michi ", tipo: "gato" }, // el mismo gato
    { id: "c", nombre: "", tipo: "" }, // sin especie: no entra al gráfico
  ]

  it("cuenta mascotas distintas por id y, si no hay id, por nombre", () => {
    expect(contarMascotasUnicas(mascotas)).toBe(4)
  })

  it("agrupa por especie contando mascotas, no turnos", () => {
    expect(mascotasPorEspecie(mascotas)).toEqual([
      { clave: "perro", etiqueta: "Perro", cantidad: 2 },
      { clave: "gato", etiqueta: "Gato", cantidad: 1 },
    ])
  })
})

describe("ventas", () => {
  const porDia = [
    { fecha: "2026-09-10", total: 1000, ventas: 1 }, // fuera de los 30 días
    { fecha: "2026-09-30", total: 5000, ventas: 2 }, // en los 30 días, mes anterior
    { fecha: "2026-10-03", total: 8000, ventas: 4 },
    { fecha: "2026-10-12", total: 2000, ventas: 1 }, // hoy
  ]

  it("inicioVentana y primerDiaDelMes", () => {
    expect(inicioVentana(30, hoy)).toBe("2026-09-13")
    expect(primerDiaDelMes(hoy)).toBe("2026-10-01")
  })

  it("serieVentasUltimosDias rellena con ceros y respeta la ventana", () => {
    const serie = serieVentasUltimosDias(porDia, 30, hoy)
    expect(serie).toHaveLength(30)
    const porClave = Object.fromEntries(serie.map((p) => [p.clave, p]))
    expect(porClave["2026-09-30"].total).toBe(5000)
    expect(porClave["2026-09-30"].ventas).toBe(2)
    expect(porClave["2026-10-11"].total).toBe(0)
    expect(porClave["2026-09-10"]).toBeUndefined()
  })

  it("resumenVentas separa hoy, mes y últimos 30 días", () => {
    const r = resumenVentas(porDia, hoy)
    expect(r.hoy).toEqual({ total: 2000, ventas: 1 })
    expect(r.mes).toEqual({ total: 10000, ventas: 5, ticketPromedio: 2000 })
    expect(r.ultimos30).toEqual({ total: 15000, ventas: 7 })
    expect(r.mejorDiaMes?.fecha).toBe("2026-10-03")
  })

  it("resumenVentas sin ventas no divide por cero", () => {
    const r = resumenVentas([], hoy)
    expect(r.mes.ticketPromedio).toBe(0)
    expect(r.mejorDiaMes).toBeNull()
  })
})
