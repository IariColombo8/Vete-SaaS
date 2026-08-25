import { NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"
import { getGmailCredentials, saveGmailTokens } from "@/lib/supabase/email-credentials"

/**
 * Callback del consentimiento OAuth de Gmail.
 *
 * Google redirige acá con `code` + `state` (el slug del tenant, seteado en
 * /api/gmail/auth). Intercambia el code por tokens, guarda el refresh_token
 * — la parte que permite enviar emails sin que nadie vuelva a loguearse — y
 * el email de la cuenta conectada (decodificado del id_token, scope `email`).
 *
 * Sin validación de sesión acá: el `state` ya probó que el flujo lo arrancó
 * un staff autorizado en /api/gmail/auth, y el `code` de Google solo es
 * canjeable con el client_secret exacto de ese tenant.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const tenantId = request.nextUrl.searchParams.get("state")
  const errorParam = request.nextUrl.searchParams.get("error")

  const volverAConfig = (query: string) =>
    NextResponse.redirect(`${request.nextUrl.origin}/${tenantId}/configuracion?${query}`)

  if (errorParam) {
    return volverAConfig(`gmail_error=${encodeURIComponent(errorParam)}`)
  }
  if (!code || !tenantId) {
    return NextResponse.json({ error: "Falta code o state" }, { status: 400 })
  }

  const credenciales = await getGmailCredentials(tenantId)
  if (!credenciales) {
    return volverAConfig("gmail_error=credenciales_no_encontradas")
  }

  const redirectUri = `${request.nextUrl.origin}/api/gmail/callback`
  const oauth2Client = new google.auth.OAuth2(
    credenciales.clientId,
    credenciales.clientSecret,
    redirectUri,
  )

  try {
    const { tokens } = await oauth2Client.getToken(code)
    if (!tokens.refresh_token) {
      // Google solo manda refresh_token la PRIMERA vez que el usuario da consentimiento
      // (o si se revoca el acceso antes). Si ya se conectó una vez, hay que revocar
      // el acceso en https://myaccount.google.com/permissions y repetir el flujo.
      return volverAConfig("gmail_error=sin_refresh_token")
    }

    let senderEmail = ""
    if (tokens.id_token) {
      const payload = JSON.parse(
        Buffer.from(tokens.id_token.split(".")[1], "base64").toString("utf-8"),
      )
      senderEmail = payload.email ?? ""
    }

    await saveGmailTokens(tenantId, tokens.refresh_token, senderEmail)

    return volverAConfig("gmail_conectado=1")
  } catch (error) {
    console.error("[gmail/callback] Error canjeando el code:", error)
    return volverAConfig("gmail_error=intercambio_fallido")
  }
}
