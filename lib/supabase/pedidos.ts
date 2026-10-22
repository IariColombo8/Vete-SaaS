import { supabase } from "./config"
import { throwIfSupabaseError } from "./assert"
import {
  pedidoDesdeFila,
  tiendaPublicaDesdeJson,
  type EstadoPedido,
  type MedioPagoWeb,
  type Pedido,
  type TiendaPublica,
} from "@/lib/pedidos/tipos"
import type { ItemRPC } from "@/lib/ventas/carrito"
import type { MedioPago } from "./types"

/**
 * Pedidos de la vidriera (066_pedidos_web.sql).
 *
 * Panel: lee directo (RLS `es_staff`) y escribe por RPC. El alta y el cobro
 * online los hace el servidor (`/api/tienda/*`), porque el comprador no es
 * staff y los precios no pueden salir del navegador.
 */

// ── Configuración de la tienda ──

export async function getTiendaPublica(tenantId: string): Promise<TiendaPublica> {
  const { data, error } = await supabase.rpc("tienda_publica", { p_tenant: tenantId })
  if (error) {
    // Sin la migración 066 la vidriera sigue andando, solo sin carrito.
    console.error("Error leyendo la configuración de la tienda:", error.message)
    return tiendaPublicaDesdeJson(null)
  }
  return tiendaPublicaDesdeJson(data as Record<string, unknown>)
}

export interface TiendaConfigInput {
  pedidosHabilitados: boolean
  retiroHabilitado: boolean
  envioHabilitado: boolean
  notaEnvio: string
  medios: MedioPagoWeb[]
  aliasTransferencia: string
  titularTransferencia: string
}

export async function guardarTiendaConfig(tenantId: string, c: TiendaConfigInput): Promise<void> {
  const { error } = await supabase.from("tienda_config").upsert({
    tenant_id: tenantId,
    pedidos_habilitados: c.pedidosHabilitados,
    retiro_habilitado: c.retiroHabilitado,
    envio_habilitado: c.envioHabilitado,
    nota_envio: c.notaEnvio.trim(),
    medios: c.medios,
    alias_transferencia: c.aliasTransferencia.trim(),
    titular_transferencia: c.titularTransferencia.trim(),
    updated_at: new Date().toISOString(),
  })
  throwIfSupabaseError(error, "Error al guardar la configuración de la tienda")
}

// ── Panel ──

const COLS = "*, pedido_items(*)"

/** Pedidos abiertos (todos) más los últimos cerrados de cada tipo. */
export async function getPedidos(tenantId: string, cerradosLimite = 50): Promise<Pedido[]> {
  const [abiertos, completados, cancelados] = await Promise.all([
    supabase.from("pedidos").select(COLS).eq("tenant_id", tenantId)
      .in("estado", ["pendiente", "preparacion", "reparto"]).order("created_at", { ascending: true }),
    supabase.from("pedidos").select(COLS).eq("tenant_id", tenantId)
      .eq("estado", "completado").order("completado_at", { ascending: false }).limit(cerradosLimite),
    supabase.from("pedidos").select(COLS).eq("tenant_id", tenantId)
      .eq("estado", "cancelado").order("updated_at", { ascending: false }).limit(cerradosLimite),
  ])
  throwIfSupabaseError(abiertos.error, "Error al cargar pedidos")
  throwIfSupabaseError(completados.error, "Error al cargar pedidos completados")
  throwIfSupabaseError(cancelados.error, "Error al cargar pedidos cancelados")
  return [...(abiertos.data ?? []), ...(completados.data ?? []), ...(cancelados.data ?? [])].map(pedidoDesdeFila)
}

/** Cantidad de pedidos sin empezar, para el aviso del menú. */
export async function contarPedidosPendientes(tenantId: string): Promise<number> {
  const { count, error } = await supabase
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("estado", "pendiente")
  if (error) return 0
  return count ?? 0
}

export async function getPedido(id: string): Promise<Pedido | null> {
  const { data, error } = await supabase.from("pedidos").select(COLS).eq("id", id).maybeSingle()
  throwIfSupabaseError(error, "Error al cargar el pedido")
  return data ? pedidoDesdeFila(data) : null
}

export interface DatosEntregaInput {
  entrega: "retiro" | "envio"
  direccion: string
  nota: string
  clienteTelefono: string
}

export async function editarPedido(
  pedidoId: string,
  items: ItemRPC[],
  descuento: number,
  datos: DatosEntregaInput,
): Promise<void> {
  const { error } = await supabase.rpc("editar_pedido", {
    p_pedido_id: pedidoId,
    p_items: items.map((i) => ({
      producto_id: i.producto_id,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      subtotal: i.subtotal,
    })),
    p_descuento: descuento,
    p_datos: {
      entrega: datos.entrega,
      direccion: datos.direccion,
      nota: datos.nota,
      cliente_telefono: datos.clienteTelefono,
    },
  })
  throwIfSupabaseError(error, "Error al editar el pedido")
}

export async function cambiarEstadoPedido(pedidoId: string, estado: EstadoPedido): Promise<void> {
  const { error } = await supabase.rpc("cambiar_estado_pedido", { p_pedido_id: pedidoId, p_estado: estado })
  throwIfSupabaseError(error, "Error al cambiar el estado del pedido")
}

/** El staff cobró el pedido (en el local o el cadete): se registra la venta. */
export async function registrarVentaPedido(
  pedidoId: string,
  medioPago: MedioPago,
  cuotas?: number,
): Promise<{ ventaId: string; numero: number }> {
  const { data, error } = await supabase.rpc("registrar_venta_pedido", {
    p_pedido_id: pedidoId,
    p_medio_pago: medioPago,
    p_cuotas: cuotas ?? null,
  })
  throwIfSupabaseError(error, "Error al registrar el cobro del pedido")
  const d = data as { venta_id: string; numero: number }
  return { ventaId: d.venta_id, numero: d.numero }
}

/** Staff: deja que el comprador descargue remito y factura. */
export async function autorizarDocumentosPedido(pedidoId: string): Promise<void> {
  const { error } = await supabase.rpc("autorizar_documentos_pedido", { p_pedido_id: pedidoId })
  throwIfSupabaseError(error, "Error al autorizar los documentos del pedido")
}

export async function cancelarPedido(pedidoId: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc("cancelar_pedido", { p_pedido_id: pedidoId, p_motivo: motivo })
  throwIfSupabaseError(error, "Error al cancelar el pedido")
}

// ── Comprador ──

async function headersComprador(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error("Iniciá sesión para continuar")
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
}

async function pedir<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json?.ok) throw new Error(json?.error || "Error de comunicación con el servidor")
  return json as T
}

export type InicioPago =
  | { tipo: "redirect"; url: string }
  | { tipo: "qr"; qrData: string }
  | { tipo: "ninguno" }

export interface NuevoPedidoInput {
  tenantId: string
  items: { productoId: string; cantidad: number }[]
  nombre: string
  telefono: string
  dni: string
  entrega: "retiro" | "envio"
  direccion: string
  nota: string
  medioPago: MedioPagoWeb
}

export async function crearPedidoWeb(
  input: NuevoPedidoInput,
): Promise<{ pedidoId: string; numero: number; dni: string; pago: InicioPago; errorPago: string | null }> {
  return pedir("/api/tienda/pedidos", {
    method: "POST",
    headers: await headersComprador(),
    body: JSON.stringify(input),
  })
}

/**
 * El pedido de la ruta /{veterinaria}/pedido/{dni}/{número}, si es de la
 * cuenta logueada. `verificar` además consulta el pago en Mercado Pago (más lento).
 */
export async function ubicarPedido(
  tenantId: string,
  dni: string,
  numero: number,
  verificar = false,
): Promise<Pedido> {
  const q = new URLSearchParams({ tenant: tenantId, dni, numero: String(numero), verificar: verificar ? "1" : "0" })
  const r = await pedir<{ pedido: Pedido }>(`/api/tienda/pedidos/ubicar?${q}`, { headers: await headersComprador() })
  return r.pedido
}

/** El comprador pide remito y factura; los ve cuando el staff lo autoriza. */
export async function solicitarDocumentos(id: string): Promise<void> {
  await pedir(`/api/tienda/pedidos/${id}/documentos`, { method: "POST", headers: await headersComprador() })
}

export async function reintentarPago(id: string): Promise<InicioPago> {
  const r = await pedir<{ pago: InicioPago }>(`/api/tienda/pedidos/${id}/pagar`, {
    method: "POST",
    headers: await headersComprador(),
  })
  return r.pago
}

export interface DocumentosPedido {
  venta: Record<string, unknown>
  factura: Record<string, unknown> | null
  facturaUrl: string | null
  emisor: { nombre: string; direccion?: string; telefono?: string; email?: string; logoUrl?: string }
  fiscal: {
    cuit: string
    razonSocial: string
    condicionIva: "RI" | "MONOTRIBUTO" | "EXENTO"
    domicilioFiscal?: string
    ingresosBrutos?: string
    inicioActividades?: string
  } | null
}

export async function getDocumentosPedido(id: string): Promise<DocumentosPedido> {
  return pedir(`/api/tienda/pedidos/${id}/documentos`, { headers: await headersComprador() })
}

/** Los pedidos del comprador en esta veterinaria (RLS: `usuario_id = auth.uid()`). */
export async function getMisPedidos(tenantId: string): Promise<Pedido[]> {
  const { data: sesion } = await supabase.auth.getSession()
  const uid = sesion.session?.user.id
  if (!uid) return []
  const { data, error } = await supabase
    .from("pedidos")
    .select(COLS)
    .eq("tenant_id", tenantId)
    .eq("usuario_id", uid)
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) return []
  return (data ?? []).map(pedidoDesdeFila)
}
