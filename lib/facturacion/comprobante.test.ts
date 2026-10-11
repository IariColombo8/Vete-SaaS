import { describe, it, expect } from "vitest"
import {
  calcularImportes,
  cuitValido,
  letraComprobante,
  numeroComprobante,
  resolverReceptor,
  tipoNotaCredito,
  urlQrArca,
  validarAntesDeEmitir,
  TIPO_CBTE,
  DOC_TIPO,
} from "./comprobante"

describe("letraComprobante", () => {
  it("monotributista y exento emiten C siempre", () => {
    expect(letraComprobante("MONOTRIBUTO", "RI")).toBe("C")
    expect(letraComprobante("EXENTO", "CF")).toBe("C")
  })
  it("RI emite A a RI/monotributo y B al resto", () => {
    expect(letraComprobante("RI", "RI")).toBe("A")
    expect(letraComprobante("RI", "MONOTRIBUTO")).toBe("A")
    expect(letraComprobante("RI", "CF")).toBe("B")
    expect(letraComprobante("RI", "EXENTO")).toBe("B")
  })
  it("la nota de crédito sigue la letra de la factura", () => {
    expect(tipoNotaCredito(TIPO_CBTE.FACTURA_A)).toBe(TIPO_CBTE.NC_A)
    expect(tipoNotaCredito(TIPO_CBTE.FACTURA_B)).toBe(TIPO_CBTE.NC_B)
    expect(tipoNotaCredito(TIPO_CBTE.FACTURA_C)).toBe(TIPO_CBTE.NC_C)
  })
})

describe("cuitValido", () => {
  it("acepta CUITs con dígito verificador correcto", () => {
    expect(cuitValido("20-12345678-6")).toBe(true)
    expect(cuitValido("30-71037089-7")).toBe(false)
    expect(cuitValido("30709888883")).toBe(false)
    expect(cuitValido("20123456786")).toBe(true)
  })
  it("rechaza largos distintos de 11", () => {
    expect(cuitValido("2012345678")).toBe(false)
    expect(cuitValido("")).toBe(false)
  })
})

describe("resolverReceptor", () => {
  it("con CUIT válido declara por CUIT", () => {
    const r = resolverReceptor({ nombre: "Vet SA", cuit: "20-12345678-6", dni: "12345678", condicionIva: "RI" })
    expect(r.docTipo).toBe(DOC_TIPO.CUIT)
    expect(r.docNro).toBe("20123456786")
    expect(r.condicionIvaId).toBe(1)
  })
  it("sin CUIT pero con DNI declara por DNI", () => {
    const r = resolverReceptor({ nombre: "Juan", dni: "30.111.222" })
    expect(r.docTipo).toBe(DOC_TIPO.DNI)
    expect(r.docNro).toBe("30111222")
    expect(r.condicionIvaId).toBe(5)
  })
  it("sin documento es consumidor final con nro 0", () => {
    const r = resolverReceptor({ nombre: "" })
    expect(r.docTipo).toBe(DOC_TIPO.CONSUMIDOR_FINAL)
    expect(r.docNro).toBe("0")
    expect(r.nombre).toBe("Consumidor Final")
  })
})

describe("calcularImportes", () => {
  const items = [
    { descripcion: "Alimento", cantidad: 1, precioUnitario: 12100, subtotal: 12100, alicuotaIva: 21 },
    { descripcion: "Pipeta", cantidad: 2, precioUnitario: 1105, subtotal: 2210, alicuotaIva: 10.5 },
  ]

  it("factura C: no discrimina, todo es neto", () => {
    const r = calcularImportes(items, 14310, false)
    expect(r.impTotal).toBe(14310)
    expect(r.impNeto).toBe(14310)
    expect(r.impIva).toBe(0)
    expect(r.alicuotas).toEqual([])
  })

  it("factura A/B: separa base e IVA por alícuota y cuadra con el total", () => {
    const r = calcularImportes(items, 14310, true)
    expect(r.impTotal).toBe(14310)
    expect(r.alicuotas.map((a) => a.id)).toEqual([4, 5])
    const a21 = r.alicuotas.find((a) => a.alicuota === 21)!
    expect(a21.base).toBe(10000)
    expect(a21.importe).toBe(2100)
    const a105 = r.alicuotas.find((a) => a.alicuota === 10.5)!
    expect(a105.base).toBe(2000)
    expect(a105.importe).toBe(210)
    expect(r.impNeto + r.impIva + r.impOpEx).toBeCloseTo(r.impTotal, 2)
  })

  it("reparte un descuento proporcionalmente y sigue cuadrando", () => {
    const r = calcularImportes(items, 13000, true)
    expect(r.impTotal).toBe(13000)
    expect(r.impNeto + r.impIva + r.impOpEx).toBeCloseTo(13000, 2)
    expect(r.items.reduce((acc, i) => acc + i.subtotal, 0)).toBeCloseTo(13000, 1)
  })

  it("los exentos van a ImpOpEx", () => {
    const r = calcularImportes(
      [{ descripcion: "Libro", cantidad: 1, precioUnitario: 500, subtotal: 500, alicuotaIva: null }, ...items],
      14810,
      true,
    )
    expect(r.impOpEx).toBe(500)
    expect(r.impNeto + r.impIva + r.impOpEx).toBeCloseTo(14810, 2)
  })

  it("rechaza una alícuota desconocida", () => {
    expect(() =>
      calcularImportes([{ descripcion: "x", cantidad: 1, precioUnitario: 100, subtotal: 100, alicuotaIva: 13 }], 100, true),
    ).toThrow()
  })
})

describe("validarAntesDeEmitir", () => {
  const importes = calcularImportes(
    [{ descripcion: "x", cantidad: 1, precioUnitario: 500000, subtotal: 500000, alicuotaIva: 21 }],
    500000,
    true,
  )
  it("exige DNI a consumidor final por encima del umbral", () => {
    const receptor = resolverReceptor({ nombre: "" })
    expect(validarAntesDeEmitir({ receptor, importes, letra: "B", umbralCf: 417288 })).toMatch(/DNI/)
  })
  it("exige CUIT para factura A", () => {
    const receptor = resolverReceptor({ nombre: "Juan", dni: "30111222", condicionIva: "RI" })
    expect(validarAntesDeEmitir({ receptor, importes, letra: "A" })).toMatch(/CUIT/)
  })
  it("pasa con DNI cargado", () => {
    const receptor = resolverReceptor({ nombre: "Juan", dni: "30111222" })
    expect(validarAntesDeEmitir({ receptor, importes, letra: "B" })).toBeNull()
  })
})

describe("urlQrArca", () => {
  it("arma el JSON del spec en base64", () => {
    const url = urlQrArca({
      fecha: "2026-10-10",
      cuit: "20-12345678-6",
      ptoVta: 1,
      tipoCmp: 6,
      nroCmp: 42,
      importe: 14310,
      tipoDocRec: 96,
      nroDocRec: "30111222",
      codAut: "76543210987654",
    })
    expect(url.startsWith("https://www.afip.gob.ar/fe/qr/?p=")).toBe(true)
    const json = JSON.parse(Buffer.from(url.split("p=")[1], "base64").toString("utf8"))
    expect(json).toEqual({
      ver: 1,
      fecha: "2026-10-10",
      cuit: 20123456786,
      ptoVta: 1,
      tipoCmp: 6,
      nroCmp: 42,
      importe: 14310,
      moneda: "PES",
      ctz: 1,
      tipoDocRec: 96,
      nroDocRec: 30111222,
      tipoCodAut: "E",
      codAut: 76543210987654,
    })
  })
})

describe("numeroComprobante", () => {
  it("formatea 0001-00000042", () => {
    expect(numeroComprobante(1, 42)).toBe("0001-00000042")
  })
})
