/**
 * Integración con WhatsApp Cloud API (Meta Graph API).
 *
 * Variables de entorno (server-only):
 *  - WHATSAPP_TOKEN            → token de acceso permanente del System User.
 *  - WHATSAPP_PHONE_NUMBER_ID  → ID del número emisor.
 *  - WHATSAPP_API_VERSION      → opcional, default "v21.0".
 *
 * IMPORTANTE: los mensajes iniciados por el negocio fuera de la ventana de
 * 24 h (ej. recordatorios) DEBEN usar plantillas (`template`) previamente
 * aprobadas por Meta. El texto libre (`sendWhatsAppText`) solo funciona dentro
 * de la ventana de 24 h posterior a un mensaje del usuario.
 *
 * Todas las funciones son best-effort: si falta configuración, hacen no-op y
 * devuelven `{ ok: false, skipped: true }` sin lanzar.
 */

const DEFAULT_API_VERSION = "v21.0"

export interface WhatsAppResult {
  ok: boolean
  skipped?: boolean
  error?: string
}

function getConfig(): { token: string; phoneNumberId: string; version: string } | null {
  const token = process.env.WHATSAPP_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) return null
  return { token, phoneNumberId, version: process.env.WHATSAPP_API_VERSION || DEFAULT_API_VERSION }
}

/**
 * Normaliza un teléfono a formato internacional sin `+` (lo que espera la API).
 * Asume Argentina (54) si no tiene código de país.
 */
export function normalizePhone(telefono: string): string {
  const digits = (telefono || "").replace(/\D/g, "")
  if (!digits) return ""
  if (digits.startsWith("54")) return digits
  // Quitar 0 inicial (prefijo nacional) y 15 si viniera intercalado es complejo;
  // cubrimos el caso común: número local → anteponer 54.
  const sinCero = digits.replace(/^0/, "")
  return `54${sinCero}`
}

async function postMessage(payload: Record<string, unknown>): Promise<WhatsAppResult> {
  const config = getConfig()
  if (!config) {
    console.warn("[whatsapp] WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID no configurados — mensaje omitido")
    return { ok: false, skipped: true }
  }

  const url = `https://graph.facebook.com/${config.version}/${config.phoneNumberId}/messages`
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    })
    if (!res.ok) {
      const detail = await res.text()
      console.error("[whatsapp] Error de la API:", res.status, detail)
      return { ok: false, error: `WhatsApp API ${res.status}` }
    }
    return { ok: true }
  } catch (error) {
    console.error("[whatsapp] Error enviando mensaje:", error)
    return { ok: false, error: "Error interno" }
  }
}

/** Envía un mensaje de texto libre (solo válido dentro de la ventana de 24 h). */
export async function sendWhatsAppText(telefono: string, body: string): Promise<WhatsAppResult> {
  const to = normalizePhone(telefono)
  if (!to) return { ok: false, error: "Teléfono inválido" }
  return postMessage({ to, type: "text", text: { body } })
}

/**
 * Envía una plantilla aprobada. `components` sigue el formato de la Cloud API.
 * Úsalo para recordatorios y confirmaciones iniciadas por el negocio.
 */
export async function sendWhatsAppTemplate(
  telefono: string,
  templateName: string,
  languageCode: string,
  components?: unknown[],
): Promise<WhatsAppResult> {
  const to = normalizePhone(telefono)
  if (!to) return { ok: false, error: "Teléfono inválido" }
  return postMessage({
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components ? { components } : {}),
    },
  })
}
