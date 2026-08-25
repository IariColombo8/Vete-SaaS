import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase/server"
import { getGmailCredentials, upsertGmailClientCredentials } from "@/lib/supabase/email-credentials"

/**
 * Guarda el Client ID / Client Secret de Gmail de un tenant (paso previo a
 * conectar la cuenta en /api/gmail/auth). `tenant_email_credentials` no tiene
 * policies para anon/authenticated, así que esta ruta con service_role es el
 * único camino de escritura — nunca vía el cliente Supabase del navegador.
 *
 * Auth: cookies de sesión (mismo patrón que /api/gmail/auth). Solo staff del
 * tenant o superadmin.
 */
async function verificarStaff(tenantId: string) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle()

  return usuario?.tenant_id === tenantId || usuario?.role === "superadmin"
}

export async function POST(request: NextRequest) {
  let body: { tenantId?: string; clientId?: string; clientSecret?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  const { tenantId, clientId, clientSecret } = body
  if (!tenantId || !clientId || !clientSecret) {
    return NextResponse.json({ ok: false, error: "Faltan campos" }, { status: 400 })
  }

  if (!(await verificarStaff(tenantId))) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 })
  }

  try {
    await upsertGmailClientCredentials(tenantId, clientId, clientSecret)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[gmail/credentials] Error al guardar:", error)
    return NextResponse.json({ ok: false, error: "No se pudo guardar" }, { status: 500 })
  }
}

/** Estado de la conexión (sin exponer client_secret ni refresh_token). */
export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenant")
  if (!tenantId) {
    return NextResponse.json({ error: "Falta tenant" }, { status: 400 })
  }
  if (!(await verificarStaff(tenantId))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  }

  const credenciales = await getGmailCredentials(tenantId)
  return NextResponse.json({
    tieneClientId: Boolean(credenciales?.clientId),
    conectado: Boolean(credenciales?.refreshToken),
    senderEmail: credenciales?.senderEmail ?? null,
  })
}
