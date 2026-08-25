import "server-only"

/**
 * Envío de emails vía EmailJS, usando la cuenta propia del tenant. Alternativa
 * a Resend/Gmail cuando `tenants.email_provider === "emailjs"`.
 *
 * EmailJS está pensado para dispararse desde el navegador con la Public Key;
 * llamado desde el servidor (sin `origin` de un sitio permitido) hace falta
 * mandar la Private Key como `accessToken` para que la API no lo rechace.
 */

const EMAILJS_ENDPOINT = "https://api.emailjs.com/api/v1.0/email/send"

export interface EmailJsCredentials {
  serviceId: string
  templateId: string
  publicKey: string
  privateKey: string
}

export async function enviarEmailJs(
  credenciales: EmailJsCredentials,
  templateParams: Record<string, string>,
): Promise<void> {
  const res = await fetch(EMAILJS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: credenciales.serviceId,
      template_id: credenciales.templateId,
      user_id: credenciales.publicKey,
      accessToken: credenciales.privateKey,
      template_params: templateParams,
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`EmailJS respondió ${res.status}: ${detail}`)
  }
}
