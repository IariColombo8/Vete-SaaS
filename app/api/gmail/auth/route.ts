import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase/server"
import { getGmailCredentials } from "@/lib/supabase/email-credentials"

/**
 * Inicia el consentimiento OAuth de Google (Gmail + Calendar) para un tenant.
 *
 * Un solo consentimiento cubre ambos: enviar emails como esa cuenta y crear
 * eventos en su calendario. Así el tenant conecta su cuenta de Google una
 * sola vez en vez de armar por separado una service account para Calendar.
 *
 * GET /api/gmail/auth?tenant=<slug> — navegación de página completa (no fetch),
 * el propio staff logueado hace click en "Conectar con Google" desde
 * Configuración. Usa las cookies de sesión para confirmar que quien pide el
 * consentimiento es staff de ESE tenant (o superadmin): sin esto, cualquiera
 * podría colgar su propia cuenta de Google de otra veterinaria.
 *
 * El client_id/secret deben haberse guardado antes en `tenant_email_credentials`
 * (paso previo en Configuración). Acá solo se arma la URL de consentimiento.
 */
export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenant")
  if (!tenantId) {
    return NextResponse.json({ error: "Falta el parámetro tenant" }, { status: 400 })
  }

  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle()

  const esStaffDelTenant = usuario?.tenant_id === tenantId
  const esSuperadmin = usuario?.role === "superadmin"
  if (!esStaffDelTenant && !esSuperadmin) {
    return NextResponse.json({ error: "No autorizado para este tenant" }, { status: 403 })
  }

  const credenciales = await getGmailCredentials(tenantId)
  if (!credenciales) {
    return NextResponse.json(
      { error: "Guardá el Client ID y Client Secret de Gmail antes de conectar" },
      { status: 400 },
    )
  }

  const redirectUri = `${request.nextUrl.origin}/api/gmail/callback`
  const params = new URLSearchParams({
    client_id: credenciales.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/calendar.events",
    ].join(" "),
    state: tenantId,
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
}
