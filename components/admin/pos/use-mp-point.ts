"use client"

import { supabase } from "@/lib/supabase/config"

/**
 * Cliente de la integración con Mercado Pago Point. El token de la
 * veterinaria nunca llega acá: todo pasa por `/api/mp-point/*`, que lo lee
 * con service_role después de verificar que quien llama es staff del tenant.
 */

export type TipoTarjetaPoint = "credit_card" | "debit_card"
export type ResultadoCobroPoint = "en_curso" | "aprobada" | "rechazada" | "cancelada" | "expirada"

export interface EstadoPoint {
  configurado: boolean
  terminalId: string | null
  terminalNombre: string | null
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error("Necesitás iniciar sesión")
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
}

async function pedir<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json?.ok) throw new Error(json?.error || "Error de comunicación con el servidor")
  return json as T
}

/** ¿Este tenant tiene Point conectado y terminal elegida? (RPC, sin token). */
export async function getEstadoPoint(tenantId: string): Promise<EstadoPoint> {
  const { data, error } = await supabase.rpc("mp_point_estado", { p_tenant: tenantId })
  if (error) throw new Error(error.message)
  const d = (data ?? {}) as { configurado?: boolean; terminal_id?: string | null; terminal_nombre?: string | null }
  return {
    configurado: Boolean(d.configurado) && Boolean(d.terminal_id),
    terminalId: d.terminal_id ?? null,
    terminalNombre: d.terminal_nombre ?? null,
  }
}

export async function crearCobroPoint(
  tenantId: string,
  input: { monto: number; descripcion?: string; tipoTarjeta?: TipoTarjetaPoint; cuotas?: number },
): Promise<{ cobroId: string; orderId: string }> {
  const headers = await authHeaders()
  return pedir("/api/mp-point/cobros", {
    method: "POST",
    headers,
    body: JSON.stringify({ tenantId, ...input }),
  })
}

export async function consultarCobroPoint(
  tenantId: string,
  cobroId: string,
): Promise<{ estado: string; detalle: string | null; resultado: ResultadoCobroPoint; paymentId: string | null }> {
  const headers = await authHeaders()
  return pedir(`/api/mp-point/cobros/${cobroId}?tenantId=${encodeURIComponent(tenantId)}`, { headers })
}

export async function cancelarCobroPoint(tenantId: string, cobroId: string): Promise<{ resultado: ResultadoCobroPoint }> {
  const headers = await authHeaders()
  return pedir(`/api/mp-point/cobros/${cobroId}`, {
    method: "DELETE",
    headers,
    body: JSON.stringify({ tenantId }),
  })
}

export async function vincularCobroPoint(tenantId: string, cobroId: string, ventaId: string): Promise<void> {
  const headers = await authHeaders()
  await pedir(`/api/mp-point/cobros/${cobroId}/vincular`, {
    method: "POST",
    headers,
    body: JSON.stringify({ tenantId, ventaId }),
  })
}

// ── Configuración (solo dueño) ──────────────────────────────────────────────

export interface TerminalPoint {
  id: string
  operatingMode: "PDV" | "STANDALONE" | "UNDEFINED"
  posId: number | null
  storeId: string | null
}

export interface ConfigPointCliente {
  configurado: boolean
  terminalId?: string | null
  terminalNombre?: string | null
  printOnTerminal?: boolean
  terminales: TerminalPoint[]
  errorToken?: string | null
  requiereReinicio?: boolean
}

export async function getConfigPoint(tenantId: string): Promise<ConfigPointCliente> {
  const headers = await authHeaders()
  return pedir(`/api/mp-point/config?tenantId=${encodeURIComponent(tenantId)}`, { headers })
}

export async function guardarConfigPoint(
  tenantId: string,
  input: { accessToken?: string; terminalId?: string; printOnTerminal?: boolean },
): Promise<ConfigPointCliente> {
  const headers = await authHeaders()
  return pedir("/api/mp-point/config", {
    method: "POST",
    headers,
    body: JSON.stringify({ tenantId, ...input }),
  })
}

export async function desconectarPoint(tenantId: string): Promise<void> {
  const headers = await authHeaders()
  await pedir("/api/mp-point/config", { method: "DELETE", headers, body: JSON.stringify({ tenantId }) })
}
