import { NextResponse } from "next/server"
import { autorizarDueno } from "@/lib/billing/dueno"
import { periodoActual, sumarMeses } from "@/lib/billing/cobro-manual"
import { inicioDebito } from "@/lib/billing/dia-debito"
import { crearSuscripcion, isMercadoPagoConfigured } from "@/lib/billing/mercadopago"
import { buscarPlan, normalizePlan } from "@/lib/plans"
import { cargarPlanesServidor } from "@/lib/planes-servidor"

/**
 * Crea una suscripción de Mercado Pago para contratar (o cambiar a) un plan.
 *
 * Body: { tenantId, planId } — un plan visible de la tabla `planes`.
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
/**
 * Monto reducido para probar el cobro real de punta a punta sin pagar el plan
 * completo. Solo con `BILLING_PRECIO_PRUEBA` cargado y para los emails de
 * `BILLING_PRUEBA_EMAILS` (separados por coma); al resto se le cobra el precio
 * del plan. Sacar las dos variables cuando termine la prueba.
 */
function precioDePrueba(email: string): number | null {
  const precio = Number(process.env.BILLING_PRECIO_PRUEBA)
  if (!Number.isFinite(precio) || precio <= 0 || !email) return null
  const emails = (process.env.BILLING_PRUEBA_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return emails.includes(email.toLowerCase()) ? precio : null
}

export async function POST(request: Request) {
  if (!isMercadoPagoConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Mercado Pago no configurado en el servidor" },
      { status: 503 },
    )
  }

  let payload: { tenantId?: string; planId?: string; payerEmail?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  const auth = await autorizarDueno(request, payload.tenantId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const tenantId = payload.tenantId as string
  // Precio vigente, sin cache: si el superadmin lo acaba de cambiar, se cobra el nuevo.
  await cargarPlanesServidor({ fresco: true })
  const plan = buscarPlan(payload.planId)
  if (!plan || !plan.visible) {
    return NextResponse.json({ ok: false, error: "Ese plan no se puede contratar" }, { status: 400 })
  }
  const planId = plan.id

  const { data: tenant, error: errTenant } = await auth.admin
    .from("tenants")
    .select("plan, mp_preapproval_id, mp_preapproval_status, email, trial_expires_at, cobro_manual")
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
  // MP solo deja pagar a la cuenta cuyo email coincide con `payer_email`, y el
  // de Mercado Pago muchas veces no es el del login: lo elige el dueño.
  const emailElegido = payload.payerEmail?.trim() ?? ""
  if (emailElegido && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailElegido)) {
    return NextResponse.json({ ok: false, error: "El email de Mercado Pago no es válido" }, { status: 400 })
  }
  const payerEmail = emailElegido || auth.email || (tenant.email as string | null) || ""
  if (!payerEmail) {
    return NextResponse.json({ ok: false, error: "Tu cuenta no tiene email" }, { status: 400 })
  }

  const monto = precioDePrueba(auth.email) ?? plan.precioMensual

  // El débito cae del 1 al 10 de cada mes (`inicioDebito`). Mes cubierto:
  // las de efectivo, por lo que ya pagaron (pueden ir adelantadas); el resto,
  // por la prueba vigente o por la suscripción que ya cobró este mes.
  const ahora = new Date()
  let primerMesImpago = periodoActual(ahora)
  if (tenant.cobro_manual) {
    const { data: pagos, error: errPagos } = await auth.admin
      .from("pagos_manuales")
      .select("periodo")
      .eq("tenant_id", tenantId)
      .is("anulado_at", null)
      .gte("periodo", primerMesImpago)
    if (errPagos) {
      console.error("[billing/checkout] Error al leer pagos manuales:", errPagos)
      return NextResponse.json({ ok: false, error: "No se pudieron leer los pagos" }, { status: 500 })
    }
    const pagados = new Set((pagos ?? []).map((p) => p.periodo as string))
    for (let i = 0; i < 24 && pagados.has(primerMesImpago); i++) primerMesImpago = sumarMeses(primerMesImpago, 1)
  } else {
    const trialVigente = tenant.trial_expires_at && new Date(tenant.trial_expires_at as string) > ahora
    if (trialVigente || suscripcionActiva) primerMesImpago = sumarMeses(primerMesImpago, 1)
  }
  const startDate = inicioDebito(ahora, primerMesImpago)

  try {
    const suscripcion = await crearSuscripcion({
      tenantId,
      planId,
      planNombre: plan.nombre,
      montoMensual: monto,
      payerEmail,
      backUrl: `${appUrl}/${tenantId}/admin/Dashboard?billing=ok`,
      startDate,
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
      detalle: {
        usuario: auth.userId, plan: planId, monto, cambioDePlan: suscripcionActiva,
        primerDebito: startDate ?? "inmediato", desdeEfectivo: Boolean(tenant.cobro_manual),
      },
    })

    return NextResponse.json({ ok: true, initPoint: suscripcion.initPoint, id: suscripcion.id })
  } catch (error) {
    console.error("[billing/checkout] Error:", error)
    return NextResponse.json({ ok: false, error: "No se pudo crear la suscripción" }, { status: 502 })
  }
}
