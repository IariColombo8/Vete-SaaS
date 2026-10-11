import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Integración con Mercado Pago — suscripciones recurrentes (preapproval).
 *
 * Env (server-only):
 *  - MP_ACCESS_TOKEN    : access token de la cuenta de Mercado Pago de VetPanel
 *                         (la que cobra las suscripciones; no confundir con el
 *                         token del Point de cada veterinaria).
 *  - MP_WEBHOOK_SECRET  : clave secreta del webhook (panel de MP → Webhooks).
 *                         Con ella se valida `x-signature`.
 *
 * Docs: https://www.mercadopago.com.ar/developers/es/reference/subscriptions/_preapproval/post
 *
 * `external_reference` codifica "tenantId:planId" para resolver el webhook.
 */

const MP_BASE = "https://api.mercadopago.com"

export function isMercadoPagoConfigured(): boolean {
  return Boolean(process.env.MP_ACCESS_TOKEN)
}

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  }
}

export interface CrearSuscripcionParams {
  tenantId: string
  planId: string
  planNombre: string
  montoMensual: number
  payerEmail: string
  backUrl: string
}

export interface SuscripcionCreada {
  id: string
  initPoint: string
}

/** Crea una suscripción (preapproval) y devuelve el init_point para redirigir al pago. */
export async function crearSuscripcion(params: CrearSuscripcionParams): Promise<SuscripcionCreada> {
  const body = {
    reason: `VetPanel — Plan ${params.planNombre}`,
    external_reference: `${params.tenantId}:${params.planId}`,
    payer_email: params.payerEmail,
    back_url: params.backUrl,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: params.montoMensual,
      currency_id: "ARS",
    },
  }

  const res = await fetch(`${MP_BASE}/preapproval`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Mercado Pago ${res.status}: ${detail}`)
  }

  const data = (await res.json()) as { id: string; init_point?: string; sandbox_init_point?: string }
  const initPoint = data.init_point || data.sandbox_init_point || ""
  return { id: data.id, initPoint }
}

/**
 * Estados posibles de un preapproval según MP:
 * pending (creado, falta pagar) · authorized (cobrando) · paused · cancelled.
 */
export type PreapprovalStatus = "pending" | "authorized" | "paused" | "cancelled" | string

export interface PreapprovalInfo {
  id: string
  status: PreapprovalStatus
  externalReference: string
  payerEmail: string | null
  /** ISO. Próximo débito, cuando la suscripción está autorizada. */
  nextPaymentDate: string | null
  montoMensual: number | null
  dateCreated: string | null
}

interface PreapprovalRaw {
  id: string
  status: string
  external_reference?: string
  payer_email?: string
  next_payment_date?: string
  date_created?: string
  auto_recurring?: { transaction_amount?: number }
}

function mapPreapproval(data: PreapprovalRaw): PreapprovalInfo {
  return {
    id: data.id,
    status: data.status,
    externalReference: data.external_reference ?? "",
    payerEmail: data.payer_email ?? null,
    nextPaymentDate: data.next_payment_date ?? null,
    montoMensual: data.auto_recurring?.transaction_amount ?? null,
    dateCreated: data.date_created ?? null,
  }
}

/** Consulta una suscripción por id (webhook, sincronización y pantalla de plan). */
export async function getPreapproval(id: string): Promise<PreapprovalInfo | null> {
  const res = await fetch(`${MP_BASE}/preapproval/${id}`, { headers: authHeaders() })
  if (!res.ok) return null
  return mapPreapproval((await res.json()) as PreapprovalRaw)
}

/** Cancela una suscripción en Mercado Pago. Devuelve el estado resultante. */
export async function cancelarPreapproval(id: string): Promise<PreapprovalInfo> {
  const res = await fetch(`${MP_BASE}/preapproval/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ status: "cancelled" }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Mercado Pago ${res.status}: ${detail}`)
  }
  return mapPreapproval((await res.json()) as PreapprovalRaw)
}

/** Parsea "tenantId:planId" del external_reference. */
export function parseExternalReference(ref: string): { tenantId: string; planId: string } | null {
  const [tenantId, planId] = (ref || "").split(":")
  if (!tenantId) return null
  return { tenantId, planId: planId ?? "" }
}

/**
 * Valida la firma `x-signature` de una notificación de Mercado Pago.
 *
 * Formato del header: `ts=<unix>,v1=<hmac>`. El HMAC-SHA256 se calcula con la
 * clave secreta sobre el manifest `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * (`data.id` viene por query string; si es alfanumérico, en minúsculas).
 * Docs: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
 *
 * Sin `MP_WEBHOOK_SECRET` configurado devuelve `null`: el llamador decide si
 * sigue (desarrollo) o rechaza (producción).
 */
export function verificarFirmaWebhook(params: {
  xSignature: string | null
  xRequestId: string | null
  dataId: string | null
}): boolean | null {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) return null
  if (!params.xSignature || !params.dataId) return false

  let ts = ""
  let v1 = ""
  for (const parte of params.xSignature.split(",")) {
    const [k, v] = parte.split("=").map((x) => x.trim())
    if (k === "ts") ts = v
    if (k === "v1") v1 = v
  }
  if (!ts || !v1) return false

  const dataId = /^[a-z0-9]+$/i.test(params.dataId) ? params.dataId.toLowerCase() : params.dataId
  const manifest = `id:${dataId};request-id:${params.xRequestId ?? ""};ts:${ts};`
  const esperado = createHmac("sha256", secret).update(manifest).digest("hex")

  const a = Buffer.from(esperado, "utf8")
  const b = Buffer.from(v1, "utf8")
  return a.length === b.length && timingSafeEqual(a, b)
}
