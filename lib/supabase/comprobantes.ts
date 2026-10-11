import { supabase } from "./config"
import { throwIfSupabaseError } from "./assert"
import type { VentaItem } from "./types"

/**
 * Comprobantes electrónicos (facturas y notas de crédito) ya pedidos a ARCA.
 * Solo lectura desde el cliente (RLS `es_staff`); se escriben en el servidor
 * al emitir (`lib/facturacion/emitir.ts`).
 */

export type EstadoComprobante = "pendiente" | "emitido" | "rechazado"

export interface Comprobante {
  id: string
  ventaId: string | null
  tipoCbte: number
  puntoVenta: number
  numero: number | null
  cae: string | null
  /** YYYY-MM-DD. */
  caeVto: string | null
  /** YYYY-MM-DD. */
  fecha: string
  ambiente: "homologacion" | "produccion"
  docTipo: number
  docNro: string
  receptorNombre: string
  receptorDomicilio: string
  receptorCondicionIva: number
  impTotal: number
  impNeto: number
  impIva: number
  impOpEx: number
  alicuotas: { id: number; alicuota: number; base: number; importe: number }[]
  items: VentaItem[]
  comprobanteAsociadoId: string | null
  estado: EstadoComprobante
  observaciones: { code: number; msg: string }[]
  createdAt: string
}

type Fila = Record<string, unknown>
const num = (v: unknown) => Number(v ?? 0)

function aComprobante(f: Fila): Comprobante {
  const items = (f.items as Fila[]) ?? []
  return {
    id: f.id as string,
    ventaId: (f.venta_id as string | null) ?? null,
    tipoCbte: num(f.tipo_cbte),
    puntoVenta: num(f.punto_venta),
    numero: f.numero == null ? null : num(f.numero),
    cae: (f.cae as string | null) ?? null,
    caeVto: (f.cae_vto as string | null) ?? null,
    fecha: f.fecha as string,
    ambiente: f.ambiente as Comprobante["ambiente"],
    docTipo: num(f.doc_tipo),
    docNro: String(f.doc_nro ?? "0"),
    receptorNombre: (f.receptor_nombre as string) ?? "",
    receptorDomicilio: (f.receptor_domicilio as string) ?? "",
    receptorCondicionIva: num(f.receptor_condicion_iva),
    impTotal: num(f.imp_total),
    impNeto: num(f.imp_neto),
    impIva: num(f.imp_iva),
    impOpEx: num(f.imp_op_ex),
    alicuotas: ((f.alicuotas as Fila[]) ?? []).map((a) => ({
      id: num(a.id),
      alicuota: num(a.alicuota),
      base: num(a.base),
      importe: num(a.importe),
    })),
    // El snapshot guarda los ítems con los nombres de `ItemFacturable`; se
    // adaptan a `VentaItem` para que el PDF los dibuje con el mismo código.
    items: items.map((i) => ({
      nombre: (i.descripcion as string) ?? (i.nombre as string) ?? "",
      marca: (i.marca as string) ?? "",
      presentacion: (i.presentacion as string) ?? "",
      unidad: ((i.unidad as VentaItem["unidad"]) ?? "un"),
      cantidad: num(i.cantidad),
      precioUnitario: num(i.precioUnitario ?? i.precio_unitario),
      subtotal: num(i.subtotal),
    })),
    comprobanteAsociadoId: (f.comprobante_asociado_id as string | null) ?? null,
    estado: f.estado as EstadoComprobante,
    observaciones: ((f.observaciones as Fila[]) ?? []).map((o) => ({ code: num(o.code), msg: String(o.msg ?? "") })),
    createdAt: (f.created_at as string) ?? "",
  }
}

/** Comprobantes de una venta (factura y, si la hubo, nota de crédito). */
export async function getComprobantesDeVenta(tenantId: string, ventaId: string): Promise<Comprobante[]> {
  const { data, error } = await supabase
    .from("comprobantes")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("venta_id", ventaId)
    .order("created_at", { ascending: true })
  throwIfSupabaseError(error, "Error al cargar comprobantes de la venta")
  return (data ?? []).map(aComprobante)
}

/** Facturas emitidas de varias ventas, indexadas por venta (para el historial). */
export async function getFacturasPorVenta(tenantId: string, ventaIds: string[]): Promise<Map<string, Comprobante>> {
  const mapa = new Map<string, Comprobante>()
  if (ventaIds.length === 0) return mapa
  const { data, error } = await supabase
    .from("comprobantes")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("estado", "emitido")
    .in("tipo_cbte", [1, 6, 11])
    .in("venta_id", ventaIds)
  throwIfSupabaseError(error, "Error al cargar facturas")
  for (const f of data ?? []) {
    const c = aComprobante(f)
    if (c.ventaId) mapa.set(c.ventaId, c)
  }
  return mapa
}

/** Facturas y notas de crédito emitidas de varias ventas, indexadas por venta. */
export async function getComprobantesPorVentas(
  tenantId: string,
  ventaIds: string[],
): Promise<{ facturas: Map<string, Comprobante>; notasCredito: Map<string, Comprobante> }> {
  const facturas = new Map<string, Comprobante>()
  const notasCredito = new Map<string, Comprobante>()
  if (ventaIds.length === 0) return { facturas, notasCredito }
  const { data, error } = await supabase
    .from("comprobantes")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("estado", "emitido")
    .in("venta_id", ventaIds)
  throwIfSupabaseError(error, "Error al cargar comprobantes")
  for (const f of data ?? []) {
    const c = aComprobante(f)
    if (!c.ventaId) continue
    if ([3, 8, 13].includes(c.tipoCbte)) notasCredito.set(c.ventaId, c)
    else facturas.set(c.ventaId, c)
  }
  return { facturas, notasCredito }
}

export async function getComprobante(tenantId: string, id: string): Promise<Comprobante | null> {
  const { data, error } = await supabase
    .from("comprobantes")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle()
  throwIfSupabaseError(error, "Error al cargar el comprobante")
  return data ? aComprobante(data) : null
}

export interface EstadoFacturacion {
  configurado: boolean
  /** Hay certificado cargado: se puede emitir. */
  listo: boolean
  ambiente?: "homologacion" | "produccion"
  cuit?: string
  razonSocial?: string
  condicionIva?: "RI" | "MONOTRIBUTO" | "EXENTO"
  puntoVenta?: number
}

/** ¿El tenant tiene factura electrónica lista? RPC sin secretos. */
export async function getEstadoFacturacion(tenantId: string): Promise<EstadoFacturacion> {
  const { data, error } = await supabase.rpc("facturacion_estado", { p_tenant: tenantId })
  if (error) throw new Error(error.message)
  const d = (data ?? {}) as Fila
  return {
    configurado: Boolean(d.configurado),
    listo: Boolean(d.listo),
    ambiente: d.ambiente as EstadoFacturacion["ambiente"],
    cuit: d.cuit as string | undefined,
    razonSocial: d.razon_social as string | undefined,
    condicionIva: d.condicion_iva as EstadoFacturacion["condicionIva"],
    puntoVenta: d.punto_venta == null ? undefined : num(d.punto_venta),
  }
}
