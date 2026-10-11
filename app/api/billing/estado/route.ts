import { NextResponse } from "next/server"
import { autorizarDueno } from "@/lib/billing/dueno"
import { getPreapproval, isMercadoPagoConfigured } from "@/lib/billing/mercadopago"
import { aplicarEstadoPreapproval } from "@/lib/billing/aplicar-estado"
import { normalizePlan } from "@/lib/plans"

/**
 * Estado de la suscripción de un tenant, para la pestaña "Plan" del panel.
 *
 * GET /api/billing/estado?tenantId=...&sync=1
 * Auth: dueño del tenant (Bearer token de Supabase).
 *
 * Devuelve lo guardado en `tenants`. Con `sync=1` (vuelta del checkout, o el
 * botón "Actualizar") primero consulta a Mercado Pago el checkout pendiente
 * y la suscripción vigente y aplica el estado real, por si el webhook todavía
 * no llegó o se perdió.
 */
const COLUMNAS =
  "plan, status, trial_expires_at, mp_preapproval_id, mp_preapproval_status, mp_next_payment_date, mp_payer_email, mp_preapproval_pendiente"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const tenantId = url.searchParams.get("tenantId")
  const sync = url.searchParams.get("sync") === "1"

  const auth = await autorizarDueno(request, tenantId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  try {
    const leer = () => auth.admin.from("tenants").select(COLUMNAS).eq("slug", tenantId as string).maybeSingle()

    let { data: tenant, error } = await leer()
    if (error) throw error
    if (!tenant) return NextResponse.json({ ok: false, error: "Veterinaria no encontrada" }, { status: 404 })

    let sincronizado = false
    if (sync && isMercadoPagoConfigured()) {
      const ids = [tenant.mp_preapproval_pendiente, tenant.mp_preapproval_id].filter(
        (v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i,
      )
      for (const id of ids) {
        const info = await getPreapproval(id)
        if (info) {
          await aplicarEstadoPreapproval(auth.admin, info, "panel")
          sincronizado = true
        }
      }
      if (sincronizado) {
        const relectura = await leer()
        if (relectura.error) throw relectura.error
        tenant = relectura.data ?? tenant
      }
    }

    return NextResponse.json({
      ok: true,
      sincronizado,
      mercadoPagoConfigurado: isMercadoPagoConfigured(),
      plan: normalizePlan(tenant.plan as string),
      status: tenant.status,
      trialExpiresAt: tenant.trial_expires_at,
      checkoutPendiente: Boolean(tenant.mp_preapproval_pendiente),
      suscripcion: tenant.mp_preapproval_id
        ? {
            id: tenant.mp_preapproval_id,
            status: tenant.mp_preapproval_status,
            proximoCobro: tenant.mp_next_payment_date,
            payerEmail: tenant.mp_payer_email,
          }
        : null,
    })
  } catch (error) {
    console.error("[billing/estado] Error:", error)
    return NextResponse.json({ ok: false, error: "No se pudo leer el estado" }, { status: 500 })
  }
}
