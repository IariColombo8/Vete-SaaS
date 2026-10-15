import { supabase } from "./config"
import { throwIfSupabaseError } from "./assert"
import type { EventoBilling, SuscripcionTenant } from "../superadmin/ingresos"

/**
 * Datos de facturación de toda la plataforma, para /superadmin. Las policies
 * de `tenants` y `billing_eventos` dejan leer todo solo al superadmin.
 */
export async function getFacturacionPlataforma(): Promise<{
  suscripciones: SuscripcionTenant[]
  eventos: EventoBilling[]
}> {
  const [tenants, eventos] = await Promise.all([
    supabase
      .from("tenants")
      .select("slug, plan, mp_preapproval_status, mp_preapproval_id, mp_next_payment_date, mp_payer_email"),
    supabase
      .from("billing_eventos")
      .select("tenant_id, tipo, preapproval_id, detalle, created_at")
      .order("created_at", { ascending: true }),
  ])
  throwIfSupabaseError(tenants.error, "Error al leer las suscripciones")
  throwIfSupabaseError(eventos.error, "Error al leer los eventos de billing")

  return {
    suscripciones: (tenants.data ?? []).map((t) => ({
      slug: t.slug as string,
      plan: (t.plan as string | null) ?? undefined,
      estado: (t.mp_preapproval_status as string | null) ?? null,
      preapprovalId: (t.mp_preapproval_id as string | null) ?? null,
      proximoCobro: (t.mp_next_payment_date as string | null) ?? null,
      payerEmail: (t.mp_payer_email as string | null) ?? null,
    })),
    eventos: (eventos.data ?? []).map((e) => ({
      tenantId: e.tenant_id as string,
      tipo: e.tipo as string,
      preapprovalId: (e.preapproval_id as string | null) ?? null,
      detalle: (e.detalle as Record<string, unknown> | null) ?? null,
      createdAt: e.created_at as string,
    })),
  }
}
