"use client"

import { supabase } from "@/lib/supabase/config"
import type { PlanId } from "@/lib/plans"

/**
 * Llamadas del cliente a las rutas de billing. Todas mandan el access token de
 * Supabase: del lado del servidor se verifica que quien llama sea el dueño.
 *
 * No hay forma de cambiar el plan desde el cliente sin pasar por Mercado Pago:
 * los dos planes son pagos y el trigger de `tenants` bloquea el update directo.
 */

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error("Necesitás iniciar sesión")
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
}

export interface EstadoBilling {
  mercadoPagoConfigurado: boolean
  plan: PlanId
  status: "activo" | "pausado" | null
  trialExpiresAt: string | null
  /** Hay un checkout iniciado (cambio de plan) que MP todavía no confirmó. */
  checkoutPendiente: boolean
  suscripcion: {
    id: string
    status: string | null
    proximoCobro: string | null
    payerEmail: string | null
  } | null
}

export async function getEstadoBilling(tenantId: string, sync = false): Promise<EstadoBilling> {
  const headers = await authHeaders()
  const res = await fetch(`/api/billing/estado?tenantId=${encodeURIComponent(tenantId)}${sync ? "&sync=1" : ""}`, { headers })
  const json = await res.json()
  if (!json?.ok) throw new Error(json?.error || "No se pudo leer el estado del plan")
  return json as EstadoBilling
}

/** Crea la suscripción al plan y devuelve la URL de pago de Mercado Pago. */
export async function iniciarCheckout(tenantId: string, planId: PlanId): Promise<string> {
  const headers = await authHeaders()
  const res = await fetch("/api/billing/checkout", {
    method: "POST",
    headers,
    body: JSON.stringify({ tenantId, planId }),
  })
  const json = await res.json()
  if (!json?.ok || !json.initPoint) throw new Error(json?.error || "No se pudo iniciar el pago")
  return json.initPoint as string
}

export async function cancelarSuscripcion(tenantId: string): Promise<void> {
  const headers = await authHeaders()
  const res = await fetch("/api/billing/cancelar", {
    method: "POST",
    headers,
    body: JSON.stringify({ tenantId }),
  })
  const json = await res.json()
  if (!json?.ok) throw new Error(json?.error || "No se pudo cancelar la suscripción")
}
