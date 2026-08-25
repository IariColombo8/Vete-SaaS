import { describe, it, expect } from "vitest"
import {
  tieneOferta,
  precioFinal,
  ahorroOferta,
  precioLinea,
  comboLabel,
  margenPct,
  calcularPrecioConMargen,
  estadoStock,
  diasHastaVencimiento,
} from "./precios"

const base = { precio: 1000 }

describe("tieneOferta", () => {
  it("es falso sin oferta activa", () => {
    expect(tieneOferta(base)).toBe(false)
    expect(tieneOferta({ ...base, ofertaActiva: false, ofertaTipo: "monto", ofertaValor: 100 })).toBe(false)
  })

  it("es falso si la oferta está activa pero sin valor", () => {
    expect(tieneOferta({ ...base, ofertaActiva: true, ofertaTipo: "monto", ofertaValor: 0 })).toBe(false)
  })

  it("rechaza un porcentaje de 100 o más", () => {
    expect(tieneOferta({ ...base, ofertaActiva: true, ofertaTipo: "porcentaje", ofertaValor: 100 })).toBe(false)
    expect(tieneOferta({ ...base, ofertaActiva: true, ofertaTipo: "porcentaje", ofertaValor: 99 })).toBe(true)
  })

  it("un combo necesita cantidad mayor a 1", () => {
    expect(tieneOferta({ ...base, ofertaActiva: true, ofertaTipo: "combo", ofertaValor: 1500, ofertaCantidad: 1 })).toBe(false)
    expect(tieneOferta({ ...base, ofertaActiva: true, ofertaTipo: "combo", ofertaValor: 1500, ofertaCantidad: 2 })).toBe(true)
  })
})

describe("precioFinal", () => {
  it("devuelve el precio de lista sin oferta", () => {
    expect(precioFinal(base)).toBe(1000)
  })

  it("descuenta un monto fijo", () => {
    expect(precioFinal({ ...base, ofertaActiva: true, ofertaTipo: "monto", ofertaValor: 250 })).toBe(750)
  })

  it("descuenta un porcentaje", () => {
    expect(precioFinal({ ...base, ofertaActiva: true, ofertaTipo: "porcentaje", ofertaValor: 15 })).toBe(850)
  })

  it("nunca baja de cero aunque el descuento supere el precio", () => {
    expect(precioFinal({ ...base, ofertaActiva: true, ofertaTipo: "monto", ofertaValor: 5000 })).toBe(0)
  })

  it("redondea a dos decimales", () => {
    expect(precioFinal({ precio: 999.99, ofertaActiva: true, ofertaTipo: "porcentaje", ofertaValor: 33 })).toBe(669.99)
  })

  it("en un combo devuelve el precio de lista", () => {
    expect(
      precioFinal({ ...base, ofertaActiva: true, ofertaTipo: "combo", ofertaValor: 2500, ofertaCantidad: 3 }),
    ).toBe(1000)
  })
})

describe("ahorroOferta", () => {
  it("es la diferencia contra el precio de lista", () => {
    expect(ahorroOferta({ ...base, ofertaActiva: true, ofertaTipo: "monto", ofertaValor: 250 })).toBe(250)
  })

  it("es cero sin oferta", () => {
    expect(ahorroOferta(base)).toBe(0)
  })
})

describe("precioLinea", () => {
  it("multiplica el precio final por la cantidad", () => {
    expect(precioLinea({ ...base, ofertaActiva: true, ofertaTipo: "monto", ofertaValor: 200 }, 3)).toBe(2400)
  })

  it("es cero para cantidad cero o negativa", () => {
    expect(precioLinea(base, 0)).toBe(0)
    expect(precioLinea(base, -2)).toBe(0)
  })

  it("aplica el combo y cobra las unidades sueltas a precio de lista", () => {
    // 3x$2500, llevando 7 → 2 combos (5000) + 1 suelta (1000)
    const combo = { ...base, ofertaActiva: true, ofertaTipo: "combo" as const, ofertaValor: 2500, ofertaCantidad: 3 }
    expect(precioLinea(combo, 7)).toBe(6000)
  })

  it("cobra a precio de lista si no se completa ni un combo", () => {
    const combo = { ...base, ofertaActiva: true, ofertaTipo: "combo" as const, ofertaValor: 2500, ofertaCantidad: 3 }
    expect(precioLinea(combo, 2)).toBe(2000)
  })

  it("resuelve el 2x1 exacto", () => {
    const dosPorUno = { ...base, ofertaActiva: true, ofertaTipo: "combo" as const, ofertaValor: 1000, ofertaCantidad: 2 }
    expect(precioLinea(dosPorUno, 4)).toBe(2000)
  })
})

describe("comboLabel", () => {
  it("reconoce el 2x1", () => {
    expect(
      comboLabel({ ...base, ofertaActiva: true, ofertaTipo: "combo", ofertaValor: 1000, ofertaCantidad: 2 }),
    ).toBe("2x1")
  })

  it("arma la etiqueta Nx$", () => {
    expect(
      comboLabel({ ...base, ofertaActiva: true, ofertaTipo: "combo", ofertaValor: 2500, ofertaCantidad: 3 }),
    ).toBe("3x$2500")
  })

  it("es null cuando no es un combo", () => {
    expect(comboLabel({ ...base, ofertaActiva: true, ofertaTipo: "monto", ofertaValor: 100 })).toBeNull()
    expect(comboLabel(base)).toBeNull()
  })
})

describe("margenPct", () => {
  it("calcula el margen sobre el precio de venta", () => {
    expect(margenPct(1000, 600)).toBe(40)
  })

  it("da negativo cuando se vende por debajo del costo", () => {
    expect(margenPct(500, 800)).toBeCloseTo(-60)
  })

  it("es null sin costo o sin precio", () => {
    expect(margenPct(1000, null)).toBeNull()
    expect(margenPct(1000, undefined)).toBeNull()
    expect(margenPct(0, 500)).toBeNull()
  })
})

describe("estadoStock", () => {
  it("marca los servicios aparte", () => {
    expect(estadoStock({ stock: 0, stockMinimo: 0, controlaStock: false })).toBe("servicio")
  })

  it("detecta agotado, bajo y ok", () => {
    expect(estadoStock({ stock: 0, stockMinimo: 5, controlaStock: true })).toBe("agotado")
    expect(estadoStock({ stock: 5, stockMinimo: 5, controlaStock: true })).toBe("bajo")
    expect(estadoStock({ stock: 6, stockMinimo: 5, controlaStock: true })).toBe("ok")
  })

  it("con mínimo en cero, cualquier stock positivo está ok", () => {
    expect(estadoStock({ stock: 1, stockMinimo: 0, controlaStock: true })).toBe("ok")
  })
})

describe("diasHastaVencimiento", () => {
  const hoy = new Date(2026, 7, 23) // 23/08/2026

  it("cuenta los días que faltan", () => {
    expect(diasHastaVencimiento("2026-08-30", hoy)).toBe(7)
  })

  it("da cero el mismo día", () => {
    expect(diasHastaVencimiento("2026-08-23", hoy)).toBe(0)
  })

  it("da negativo si ya venció", () => {
    expect(diasHastaVencimiento("2026-08-13", hoy)).toBe(-10)
  })

  it("es null sin fecha o con fecha inválida", () => {
    expect(diasHastaVencimiento(null, hoy)).toBeNull()
    expect(diasHastaVencimiento(undefined, hoy)).toBeNull()
    expect(diasHastaVencimiento("no-es-fecha", hoy)).toBeNull()
  })
})

describe("calcularPrecioConMargen", () => {
  it("aplica el porcentaje sobre el costo", () => {
    expect(calcularPrecioConMargen(1000, 35)).toBe(1350)
  })

  it("redondea a 2 decimales", () => {
    expect(calcularPrecioConMargen(999.99, 33)).toBe(1329.99)
  })

  it("con 0% devuelve el mismo costo", () => {
    expect(calcularPrecioConMargen(500, 0)).toBe(500)
  })

  it("nunca devuelve negativo aunque el porcentaje sea negativo", () => {
    expect(calcularPrecioConMargen(500, -200)).toBe(0)
  })
})
