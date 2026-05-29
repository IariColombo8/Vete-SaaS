import "server-only"

/**
 * Integración con Mercado Pago — suscripciones recurrentes (preapproval).
 *
 * Env (server-only):
 *  - MP_ACCESS_TOKEN : access token de la cuenta de Mercado Pago.
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

export interface PreapprovalInfo {
  id: string
  status: string
  externalReference: string
}

/** Consulta una suscripción por id (usado en el webhook para verificar estado real). */
export async function getPreapproval(id: string): Promise<PreapprovalInfo | null> {
  const res = await fetch(`${MP_BASE}/preapproval/${id}`, { headers: authHeaders() })
  if (!res.ok) return null
  const data = (await res.json()) as { id: string; status: string; external_reference: string }
  return { id: data.id, status: data.status, externalReference: data.external_reference }
}
