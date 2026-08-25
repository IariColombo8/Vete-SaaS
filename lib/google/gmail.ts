import "server-only"
import { google } from "googleapis"

/**
 * Envío de emails vía Gmail API (OAuth2 delegado), usando las credenciales
 * propias del tenant. Alternativa a Resend cuando `tenants.email_provider === "gmail"`.
 *
 * Requiere un refresh_token obtenido una vez por consentimiento OAuth
 * (ver app/api/gmail/auth y app/api/gmail/callback). El client_id/secret
 * vienen de la Google Cloud Console del propio tenant (tipo "Web application").
 */

export interface GmailCredentials {
  clientId: string
  clientSecret: string
  refreshToken: string
  senderEmail: string
}

interface EnviarGmailInput {
  to: string
  subject: string
  html: string
}

/** Arma un mensaje RFC 2822 mínimo (HTML) y lo codifica en base64url, como pide la Gmail API. */
function construirMensaje(from: string, to: string, subject: string, html: string): string {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`
  const lineas = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ]
  return Buffer.from(lineas.join("\r\n"), "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

export async function enviarEmailGmail(
  credenciales: GmailCredentials,
  datos: EnviarGmailInput,
): Promise<void> {
  const oauth2Client = new google.auth.OAuth2(credenciales.clientId, credenciales.clientSecret)
  oauth2Client.setCredentials({ refresh_token: credenciales.refreshToken })

  const gmail = google.gmail({ version: "v1", auth: oauth2Client })

  const raw = construirMensaje(credenciales.senderEmail, datos.to, datos.subject, datos.html)

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  })
}
