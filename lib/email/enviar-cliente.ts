import "server-only"
import { getGmailCredentials } from "@/lib/supabase/email-credentials"
import { enviarEmailGmail } from "@/lib/google/gmail"

/**
 * Email de una veterinaria a SU cliente, desde el servidor (crons).
 *
 * Sale SOLO del Gmail que conectó la veterinaria (Configuración →
 * Integraciones): el cliente ve el email de su veterinaria y las respuestas le
 * llegan a ella. Decisión del 2026-10-16: no se usa Resend ni la cuenta
 * compartida de VetPanel para esto.
 *
 * Nunca lanza: devuelve `skipped` si la veterinaria no conectó su Gmail (el
 * cron no gasta un intento y el recordatorio queda para avisar a mano).
 */

export interface ResultadoEmail {
  ok: boolean
  skipped?: boolean
  error?: string
}

export interface EmailCliente {
  to: string
  subject: string
  html: string
}

export async function enviarEmailCliente(tenantId: string, email: EmailCliente): Promise<ResultadoEmail> {
  const credenciales = await getGmailCredentials(tenantId)
  if (!credenciales?.refreshToken || !credenciales.senderEmail) return { ok: false, skipped: true }

  try {
    await enviarEmailGmail(
      {
        clientId: credenciales.clientId,
        clientSecret: credenciales.clientSecret,
        refreshToken: credenciales.refreshToken,
        senderEmail: credenciales.senderEmail,
      },
      email,
    )
    return { ok: true }
  } catch (error) {
    console.error("[email/cliente] Gmail:", error)
    return { ok: false, error: "Gmail rechazó el envío" }
  }
}
