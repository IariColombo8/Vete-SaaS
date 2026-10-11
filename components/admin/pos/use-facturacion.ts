"use client"

import { supabase } from "@/lib/supabase/config"

/**
 * Cliente de la factura electrónica. El certificado y la clave viven en el
 * servidor; acá solo se piden acciones a `/api/facturacion/*` con el token
 * de Supabase, que del otro lado se verifica (staff para emitir, dueño para
 * configurar).
 */

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

export interface ResultadoEmision {
  comprobanteId: string
  estado: "emitido" | "rechazado"
  tipoCbte: number
  puntoVenta: number
  numero: number | null
  cae: string | null
  caeVto: string | null
  observaciones: { code: number; msg: string }[]
}

/** Factura de una venta (idempotente: si ya tiene, devuelve la existente). */
export async function emitirFactura(tenantId: string, ventaId: string): Promise<ResultadoEmision> {
  const headers = await authHeaders()
  const r = await pedir<{ comprobante: ResultadoEmision }>("/api/facturacion/emitir", {
    method: "POST",
    headers,
    body: JSON.stringify({ tenantId, ventaId }),
  })
  return r.comprobante
}

/** Nota de crédito que anula una factura emitida. */
export async function emitirNotaCredito(tenantId: string, comprobanteId: string): Promise<ResultadoEmision> {
  const headers = await authHeaders()
  const r = await pedir<{ comprobante: ResultadoEmision }>("/api/facturacion/emitir", {
    method: "POST",
    headers,
    body: JSON.stringify({ tenantId, comprobanteId }),
  })
  return r.comprobante
}

// ── Configuración (solo dueño) ──────────────────────────────────────────────

export interface ConfigFiscalCliente {
  cuit: string
  razonSocial: string
  domicilioFiscal: string | null
  condicionIva: "RI" | "MONOTRIBUTO" | "EXENTO"
  inicioActividades: string | null
  ingresosBrutos: string | null
  puntoVenta: number
  ambiente: "homologacion" | "produccion"
  csrPem: string | null
  tieneClave: boolean
  tieneCertificado: boolean
  certVenceAt: string | null
  ultimaPrueba: { at: string; ok: boolean; detalle: string } | null
}

export async function getConfigFacturacion(
  tenantId: string,
): Promise<{ cifradoConfigurado: boolean; config: ConfigFiscalCliente | null }> {
  const headers = await authHeaders()
  return pedir(`/api/facturacion/config?tenantId=${encodeURIComponent(tenantId)}`, { headers })
}

export type DatosFiscalesInput = Pick<
  ConfigFiscalCliente,
  "cuit" | "razonSocial" | "domicilioFiscal" | "condicionIva" | "inicioActividades" | "ingresosBrutos" | "puntoVenta" | "ambiente"
>

export async function guardarDatosFiscales(tenantId: string, datos: DatosFiscalesInput): Promise<void> {
  const headers = await authHeaders()
  await pedir("/api/facturacion/config", {
    method: "POST",
    headers,
    body: JSON.stringify({ tenantId, accion: "guardar", ...datos }),
  })
}

export async function generarCsr(tenantId: string): Promise<string> {
  const headers = await authHeaders()
  const r = await pedir<{ csrPem: string }>("/api/facturacion/config", {
    method: "POST",
    headers,
    body: JSON.stringify({ tenantId, accion: "generar_csr" }),
  })
  return r.csrPem
}

export async function cargarCertificado(tenantId: string, certPem: string): Promise<{ vence: string }> {
  const headers = await authHeaders()
  return pedir("/api/facturacion/config", {
    method: "POST",
    headers,
    body: JSON.stringify({ tenantId, accion: "cargar_cert", certPem }),
  })
}

export async function probarConexionArca(tenantId: string): Promise<{ ok: boolean; detalle: string }> {
  const headers = await authHeaders()
  const r = await pedir<{ prueba: { ok: boolean; detalle: string } }>("/api/facturacion/config", {
    method: "POST",
    headers,
    body: JSON.stringify({ tenantId, accion: "probar" }),
  })
  return r.prueba
}

export async function borrarConfigFacturacion(tenantId: string): Promise<void> {
  const headers = await authHeaders()
  await pedir("/api/facturacion/config", { method: "DELETE", headers, body: JSON.stringify({ tenantId }) })
}
