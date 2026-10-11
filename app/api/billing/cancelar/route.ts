import { NextResponse } from "next/server"
import { autorizarDueno } from "@/lib/billing/dueno"
import { cancelarPreapproval, isMercadoPagoConfigured } from "@/lib/billing/mercadopago"
import { aplicarEstadoPreapproval } from "@/lib/billing/aplicar-estado"

/**
 * Baja de la suscripción Pro, iniciada por el dueño desde Configuración → Plan.
 *
 * Body: { tenantId }
 * Auth: dueño del tenant.
 *
 * Primero se cancela en Mercado Pago y recién después se baja el plan, en ese
 * orden: si se bajara el plan primero y MP fallara, el tenant seguiría
 * pagando por algo que ya no tiene.
 */
export async function POST(request: Request) {
  let payload: { tenantId?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  const auth = await autorizarDueno(request, payload.tenantId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const tenantId = payload.tenantId as string

  const { data: tenant, error } = await auth.admin
    .from("tenants")
    .select("mp_preapproval_id, mp_preapproval_status")
    .eq("slug", tenantId)
    .maybeSingle()
  if (error || !tenant) {
    return NextResponse.json({ ok: false, error: "Veterinaria no encontrada" }, { status: 404 })
  }
  if (!tenant.mp_preapproval_id) {
    return NextResponse.json({ ok: false, error: "No hay una suscripción para cancelar" }, { status: 409 })
  }
  if (!isMercadoPagoConfigured()) {
    return NextResponse.json({ ok: false, error: "Mercado Pago no configurado en el servidor" }, { status: 503 })
  }

  try {
    const info = await cancelarPreapproval(tenant.mp_preapproval_id as string)
    const resultado = await aplicarEstadoPreapproval(auth.admin, info, "panel")
    return NextResponse.json({ ok: true, status: info.status, plan: resultado?.plan ?? null })
  } catch (err) {
    console.error("[billing/cancelar] Error:", err)
    return NextResponse.json({ ok: false, error: "No se pudo cancelar la suscripción" }, { status: 502 })
  }
}
