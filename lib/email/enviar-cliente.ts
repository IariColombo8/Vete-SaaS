import "server-only"
import { getGmailCredentials, getGmailCredentialsConFallback } from "@/lib/supabase/email-credentials"
import { enviarEmailGmail } from "@/lib/google/gmail"

/**
 * Email de una veterinaria a SU cliente, desde el servidor (crons). Orden:
 *
 *  1. Gmail propio de la veterinaria, si lo conectó: sale de su casilla y las
 *     respuestas le llegan a ella.
 *  2. Resend de VetPanel (`RESEND_API_KEY` / `EMAIL_FROM`), con el nombre de
 *     la veterinaria como remitente y `reply_to` a su email.
 *  3. Gmail compartido de VetPanel, si Resend no está configurado.
 *
 * EmailJS (otro proveedor que puede tener un tenant) no sirve acá: manda una
 * plantilla fija de confirmación de turno, no un HTML propio.
 *
 * Nunca lanza: devuelve `skipped` si no hay ningún proveedor configurado.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails"

export interface ResultadoEmail {
  ok: boolean
  skipped?: boolean
  error?: string
}

export interface EmailCliente {
  to: string
  subject: string
  html: string
  /** Nombre de la veterinaria, como remitente visible. */
  remitente: string
  /** Email de la veterinaria, para que las respuestas le lleguen a ella. */
  replyTo?: string
}

/** "VipVet vía VetPanel <avisos@vetpanel.com.ar>" a partir de EMAIL_FROM. */
function remitenteResend(emailFrom: string, nombre: string): string {
  const direccion = emailFrom.match(/<([^>]+)>/)?.[1] ?? emailFrom.trim()
  const limpio = nombre.replace(/["<>\r\n]/g, "").trim()
  return limpio ? `"${limpio} vía VetPanel" <${direccion}>` : emailFrom
}

async function porGmail(
  credenciales: { clientId: string; clientSecret: string; refreshToken: string | null; senderEmail: string | null } | null,
  email: EmailCliente,
): Promise<ResultadoEmail | null> {
  if (!credenciales?.refreshToken || !credenciales.senderEmail) return null
  try {
    await enviarEmailGmail(
      {
        clientId: credenciales.clientId,
        clientSecret: credenciales.clientSecret,
        refreshToken: credenciales.refreshToken,
        senderEmail: credenciales.senderEmail,
      },
      { to: email.to, subject: email.subject, html: email.html },
    )
    return { ok: true }
  } catch (error) {
    console.error("[email/cliente] Gmail:", error)
    return { ok: false, error: "Gmail rechazó el envío" }
  }
}

export async function enviarEmailCliente(tenantId: string, email: EmailCliente): Promise<ResultadoEmail> {
  const propio = await porGmail(await getGmailCredentials(tenantId), email)
  if (propio) return propio

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (apiKey && from) {
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: remitenteResend(from, email.remitente),
          to: [email.to],
          subject: email.subject,
          html: email.html,
          ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        }),
      })
      if (res.ok) return { ok: true }
      console.error("[email/cliente] Resend", res.status, await res.text())
      return { ok: false, error: `Resend ${res.status}` }
    } catch (error) {
      console.error("[email/cliente] Resend:", error)
      return { ok: false, error: "Error de red con Resend" }
    }
  }

  const compartido = await porGmail(await getGmailCredentialsConFallback(tenantId), email)
  return compartido ?? { ok: false, skipped: true }
}
