import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/supabase/admin"
import { getPreapproval } from "@/lib/billing/mercadopago"
import { normalizePlan } from "@/lib/plans"

/**
 * Webhook de Mercado Pago para suscripciones (preapproval).
 *
 * MP notifica cambios de estado. Verificamos el estado real consultando la
 * API (no confiamos en el payload) y, si la suscripción está autorizada,
 * actualizamos el plan del tenant con la service_role key.
 *
 * `external_reference` = "tenantId:planId".
 *
 * Nota: configurar la URL de webhook en el panel de Mercado Pago apuntando a
 * `/api/billing/webhook`. Para mayor seguridad puede agregarse validación de
 * firma (x-signature) — pendiente de las credenciales del proyecto.
 */
export async function POST(request: Request) {
  const admin = getAdminDb()
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Supabase Admin no configurado" }, { status: 503 })
  }

  let body: { type?: string; action?: string; data?: { id?: string } }
  try {
    body = await request.json()
  } catch {
    // MP a veces envía query params; respondemos 200 para evitar reintentos infinitos.
    return NextResponse.json({ ok: true, ignored: true })
  }

  const tipo = body.type || body.action || ""
  const preapprovalId = body.data?.id
  if (!preapprovalId || !tipo.includes("preapproval")) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  try {
    const info = await getPreapproval(preapprovalId)
    if (!info) return NextResponse.json({ ok: true, ignored: true })

    const [tenantId, planIdRaw] = (info.externalReference || "").split(":")
    if (!tenantId) return NextResponse.json({ ok: true, ignored: true })

    if (info.status === "authorized") {
      const planId = normalizePlan(planIdRaw)
      const { error } = await admin
        .from("tenants")
        .update({ plan: planId, status: "activo", mp_preapproval_id: info.id })
        .eq("slug", tenantId)
      if (error) throw error
      return NextResponse.json({ ok: true, applied: true, tenantId, plan: planId })
    }

    if (info.status === "cancelled" || info.status === "paused") {
      // Baja de plan: volver a básico al cancelarse la suscripción.
      const { error } = await admin
        .from("tenants")
        .update({ plan: "basico" })
        .eq("slug", tenantId)
      if (error) throw error
      return NextResponse.json({ ok: true, applied: true, tenantId, plan: "basico" })
    }

    return NextResponse.json({ ok: true, status: info.status })
  } catch (error) {
    console.error("[billing/webhook] Error:", error)
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 })
  }
}
