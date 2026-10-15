/**
 * Ingresos de VetPanel por veterinaria, a partir de lo que ya guarda el
 * billing: el estado de la suscripción en `tenants` y la bitácora
 * `billing_eventos`. Puro, para testear sin base.
 *
 * Las que pagan en efectivo (`cobro_manual`, 058) se cuentan con sus
 * `pagos_manuales`: cada mes pagado es un mes activo, y siguen "pagando"
 * mientras tengan pago del mes en curso o del anterior (el mes se paga del 1
 * al 10). Su ingreso mensual es el monto del último pago.
 *
 * Lo que se sabe y lo que no:
 *  - El monto de cada suscripción es el que se mandó a Mercado Pago al crearla
 *    (`detalle.monto` del evento `checkout`). Si no aparece, el precio actual
 *    del plan.
 *  - Desde cuándo paga y cuándo dejó de pagar sale de los eventos
 *    `authorized` / `cancelled` / `paused`. No hay registro de cada cobro
 *    mensual: el "cobrado" histórico no se puede saber con exactitud y no se
 *    inventa.
 */

import { periodoActual, sumarMeses, ultimoPago, vigentes, type PagoManual } from "../billing/cobro-manual"

export interface EventoBilling {
  tenantId: string
  tipo: string
  preapprovalId: string | null
  detalle: Record<string, unknown> | null
  createdAt: string
}

export interface SuscripcionTenant {
  slug: string
  plan: string | undefined
  estado: string | null
  preapprovalId: string | null
  proximoCobro: string | null
  payerEmail: string | null
  /** Paga en efectivo/transferencia, no por Mercado Pago. */
  cobroManual: boolean
}

export interface PeriodoPago {
  desde: string
  /** null = sigue pagando. */
  hasta: string | null
}

export interface IngresoTenant {
  /** Suscripción autorizada en Mercado Pago, o pago en efectivo al día. */
  pagando: boolean
  /** Cómo paga: suscripción de MP o en mano. */
  via: "mercadopago" | "manual"
  /** Lo que se le cobra por mes (0 si no paga). */
  montoMensual: number
  /** Primer día que se autorizó una suscripción. */
  clienteDesde: string | null
  proximoCobro: string | null
  periodos: PeriodoPago[]
}

const BAJAS = new Set(["cancelled", "paused"])

/**
 * Tramos en que la veterinaria tuvo una suscripción autorizada. Un cambio de
 * plan autoriza la nueva antes de cancelar la vieja (`reemplazada`), así que
 * dos `authorized` seguidos no abren un tramo nuevo. Los eventos `*_ignorado`
 * y `*_pendiente` son de suscripciones que no eran la vigente: no cortan.
 */
export function periodosDePago(eventos: EventoBilling[]): PeriodoPago[] {
  const ordenados = [...eventos].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const periodos: PeriodoPago[] = []
  let abierto: PeriodoPago | null = null
  for (const e of ordenados) {
    if (e.tipo === "authorized") {
      if (!abierto) {
        abierto = { desde: e.createdAt, hasta: null }
        periodos.push(abierto)
      }
    } else if (BAJAS.has(e.tipo) && abierto) {
      abierto.hasta = e.createdAt
      abierto = null
    }
  }
  return periodos
}

/** Monto mensual de una suscripción: el del checkout que la creó, o el precio del plan. */
export function montoSuscripcion(
  preapprovalId: string | null,
  eventos: EventoBilling[],
  precioPlan: number,
): number {
  if (preapprovalId) {
    const checkout = eventos.find((e) => e.tipo === "pending" && e.preapprovalId === preapprovalId && e.detalle?.monto != null)
    const monto = Number(checkout?.detalle?.monto)
    if (Number.isFinite(monto) && monto > 0) return monto
  }
  return precioPlan
}

/**
 * Tramos de las que pagan en mano: meses pagados seguidos forman un tramo. El
 * último queda abierto si cubre el mes en curso o el anterior.
 */
export function periodosManuales(pagos: PagoManual[], ahora: Date): PeriodoPago[] {
  const meses = [...new Set(vigentes(pagos).map((p) => p.periodo))].sort()
  const periodos: PeriodoPago[] = []
  for (const mes of meses) {
    const ultimo = periodos[periodos.length - 1]
    const siguiente = sumarMeses(mes, 1)
    if (ultimo && ultimo.hasta === `${mes}T03:00:00.000Z`) {
      ultimo.hasta = `${siguiente}T03:00:00.000Z`
    } else {
      periodos.push({ desde: `${mes}T03:00:00.000Z`, hasta: `${siguiente}T03:00:00.000Z` })
    }
  }
  const ultimo = periodos[periodos.length - 1]
  const alDia = sumarMeses(periodoActual(ahora), -1)
  if (ultimo && meses[meses.length - 1] >= alDia) ultimo.hasta = null
  return periodos
}

export function calcularIngresos(
  suscripciones: SuscripcionTenant[],
  eventos: EventoBilling[],
  precioPlan: (plan: string | undefined) => number,
  pagosManuales: PagoManual[] = [],
  ahora: Date = new Date(),
): Record<string, IngresoTenant> {
  const porTenant = new Map<string, EventoBilling[]>()
  for (const e of eventos) {
    const lista = porTenant.get(e.tenantId) ?? []
    lista.push(e)
    porTenant.set(e.tenantId, lista)
  }

  const resultado: Record<string, IngresoTenant> = {}
  for (const s of suscripciones) {
    if (s.cobroManual) {
      const propios = pagosManuales.filter((p) => p.tenantId === s.slug)
      const periodos = periodosManuales(propios, ahora)
      const pagando = periodos.length > 0 && periodos[periodos.length - 1].hasta === null
      resultado[s.slug] = {
        pagando,
        via: "manual",
        montoMensual: pagando ? (ultimoPago(propios)?.monto ?? precioPlan(s.plan)) : 0,
        clienteDesde: periodos[0]?.desde ?? null,
        proximoCobro: null,
        periodos,
      }
      continue
    }
    const propios = porTenant.get(s.slug) ?? []
    const pagando = s.estado === "authorized"
    const periodos = periodosDePago(propios)
    // Pagando sin evento `authorized` (activado a mano, o anterior a la
    // bitácora): cuenta como un tramo abierto desde que se sabe.
    if (pagando && (periodos.length === 0 || periodos[periodos.length - 1].hasta !== null)) {
      periodos.push({ desde: propios[0]?.createdAt ?? new Date().toISOString(), hasta: null })
    }
    resultado[s.slug] = {
      pagando,
      via: "mercadopago",
      montoMensual: pagando ? montoSuscripcion(s.preapprovalId, propios, precioPlan(s.plan)) : 0,
      clienteDesde: periodos[0]?.desde ?? null,
      proximoCobro: pagando ? s.proximoCobro : null,
      periodos,
    }
  }
  return resultado
}

export interface ResumenIngresos {
  /** Ingreso mensual recurrente: suma de las suscripciones activas. */
  mensual: number
  /** `mensual` × 12. */
  anual: number
  pagantes: number
  /** Promedio por veterinaria que paga (0 si ninguna). */
  ticketPromedio: number
}

export function resumirIngresos(ingresos: Record<string, IngresoTenant>): ResumenIngresos {
  const activos = Object.values(ingresos).filter((i) => i.pagando)
  const mensual = activos.reduce((acc, i) => acc + i.montoMensual, 0)
  return {
    mensual,
    anual: mensual * 12,
    pagantes: activos.length,
    ticketPromedio: activos.length > 0 ? Math.round(mensual / activos.length) : 0,
  }
}
