import { describe, it, expect } from "vitest"
import { calcularIngresos, periodosDePago, resumirIngresos, type EventoBilling } from "./ingresos"
import { estimarMetas, proyectar, serieMensual, supuestosReales } from "./metricas"

const evento = (tenantId: string, tipo: string, createdAt: string, extra: Partial<EventoBilling> = {}): EventoBilling => ({
  tenantId, tipo, createdAt, preapprovalId: null, detalle: null, ...extra,
})

describe("periodosDePago", () => {
  it("un cambio de plan (dos authorized seguidos) no abre un tramo nuevo", () => {
    const p = periodosDePago([
      evento("a", "authorized", "2026-01-05T00:00:00Z"),
      evento("a", "reemplazada", "2026-03-01T00:00:00Z"),
      evento("a", "authorized", "2026-03-01T00:00:00Z"),
    ])
    expect(p).toEqual([{ desde: "2026-01-05T00:00:00Z", hasta: null }])
  })

  it("una baja cierra el tramo y una reactivación abre otro", () => {
    const p = periodosDePago([
      evento("a", "authorized", "2026-01-05T00:00:00Z"),
      evento("a", "cancelled", "2026-02-10T00:00:00Z"),
      evento("a", "authorized", "2026-04-01T00:00:00Z"),
    ])
    expect(p).toEqual([
      { desde: "2026-01-05T00:00:00Z", hasta: "2026-02-10T00:00:00Z" },
      { desde: "2026-04-01T00:00:00Z", hasta: null },
    ])
  })

  it("los eventos ignorados de suscripciones viejas no cortan", () => {
    const p = periodosDePago([
      evento("a", "authorized", "2026-01-05T00:00:00Z"),
      evento("a", "cancelled_ignorado", "2026-02-10T00:00:00Z"),
    ])
    expect(p[0].hasta).toBeNull()
  })
})

describe("calcularIngresos", () => {
  const precio = (plan: string | undefined) => (plan === "pro" ? 80000 : 50000)

  it("usa el monto del checkout de la suscripción vigente, no el precio actual", () => {
    const ingresos = calcularIngresos(
      [{ slug: "a", plan: "pro", estado: "authorized", preapprovalId: "p1", proximoCobro: null, payerEmail: null, cobroManual: false }],
      [
        evento("a", "pending", "2026-01-01T00:00:00Z", { preapprovalId: "p1", detalle: { monto: 70000 } }),
        evento("a", "authorized", "2026-01-02T00:00:00Z", { preapprovalId: "p1" }),
      ],
      precio,
    )
    expect(ingresos.a.montoMensual).toBe(70000)
    expect(ingresos.a.clienteDesde).toBe("2026-01-02T00:00:00Z")
  })

  it("sin checkout registrado cae al precio del plan; sin suscripción, 0", () => {
    const ingresos = calcularIngresos(
      [
        { slug: "a", plan: "pro", estado: "authorized", preapprovalId: "x", proximoCobro: null, payerEmail: null, cobroManual: false },
        { slug: "b", plan: "basico", estado: null, preapprovalId: null, proximoCobro: null, payerEmail: null, cobroManual: false },
      ],
      [],
      precio,
    )
    expect(ingresos.a.montoMensual).toBe(80000)
    expect(ingresos.a.periodos).toHaveLength(1)
    expect(ingresos.b.montoMensual).toBe(0)
    expect(resumirIngresos(ingresos)).toEqual({ mensual: 80000, anual: 960000, pagantes: 1, ticketPromedio: 80000 })
  })
})

describe("serieMensual y supuestos", () => {
  const ahora = new Date(2026, 9, 15) // 15 oct 2026
  const tenants = [
    { slug: "a", createdAt: new Date(2026, 7, 1).toISOString() },  // ago
    { slug: "b", createdAt: new Date(2026, 8, 10).toISOString() }, // sep
    { slug: "c", createdAt: new Date(2026, 9, 12).toISOString() }, // oct, en prueba
  ]
  const ingresos = calcularIngresos(
    [
      { slug: "a", plan: "pro", estado: "authorized", preapprovalId: null, proximoCobro: null, payerEmail: null, cobroManual: false },
      { slug: "b", plan: "pro", estado: null, preapprovalId: null, proximoCobro: null, payerEmail: null, cobroManual: false },
      { slug: "c", plan: "pro", estado: null, preapprovalId: null, proximoCobro: null, payerEmail: null, cobroManual: false },
    ],
    [evento("a", "authorized", new Date(2026, 8, 1).toISOString())],
    () => 80000,
  )

  it("arma un punto por mes desde la primera alta, con acumulados", () => {
    const serie = serieMensual(tenants, ingresos, ahora)
    expect(serie.map((p) => p.mes)).toEqual(["2026-08", "2026-09", "2026-10"])
    expect(serie.map((p) => p.veterinarias)).toEqual([1, 2, 3])
    expect(serie.map((p) => p.pagantes)).toEqual([0, 1, 1])
    expect(serie[2].ingresoMensual).toBe(80000)
  })

  it("la conversión solo cuenta las que ya terminaron la prueba", () => {
    const s = supuestosReales(tenants, ingresos, ahora, { diasPrueba: 10, ticketSinDatos: 65000 })
    expect(s.conversion).toBe(0.5) // a pagó, b no; c todavía está probando
    expect(s.ticket).toBe(80000)
    expect(s.altasPorMes).toBeGreaterThan(0)
  })

  it("sin nadie pagando usa el ticket de respaldo", () => {
    const s = supuestosReales(tenants, {}, ahora, { diasPrueba: 10, ticketSinDatos: 65000 })
    expect(s.ticket).toBe(65000)
    expect(s.conversion).toBe(0)
  })
})

describe("proyectar y estimarMetas", () => {
  const ahora = new Date(2026, 9, 15)
  const supuestos = { altasPorMes: 4, conversion: 0.5, bajaMensual: 0, ticket: 80000 }

  it("suma altas y las que convierten, mes a mes", () => {
    const p = proyectar({ veterinarias: 10, pagantes: 2 }, supuestos, ahora, 3)
    expect(p.map((x) => x.mes)).toEqual(["2026-11", "2026-12", "2027-01"])
    expect(p.map((x) => x.veterinarias)).toEqual([14, 18, 22])
    expect(p.map((x) => x.pagantes)).toEqual([4, 6, 8])
    expect(p[2].ingresoMensual).toBe(640000)
    expect(p.every((x) => x.proyectado)).toBe(true)
  })

  it("estima el mes de cada meta, y marca las ya superadas", () => {
    const metas = estimarMetas({ veterinarias: 10, pagantes: 2 }, supuestos, ahora, [1, 6, 1000])
    expect(metas[0].alcanzada).toBe(true)
    expect(metas[1].mes).toBe("2026-12")
    expect(metas[2].mes).toBeNull()
  })

  it("con bajas, las que pagan crecen menos", () => {
    const sin = proyectar({ veterinarias: 10, pagantes: 10 }, supuestos, ahora, 6)
    const con = proyectar({ veterinarias: 10, pagantes: 10 }, { ...supuestos, bajaMensual: 0.1 }, ahora, 6)
    expect(con[5].pagantes).toBeLessThan(sin[5].pagantes)
  })
})

describe("ingresos de las que pagan en efectivo", () => {
  const ahora = new Date("2026-10-08T15:00:00Z")
  const pago = (periodo: string, monto = 80000) => ({
    id: periodo, tenantId: "vipvet", periodo, monto, medio: "efectivo" as const, pagadoEl: periodo,
    nota: null, createdAt: periodo, anuladoAt: null, motivoAnulacion: null,
  })
  const sus = [{ slug: "vipvet", plan: "pro", estado: null, preapprovalId: null, proximoCobro: null, payerEmail: null, cobroManual: true }]

  it("con el mes anterior pago sigue pagando (todavía está en plazo) y vale el último monto", () => {
    const i = calcularIngresos(sus, [], () => 1, [pago("2026-08-01", 70000), pago("2026-09-01", 75000)], ahora)
    expect(i.vipvet).toMatchObject({ pagando: true, via: "manual", montoMensual: 75000 })
    expect(i.vipvet.periodos).toHaveLength(1)
    expect(i.vipvet.periodos[0].hasta).toBeNull()
  })

  it("sin pagar hace dos meses ya no cuenta como pagando", () => {
    const i = calcularIngresos(sus, [], () => 1, [pago("2026-07-01")], ahora)
    expect(i.vipvet.pagando).toBe(false)
    expect(i.vipvet.montoMensual).toBe(0)
  })

  it("un mes salteado parte el tramo en dos", () => {
    const i = calcularIngresos(sus, [], () => 1, [pago("2026-06-01"), pago("2026-08-01"), pago("2026-09-01")], ahora)
    expect(i.vipvet.periodos).toHaveLength(2)
  })
})
