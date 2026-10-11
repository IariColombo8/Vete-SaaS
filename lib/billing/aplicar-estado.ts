import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizePlan, type PlanId } from "@/lib/plans"
import { cancelarPreapproval, parseExternalReference, type PreapprovalInfo } from "./mercadopago"

/**
 * Traduce el estado de un preapproval de Mercado Pago al plan del tenant.
 * Lo usan el webhook, la sincronización manual (vuelta del checkout), la baja
 * desde el panel y el cron de conciliación, así los cuatro aplican exactamente
 * la misma regla:
 *
 *  - authorized          → el plan que dice el `external_reference`
 *                          ("tenant:basico" o "tenant:pro"), status activo,
 *                          se apaga el trial. Si había OTRA suscripción
 *                          autorizada (cambio de plan), se cancela en MP para
 *                          no cobrar dos veces.
 *  - cancelled / paused  → sin suscripción activa: el panel queda en solo
 *                          lectura (`trial_expires_at = now()`, mismo
 *                          mecanismo que el fin de la prueba) hasta que el
 *                          dueño contrate un plan. Solo si la suscripción que
 *                          cayó es la vigente: una vieja ya reemplazada no
 *                          puede bloquear el panel.
 *  - pending             → no cambia el plan; se guarda el id para seguirlo.
 *
 * Siempre deja rastro en `billing_eventos`.
 */
export type OrigenEvento = "webhook" | "checkout" | "cron" | "panel"

export interface ResultadoAplicar {
  tenantId: string
  plan: PlanId | null
  status: string
  aplicado: boolean
}

export async function aplicarEstadoPreapproval(
  admin: SupabaseClient,
  info: PreapprovalInfo,
  origen: OrigenEvento,
): Promise<ResultadoAplicar | null> {
  const ref = parseExternalReference(info.externalReference)
  if (!ref) return null
  const { tenantId } = ref

  const { data: tenant, error: errTenant } = await admin
    .from("tenants")
    .select("slug, plan, mp_preapproval_id, mp_preapproval_status, mp_preapproval_pendiente")
    .eq("slug", tenantId)
    .maybeSingle()
  if (errTenant) throw errTenant
  if (!tenant) return null

  const registrar = async (tipo: string, detalle: Record<string, unknown> = {}) => {
    const { error } = await admin.from("billing_eventos").insert({
      tenant_id: tenantId,
      origen,
      tipo,
      preapproval_id: info.id,
      detalle: { status: info.status, next_payment_date: info.nextPaymentDate, ...detalle },
    })
    if (error) console.error("[billing] No se pudo registrar el evento:", error.message)
  }

  if (info.status === "authorized") {
    const planId = normalizePlan(ref.planId)

    // Cambio de plan: la suscripción anterior sigue cobrando hasta que
    // alguien la cancele. Se hace acá, antes de pisar el id vigente.
    const anterior = tenant.mp_preapproval_id as string | null
    if (anterior && anterior !== info.id && tenant.mp_preapproval_status === "authorized") {
      try {
        await cancelarPreapproval(anterior)
        await registrar("reemplazada", { cancelada: anterior, nueva: info.id })
      } catch (e) {
        console.error("[billing] No se pudo cancelar la suscripción anterior", anterior, e)
        await registrar("reemplazo_fallido", { anterior, error: e instanceof Error ? e.message : String(e) })
      }
    }

    const { error } = await admin
      .from("tenants")
      .update({
        plan: planId,
        status: "activo",
        trial_expires_at: null,
        mp_preapproval_id: info.id,
        mp_preapproval_status: info.status,
        mp_next_payment_date: info.nextPaymentDate,
        mp_payer_email: info.payerEmail,
        mp_preapproval_pendiente: tenant.mp_preapproval_pendiente === info.id ? null : tenant.mp_preapproval_pendiente,
      })
      .eq("slug", tenantId)
    if (error) throw error
    await registrar("authorized", { plan: planId })
    return { tenantId, plan: planId, status: info.status, aplicado: true }
  }

  if (info.status === "cancelled" || info.status === "paused") {
    // Un checkout abandonado que MP terminó cancelando: se suelta y nada más.
    if (tenant.mp_preapproval_pendiente === info.id && tenant.mp_preapproval_id !== info.id) {
      const { error } = await admin.from("tenants").update({ mp_preapproval_pendiente: null }).eq("slug", tenantId)
      if (error) throw error
      await registrar(`${info.status}_pendiente`)
      return { tenantId, plan: null, status: info.status, aplicado: false }
    }
    const esLaVigente = !tenant.mp_preapproval_id || tenant.mp_preapproval_id === info.id
    if (!esLaVigente) {
      await registrar(`${info.status}_ignorado`, { vigente: tenant.mp_preapproval_id })
      return { tenantId, plan: null, status: info.status, aplicado: false }
    }
    const { error } = await admin
      .from("tenants")
      .update({
        mp_preapproval_status: info.status,
        mp_next_payment_date: null,
        // Sin suscripción no hay plan: solo lectura hasta contratar uno.
        trial_expires_at: new Date().toISOString(),
      })
      .eq("slug", tenantId)
    if (error) throw error
    await registrar(info.status, { bloqueado: true })
    return { tenantId, plan: normalizePlan(tenant.plan as string), status: info.status, aplicado: true }
  }

  // pending u otro estado intermedio: solo seguimiento. Si ya hay una
  // suscripción cobrando, la nueva queda como pendiente y no la pisa.
  const hayVigente = tenant.mp_preapproval_id && tenant.mp_preapproval_id !== info.id
    && tenant.mp_preapproval_status === "authorized"
  const { error } = await admin
    .from("tenants")
    .update(
      hayVigente
        ? { mp_preapproval_pendiente: info.id }
        : { mp_preapproval_id: info.id, mp_preapproval_status: info.status, mp_preapproval_pendiente: null },
    )
    .eq("slug", tenantId)
  if (error) throw error
  await registrar(info.status)
  return { tenantId, plan: null, status: info.status, aplicado: false }
}
