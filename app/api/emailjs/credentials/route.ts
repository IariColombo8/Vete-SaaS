import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase/server"
import { getEmailJsCredentials, upsertEmailJsCredentials } from "@/lib/supabase/email-credentials"

/**
 * Guarda las credenciales de EmailJS de un tenant (Service ID, Template ID,
 * Public Key, Private Key). Mismo patrón que /api/gmail/credentials: la tabla
 * `tenant_email_credentials` no tiene policies para anon/authenticated, así
 * que esta ruta con service_role es el único camino de escritura.
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
  let body: {
    tenantId?: string
    serviceId?: string
    templateId?: string
    publicKey?: string
    privateKey?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  const { tenantId, serviceId, templateId, publicKey, privateKey } = body
  if (!tenantId || !serviceId || !templateId || !publicKey || !privateKey) {
    return NextResponse.json({ ok: false, error: "Faltan campos" }, { status: 400 })
  }

  if (!(await verificarStaff(tenantId))) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 })
  }

  try {
    await upsertEmailJsCredentials(tenantId, { serviceId, templateId, publicKey, privateKey })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[emailjs/credentials] Error al guardar:", error)
    return NextResponse.json({ ok: false, error: "No se pudo guardar" }, { status: 500 })
  }
}

/** Estado de la configuración (sin exponer la Private Key). */
export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenant")
  if (!tenantId) {
    return NextResponse.json({ error: "Falta tenant" }, { status: 400 })
  }
  if (!(await verificarStaff(tenantId))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  }

  const credenciales = await getEmailJsCredentials(tenantId)
  return NextResponse.json({
    configurado: Boolean(credenciales),
    serviceId: credenciales?.serviceId ?? null,
    templateId: credenciales?.templateId ?? null,
    publicKey: credenciales?.publicKey ?? null,
  })
}
