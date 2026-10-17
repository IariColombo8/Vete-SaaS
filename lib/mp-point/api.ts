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

/** Código de error de MP (p. ej. `minimum_amount_not_met`), para que el mostrador lo pueda reportar. */
export function detalleMP(cuerpo: string): string {
  try {
    const json = JSON.parse(cuerpo) as { errors?: { code?: string }[]; error?: string; message?: string }
    return json.errors?.[0]?.code ?? json.error ?? json.message ?? "sin detalle"
  } catch {
    return cuerpo.slice(0, 80) || "sin detalle"
  }
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

/** Medio con el que arranca la terminal. `qr` (solo MLA) muestra el QR en la pantalla del Point. */
export type TipoTarjeta = "credit_card" | "debit_card" | "qr"

/** MP rechaza órdenes Point por debajo de esto (`amount must be >= 15.00`). */
export const MONTO_MINIMO_POINT = 15

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
      // Cuotas e `installments_cost` solo con crédito: con débito MP rechaza
      // la orden entera (`invalid_payment_method_for_installments`).
      ...(p.tipoTarjeta === "credit_card"
        ? {
            payment_method: {
              default_type: p.tipoTarjeta,
              default_installments: p.cuotas ?? 1,
              installments_cost: "seller",
            },
          }
        : p.tipoTarjeta
          ? { payment_method: { default_type: p.tipoTarjeta } }
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

// ── QR ──────────────────────────────────────────────────────────────────────
//
// Misma API de Orders, `type: qr` en modo `dynamic`: MP devuelve la trama
// EMVCo con el monto y el mostrador la dibuja en pantalla. El cliente la
// escanea con cualquier billetera; el seguimiento, la cancelación y los
// estados son los mismos que en Point.
//
// MP exige que la orden apunte a una caja (POS) con `external_id`. Las cajas
// que crea la app de MP no lo tienen, así que VetPanel crea la suya dentro de
// la sucursal que ya exista en la cuenta (`asegurarCajaQr`). Crear la
// sucursal pide dirección y coordenadas reales: eso lo hace la veterinaria
// desde Mercado Pago, no se inventa acá.

/** `external_id` de la caja de VetPanel: alfanumérico, hasta 40 caracteres. */
export function externalPosIdQr(tenantId: string): string {
  return `VETPANEL${tenantId.replace(/[^a-z0-9]/gi, "").toUpperCase()}`.slice(0, 40)
}

export class SinSucursalError extends Error {
  constructor() {
    super("La cuenta de Mercado Pago no tiene ninguna sucursal")
  }
}

/** Crea la caja de VetPanel si todavía no existe. Idempotente por `external_id`. */
export async function asegurarCajaQr(token: string, externalPosId: string): Promise<void> {
  const existentes = await leer<{ results?: unknown[] }>(
    await fetch(`${MP_BASE}/pos?external_id=${encodeURIComponent(externalPosId)}`, { headers: headers(token) }),
  )
  if ((existentes.results ?? []).length > 0) return

  const yo = await leer<{ id: number }>(await fetch(`${MP_BASE}/users/me`, { headers: headers(token) }))
  const sucursales = await leer<{ results?: { id: string }[] }>(
    await fetch(`${MP_BASE}/users/${yo.id}/stores/search`, { headers: headers(token) }),
  )
  const sucursal = sucursales.results?.[0]
  if (!sucursal) throw new SinSucursalError()

  const res = await fetch(`${MP_BASE}/pos`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({
      name: "VetPanel QR",
      fixed_amount: true,
      store_id: Number(sucursal.id),
      external_id: externalPosId,
    }),
  })
  await leer<unknown>(res)
}

export interface CrearOrdenQrParams {
  externalPosId: string
  monto: number
  externalReference: string
  descripcion?: string
  expiraEnMinutos?: number
}

export interface OrdenQr extends OrdenPoint {
  /** Trama EMVCo a dibujar como QR. */
  qrData: string
}

export async function crearOrdenQr(token: string, p: CrearOrdenQrParams): Promise<OrdenQr> {
  const minutos = Math.min(Math.max(p.expiraEnMinutos ?? 10, 1), 180)
  const monto = p.monto.toFixed(2)
  const body: Record<string, unknown> = {
    type: "qr",
    total_amount: monto,
    external_reference: p.externalReference,
    expiration_time: `PT${minutos}M`,
    config: { qr: { external_pos_id: p.externalPosId, mode: "dynamic" } },
    transactions: { payments: [{ amount: monto }] },
  }
  if (p.descripcion) body.description = p.descripcion.slice(0, 250)

  const res = await fetch(`${MP_BASE}/v1/orders`, {
    method: "POST",
    headers: headers(token, { "X-Idempotency-Key": randomUUID() }),
    body: JSON.stringify(body),
  })
  const raw = await leer<OrdenRaw & { type_response?: { qr_data?: string } }>(res)
  return { ...mapOrden(raw), qrData: raw.type_response?.qr_data ?? "" }
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
