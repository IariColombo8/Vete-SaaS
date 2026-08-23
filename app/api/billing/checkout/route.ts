import { NextResponse } from "next/server"
import { getAdminDb, verificarToken } from "@/lib/supabase/admin"
import { crearSuscripcion, isMercadoPagoConfigured } from "@/lib/billing/mercadopago"
import { getPlan, normalizePlan } from "@/lib/plans"

/**
 * Crea una suscripción de Mercado Pago para mejorar el plan de un tenant.
 *
 * Body: { tenantId, planId }
 * Auth: header `Authorization: Bearer <Supabase access token>` — debe ser el
 * veterinario dueño del tenant (o superadmin).
 *
 * Responde { ok, initPoint } para redirigir al checkout de Mercado Pago.
 */
export async function POST(request: Request) {
  if (!isMercadoPagoConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Mercado Pago no configurado en el servidor" },
      { status: 503 },
    )
  }

  const admin = getAdminDb()
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Supabase Admin no configurado" }, { status: 503 })
  }

  let payload: { tenantId?: string; planId?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  const tenantId = payload.tenantId
  const planId = normalizePlan(payload.planId)
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Falta tenantId" }, { status: 400 })
  }

  // Verificar identidad y rol.
  const authHeader = request.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  if (!token) return NextResponse.json({ ok: false, error: "Falta token" }, { status: 401 })

  const user = await verificarToken(token)
  if (!user) {
    return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 401 })
  }

  const email = user.email || ""
  const { data: userData } = await admin
    .from("usuarios")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle()

  const esDueño = userData?.role === "veterinario" && userData?.tenant_id === tenantId
  const esSuper = userData?.role === "superadmin"
  if (!esDueño && !esSuper) {
    return NextResponse.json({ ok: false, error: "Sin permiso sobre este tenant" }, { status: 403 })
  }

  const plan = getPlan(planId)
  if (plan.precioMensual <= 0) {
    return NextResponse.json({ ok: false, error: "El plan seleccionado no es pago" }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://vetpanel.app"
  try {
    const suscripcion = await crearSuscripcion({
      tenantId,
      planId,
      planNombre: plan.nombre,
      montoMensual: plan.precioMensual,
      payerEmail: email,
      backUrl: `${appUrl}/${tenantId}/admin?billing=ok`,
    })
    return NextResponse.json({ ok: true, initPoint: suscripcion.initPoint, id: suscripcion.id })
  } catch (error) {
    console.error("[billing/checkout] Error:", error)
    return NextResponse.json({ ok: false, error: "No se pudo crear la suscripción" }, { status: 502 })
  }
}
