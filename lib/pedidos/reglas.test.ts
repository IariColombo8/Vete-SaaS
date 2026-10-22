import { describe, expect, it } from "vitest"
import {
  cantidadValida,
  entregasDisponibles,
  esEditable,
  facturaAutomatica,
  medioVentaDesdeMP,
  mediosDisponibles,
  precioLineaWeb,
  rutaPedido,
  siguienteEstado,
} from "./reglas"
import type { TiendaPublica } from "./tipos"

describe("cantidadValida", () => {
  it("por unidad solo enteros", () => {
    expect(cantidadValida("un", 2)).toBe(true)
    expect(cantidadValida("un", 1.5)).toBe(false)
    expect(cantidadValida("un", 0)).toBe(false)
    expect(cantidadValida("un", 101)).toBe(false)
  })

  it("por kilo de a 100 g", () => {
    expect(cantidadValida("kg", 1.5)).toBe(true)
    expect(cantidadValida("kg", 0.3)).toBe(true)
    expect(cantidadValida("kg", 0.25)).toBe(false)
  })
})

describe("precioLineaWeb", () => {
  it("usa el precio de la vidriera, sin el costo", () => {
    // Con costo, el porcentaje restaría puntos de margen; la vidriera no lo
    // conoce y muestra 10% de descuento sobre el precio.
    const p = { precio: 1000, costo: 500, ofertaActiva: true, ofertaTipo: "porcentaje" as const, ofertaValor: 10 }
    expect(precioLineaWeb(p, 2)).toEqual({ precioUnitario: 900, subtotal: 1800 })
  })

  it("respeta los combos", () => {
    const p = { precio: 1000, ofertaActiva: true, ofertaTipo: "combo" as const, ofertaCantidad: 2, ofertaValor: 1000 }
    expect(precioLineaWeb(p, 3).subtotal).toBe(2000)
  })
})

describe("medioVentaDesdeMP", () => {
  it("mapea el tipo de pago de Mercado Pago", () => {
    expect(medioVentaDesdeMP("credit_card")).toBe("credito")
    expect(medioVentaDesdeMP("debit_card")).toBe("debito")
    expect(medioVentaDesdeMP("account_money")).toBe("transferencia")
    expect(medioVentaDesdeMP(null)).toBe("transferencia")
  })
})

describe("facturaAutomatica", () => {
  it("todo menos transferencia", () => {
    expect(facturaAutomatica("efectivo")).toBe(true)
    expect(facturaAutomatica("tarjeta")).toBe(true)
    expect(facturaAutomatica("credito")).toBe(true)
    expect(facturaAutomatica("transferencia")).toBe(false)
  })
})

describe("siguienteEstado", () => {
  it("el envío pasa por reparto, el retiro no", () => {
    expect(siguienteEstado("pendiente", "envio")).toBe("preparacion")
    expect(siguienteEstado("preparacion", "envio")).toBe("reparto")
    expect(siguienteEstado("preparacion", "retiro")).toBe("completado")
    expect(siguienteEstado("reparto", "envio")).toBe("completado")
    expect(siguienteEstado("completado", "envio")).toBeNull()
  })
})

describe("esEditable", () => {
  it("solo pendiente/preparación y sin cobrar", () => {
    expect(esEditable({ estado: "pendiente", ventaId: null, pagoEstado: "pendiente" })).toBe(true)
    expect(esEditable({ estado: "preparacion", ventaId: null, pagoEstado: "rechazado" })).toBe(true)
    expect(esEditable({ estado: "reparto", ventaId: null, pagoEstado: "pendiente" })).toBe(false)
    expect(esEditable({ estado: "pendiente", ventaId: "v", pagoEstado: "aprobado" })).toBe(false)
    expect(esEditable({ estado: "pendiente", ventaId: null, pagoEstado: "aprobado" })).toBe(false)
  })
})

describe("disponibles", () => {
  const base: TiendaPublica = {
    pedidosHabilitados: true, retiroHabilitado: true, envioHabilitado: false, notaEnvio: "",
    medios: ["efectivo", "tarjeta", "qr"], aliasTransferencia: "", titularTransferencia: "", mpConectado: false,
  }

  it("sin Mercado Pago no se ofrece tarjeta ni QR", () => {
    expect(mediosDisponibles(base)).toEqual(["efectivo"])
    expect(mediosDisponibles({ ...base, mpConectado: true })).toEqual(["efectivo", "tarjeta", "qr"])
  })

  it("entregas según la configuración", () => {
    expect(entregasDisponibles(base)).toEqual(["retiro"])
  })
})

describe("rutaPedido", () => {
  it("usa el DNI normalizado y el número", () => {
    expect(rutaPedido({ tenantId: "vipvet", clienteDni: "30.123.456", numero: 12 })).toBe("/vipvet/pedido/30123456/12")
  })
})
