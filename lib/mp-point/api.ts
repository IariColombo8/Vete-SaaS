import "server-only"
import { randomUUID } from "node:crypto"

/**
 * Mercado Pago Point vía API de Orders (la "integration-api" de payment
 * intents está deprecada). Todas las llamadas reciben el access token de la
 * veterinaria: es SU cuenta la que cobra, no la de VetPanel.
 *
 * Docs:
 *  - Terminales: GET  /terminals/v1/list, PATCH /terminals/v1/setup
 *  - Órdenes:    POST /v1/orders (type point), GET /v1/orders/{id},
 *                POST /v1/orders/{id}/cancel
 */

const MP_BASE = "https://api.mercadopago.com"

export class MercadoPagoError extends Error {
  constructor(
    public status: number,
    public detalle: string,
  ) {
    super(`Mercado Pago ${status}: ${detalle}`)
  }
}

function headers(token: string, extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra }
}

async function leer<T>(res: Response): Promise<T> {
  if (!res.ok) throw new MercadoPagoError(res.status, await res.text())
  return (await res.json()) as T
}

// ── Terminales ──────────────────────────────────────────────────────────────

export type ModoTerminal = "PDV" | "STANDALONE" | "UNDEFINED"

export interface Terminal {
  id: string
  posId: number | null
  storeId: string | null
  externalPosId: string | null
  operatingMode: ModoTerminal
}

interface TerminalRaw {
  id: string
  pos_id?: number
  store_id?: string
  external_pos_id?: string
  operating_mode?: string
}

export async function listarTerminales(token: string): Promise<Terminal[]> {
  const res = await fetch(`${MP_BASE}/terminals/v1/list?limit=50&offset=0`, { headers: headers(token) })
  const data = await leer<{ data?: { terminals?: TerminalRaw[] } }>(res)
  return (data.data?.terminals ?? []).map((t) => ({
    id: t.id,
    posId: t.pos_id ?? null,
    storeId: t.store_id ?? null,
    externalPosId: t.external_pos_id ?? null,
    operatingMode: (t.operating_mode as ModoTerminal | undefined) ?? "UNDEFINED",
  }))
}

/**
 * Pone la terminal en modo PDV (punto de venta): en STANDALONE la terminal
 * ignora las órdenes que le mande el sistema. Después del cambio hay que
 * reiniciar la terminal.
 */
export async function configurarTerminalPDV(token: string, terminalId: string): Promise<void> {
  const res = await fetch(`${MP_BASE}/terminals/v1/setup`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify({ terminals: [{ id: terminalId, operating_mode: "PDV" }] }),
  })
  await leer<unknown>(res)
}

// ── Órdenes ─────────────────────────────────────────────────────────────────

export type TipoTarjeta = "credit_card" | "debit_card"

export interface CrearOrdenParams {
  terminalId: string
  /** Pesos con centavos; se manda como string con 2 decimales. */
  monto: number
  externalReference: string
  descripcion?: string
  imprimirTicket?: boolean
  tipoTarjeta?: TipoTarjeta
  cuotas?: number
  /** Minutos hasta que la orden vence en la terminal (30s a 3h en la API). */
  expiraEnMinutos?: number
}

export interface OrdenPoint {
  id: string
  status: string
  statusDetail: string | null
  paymentId: string | null
  paymentStatus: string | null
  paymentStatusDetail: string | null
  monto: number | null
}

interface OrdenRaw {
  id: string
  status: string
  status_detail?: string
  transactions?: {
    payments?: { id?: string; status?: string; status_detail?: string; amount?: string }[]
  }
}

function mapOrden(o: OrdenRaw): OrdenPoint {
  const pago = o.transactions?.payments?.[0]
  return {
    id: o.id,
    status: o.status,
    statusDetail: o.status_detail ?? null,
    paymentId: pago?.id ?? null,
    paymentStatus: pago?.status ?? null,
    paymentStatusDetail: pago?.status_detail ?? null,
    monto: pago?.amount != null ? Number(pago.amount) : null,
  }
}

export async function crearOrdenPoint(token: string, p: CrearOrdenParams): Promise<OrdenPoint> {
  const minutos = Math.min(Math.max(p.expiraEnMinutos ?? 10, 1), 180)
  const body: Record<string, unknown> = {
    type: "point",
    external_reference: p.externalReference,
    expiration_time: `PT${minutos}M`,
    transactions: { payments: [{ amount: p.monto.toFixed(2) }] },
    config: {
      point: {
        terminal_id: p.terminalId,
        print_on_terminal: p.imprimirTicket === false ? "no_ticket" : "seller_ticket",
      },
      ...(p.tipoTarjeta
        ? {
            payment_method: {
              default_type: p.tipoTarjeta,
              default_installments: p.tipoTarjeta === "credit_card" ? (p.cuotas ?? 1) : 1,
              installments_cost: "seller",
            },
          }
        : {}),
    },
  }
  if (p.descripcion) body.description = p.descripcion.slice(0, 250)

  const res = await fetch(`${MP_BASE}/v1/orders`, {
    method: "POST",
    headers: headers(token, { "X-Idempotency-Key": randomUUID() }),
    body: JSON.stringify(body),
  })
  return mapOrden(await leer<OrdenRaw>(res))
}

export async function getOrdenPoint(token: string, orderId: string): Promise<OrdenPoint> {
  const res = await fetch(`${MP_BASE}/v1/orders/${encodeURIComponent(orderId)}`, { headers: headers(token) })
  return mapOrden(await leer<OrdenRaw>(res))
}

/**
 * Cancela la orden. Si ya la tomó la terminal (`at_terminal`) la cancelación
 * es asíncrona: MP devuelve 202 y la orden sigue hasta que la terminal la
 * suelte. Se manda el header que lo permite y se deja que el poll resuelva.
 */
export async function cancelarOrdenPoint(token: string, orderId: string): Promise<OrdenPoint | null> {
  const res = await fetch(`${MP_BASE}/v1/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: "POST",
    headers: headers(token, {
      "X-Idempotency-Key": randomUUID(),
      "x-allow-cancelable-status": "at_terminal",
    }),
  })
  if (res.status === 202) return null
  return mapOrden(await leer<OrdenRaw>(res))
}

// ── Interpretación de estados ───────────────────────────────────────────────

export type ResultadoOrden = "en_curso" | "aprobada" | "rechazada" | "cancelada" | "expirada"

/**
 * Reduce los estados de MP a lo que le importa al mostrador. `processed` con
 * pago `processed` es la única combinación que registra la venta.
 */
export function interpretarOrden(o: OrdenPoint): ResultadoOrden {
  const s = o.status
  if (s === "processed" && (o.paymentStatus === null || o.paymentStatus === "processed")) return "aprobada"
  if (s === "canceled" || s === "refunded") return "cancelada"
  if (s === "expired") return "expirada"
  if (s === "failed") return "rechazada"
  return "en_curso"
}
