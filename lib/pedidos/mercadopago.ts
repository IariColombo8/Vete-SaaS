import "server-only"
import { randomUUID } from "node:crypto"
import { MercadoPagoError } from "@/lib/mp-point/api"

/**
 * Cobro online de un pedido web con Checkout Pro, usando la cuenta de Mercado
 * Pago que la veterinaria conectó para Point (mismo access token). El cliente
 * carga la tarjeta en la página de Mercado Pago, no en VetPanel: así no
 * pasamos datos de tarjeta por nuestro servidor.
 *
 * El QR del pedido no va por acá: reusa `crearOrdenQr` de `lib/mp-point/api`.
 *
 * Docs: POST /checkout/preferences, GET /v1/payments/search.
 */

const MP_BASE = "https://api.mercadopago.com"

async function leer<T>(res: Response): Promise<T> {
  if (!res.ok) throw new MercadoPagoError(res.status, await res.text())
  return (await res.json()) as T
}

export interface ItemPreferencia {
  titulo: string
  /** Importe total de la línea (ya con cantidad y ofertas). */
  importe: number
}

export interface CrearPreferenciaParams {
  externalReference: string
  items: ItemPreferencia[]
  /** Total a cobrar, ya con el descuento si lo hubo. */
  total: number
  emailComprador?: string
  /** URL a la que vuelve el comprador (la página del pedido). */
  urlRetorno: string
  /** Webhook. Solo si es https: Mercado Pago no llega a localhost. */
  urlNotificacion?: string
  nombreTienda?: string
}

export interface Preferencia {
  id: string
  initPoint: string
}

/**
 * Crea la preferencia. Si el total no coincide con la suma de las líneas
 * (hubo descuento), se manda una sola línea con el total: Mercado Pago no
 * acepta importes negativos.
 */
export async function crearPreferencia(token: string, p: CrearPreferenciaParams): Promise<Preferencia> {
  const suma = Math.round(p.items.reduce((acc, i) => acc + i.importe, 0) * 100) / 100
  const items =
    Math.abs(suma - p.total) < 0.01
      ? p.items.map((i) => ({ title: i.titulo.slice(0, 250), quantity: 1, unit_price: i.importe, currency_id: "ARS" }))
      : [{ title: `Pedido ${p.nombreTienda ?? ""}`.trim().slice(0, 250), quantity: 1, unit_price: p.total, currency_id: "ARS" }]

  const https = p.urlRetorno.startsWith("https://")
  const body: Record<string, unknown> = {
    items,
    external_reference: p.externalReference,
    back_urls: { success: p.urlRetorno, failure: p.urlRetorno, pending: p.urlRetorno },
    // Pagos en efectivo de Rapipago/PagoFácil no: el cliente ya eligió tarjeta.
    payment_methods: { excluded_payment_types: [{ id: "ticket" }, { id: "atm" }] },
    statement_descriptor: (p.nombreTienda ?? "VETPANEL").replace(/[^a-z0-9 ]/gi, "").slice(0, 22) || "VETPANEL",
  }
  // MP rechaza `auto_return` si la URL de retorno no es https (localhost).
  if (https) body.auto_return = "approved"
  if (p.urlNotificacion?.startsWith("https://")) body.notification_url = p.urlNotificacion
  if (p.emailComprador) body.payer = { email: p.emailComprador }

  const res = await fetch(`${MP_BASE}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify(body),
  })
  const data = await leer<{ id: string; init_point: string }>(res)
  return { id: data.id, initPoint: data.init_point }
}

export interface PagoMP {
  id: string
  status: string
  statusDetail: string | null
  paymentTypeId: string | null
  installments: number | null
  monto: number
}

/** Pagos de una referencia, el más nuevo primero. */
export async function buscarPagos(token: string, externalReference: string): Promise<PagoMP[]> {
  const url = `${MP_BASE}/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}&sort=date_created&criteria=desc&limit=20`
  const data = await leer<{
    results?: {
      id: number | string
      status: string
      status_detail?: string
      payment_type_id?: string
      installments?: number
      transaction_amount?: number
    }[]
  }>(await fetch(url, { headers: { Authorization: `Bearer ${token}` } }))
  return (data.results ?? []).map((r) => ({
    id: String(r.id),
    status: r.status,
    statusDetail: r.status_detail ?? null,
    paymentTypeId: r.payment_type_id ?? null,
    installments: r.installments ?? null,
    monto: Number(r.transaction_amount ?? 0),
  }))
}

/** Referencia del pedido en Mercado Pago (Checkout Pro y QR). */
export function referenciaPedido(pedidoId: string): string {
  return `ped-${pedidoId}`
}
