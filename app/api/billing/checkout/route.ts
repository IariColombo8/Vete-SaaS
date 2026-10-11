import { NextResponse } from "next/server"
import { autorizarDueno } from "@/lib/billing/dueno"
import { crearSuscripcion, isMercadoPagoConfigured } from "@/lib/billing/mercadopago"
import { getPlan, normalizePlan } from "@/lib/plans"

/**
 * Crea una suscripción de Mercado Pago para contratar (o cambiar a) un plan.
 *
 * Body: { tenantId, planId: "basico" | "pro" }
 * Auth: header `Authorization: Bearer <Supabase access token>` — debe ser el
 * veterinario dueño del tenant (o superadmin).
 *
 * Responde { ok, initPoint } para redirigir al checkout de Mercado Pago.
 *
 * El id del preapproval nuevo se guarda en `mp_preapproval_pendiente`, nunca
 * sobre `mp_preapproval_id`: si el tenant ya tiene una suscripción cobrando
 * (cambio de plan), la vigente sigue hasta que la nueva se autorice; en ese
 * momento `aplicarEstadoPreapproval` cancela la vieja. Sin vigente, el
 * pendiente pasa a ser el id principal.
 */
export async function POST(request: Request) {
  if (!isMercadoPagoConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Mercado Pago no configurado en el servidor" },
      { status: 503 },
    )
  }

  let payload: { tenantId?: string; planId?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  const auth = await autorizarDueno(request, payload.tenantId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const tenantId = payload.tenantId as string
  const planId = normalizePlan(payload.planId)
  const plan = getPlan(planId)

  const { data: tenant, error: errTenant } = await auth.admin
    .from("tenants")
    .select("plan, mp_preapproval_id, mp_preapproval_status, email")
    .eq("slug", tenantId)
    .maybeSingle()
  if (errTenant || !tenant) {
    return NextResponse.json({ ok: false, error: "Veterinaria no encontrada" }, { status: 404 })
  }

  const suscripcionActiva = tenant.mp_preapproval_status === "authorized"
  if (suscripcionActiva && normalizePlan(tenant.plan as string) === planId) {
    return NextResponse.json(
      { ok: false, error: `Esta veterinaria ya tiene el plan ${plan.nombre} con una suscripción activa` },
      { status: 409 },
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.vetpanel.com.ar"
  const payerEmail = auth.email || (tenant.email as string | null) || ""
  if (!payerEmail) {
    return NextResponse.json({ ok: false, error: "Tu cuenta no tiene email" }, { status: 400 })
  }

  try {
    const suscripcion = await crearSuscripcion({
      tenantId,
      planId,
      planNombre: plan.nombre,
      montoMensual: plan.precioMensual,
      payerEmail,
      backUrl: `${appUrl}/${tenantId}/admin/Dashboard?billing=ok`,
    })

    const { error } = await auth.admin
      .from("tenants")
      .update(
        suscripcionActiva
          ? { mp_preapproval_pendiente: suscripcion.id }
          : { mp_preapproval_id: suscripcion.id, mp_preapproval_status: "pending", mp_preapproval_pendiente: null },
      )
      .eq("slug", tenantId)
    if (error) throw error

    await auth.admin.from("billing_eventos").insert({
      tenant_id: tenantId,
      origen: "checkout",
      tipo: "pending",
      preapproval_id: suscripcion.id,
      detalle: { usuario: auth.userId, plan: planId, monto: plan.precioMensual, cambioDePlan: suscripcionActiva },
    })

    return NextResponse.json({ ok: true, initPoint: suscripcion.initPoint, id: suscripcion.id })
  } catch (error) {
    console.error("[billing/checkout] Error:", error)
    return NextResponse.json({ ok: false, error: "No se pudo crear la suscripción" }, { status: 502 })
  }
}
