import { NextResponse } from "next/server"
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin"
import { crearSuscripcion, isMercadoPagoConfigured } from "@/lib/billing/mercadopago"
import { getPlan, normalizePlan } from "@/lib/plans"

/**
 * Crea una suscripción de Mercado Pago para mejorar el plan de un tenant.
 *
 * Body: { tenantId, planId }
 * Auth: header `Authorization: Bearer <Firebase ID token>` — debe ser el
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

  const adminAuth = getAdminAuth()
  const adminDb = getAdminDb()
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ ok: false, error: "Firebase Admin no configurado" }, { status: 503 })
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

  let email = ""
  try {
    const decoded = await adminAuth.verifyIdToken(token)
    email = decoded.email || ""
    const userSnap = await adminDb.collection("usuarios").doc(decoded.uid).get()
    const userData = userSnap.data() as { role?: string; tenantId?: string } | undefined
    const esDueño = userData?.role === "veterinario" && userData?.tenantId === tenantId
    const esSuper = userData?.role === "superadmin"
    if (!esDueño && !esSuper) {
      return NextResponse.json({ ok: false, error: "Sin permiso sobre este tenant" }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 401 })
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
