import type { ProductoUnidad } from "@/lib/supabase/types"

/**
 * Pedidos de la vidriera (tienda web). Tabla `pedidos` + `pedido_items`
 * (supabase/066_pedidos_web.sql). Este módulo no importa Supabase: lo usan
 * tanto las API routes (service_role) como el panel y la página del pedido.
 */

export type EstadoPedido = "pendiente" | "preparacion" | "reparto" | "completado" | "cancelado"
export type EntregaPedido = "retiro" | "envio"
/** Cómo eligió pagar el cliente en la web. `tarjeta` y `qr` van por Mercado Pago. */
export type MedioPagoWeb = "efectivo" | "transferencia" | "tarjeta" | "qr"
export type PagoEstado = "pendiente" | "aprobado" | "rechazado"
/** Remito y factura: el comprador los pide y el staff los autoriza (067). */
export type DocumentosEstado = "solicitado" | "autorizado" | null

export interface PedidoItem {
  id?: string
  productoId: string | null
  nombre: string
  marca: string
  presentacion: string
  imagenUrl: string | null
  unidad: ProductoUnidad
  cantidad: number
  precioUnitario: number
  subtotal: number
}

export interface Pedido {
  id: string
  tenantId: string
  numero: number
  estado: EstadoPedido
  /** Cuenta con la que compró (auth.users). */
  usuarioId: string | null
  clienteId: string | null
  clienteNombre: string
  clienteTelefono: string
  clienteEmail: string
  clienteDni: string
  entrega: EntregaPedido
  direccion: string
  nota: string
  medioPago: MedioPagoWeb
  pagoEstado: PagoEstado
  mpPaymentId: string | null
  subtotal: number
  descuento: number
  total: number
  ventaId: string | null
  ventaError: string | null
  facturaError: string | null
  documentosEstado: DocumentosEstado
  canceladoMotivo: string | null
  createdAt: string
  updatedAt: string
  completadoAt: string | null
  items: PedidoItem[]
}

/** Lo que la vidriera necesita saber para ofrecer la compra (RPC `tienda_publica`). */
export interface TiendaPublica {
  pedidosHabilitados: boolean
  retiroHabilitado: boolean
  envioHabilitado: boolean
  notaEnvio: string
  medios: MedioPagoWeb[]
  aliasTransferencia: string
  titularTransferencia: string
  mpConectado: boolean
}

export const ESTADOS_PEDIDO: { id: EstadoPedido; label: string }[] = [
  { id: "pendiente", label: "Pendiente" },
  { id: "preparacion", label: "Preparación" },
  { id: "reparto", label: "Reparto" },
  { id: "completado", label: "Completados" },
  { id: "cancelado", label: "Cancelados" },
]

export const MEDIOS_WEB: { id: MedioPagoWeb; label: string; detalle: string }[] = [
  { id: "efectivo", label: "Efectivo", detalle: "Pagás al retirar o al recibir el pedido" },
  { id: "transferencia", label: "Transferencia", detalle: "Te pasamos el alias para transferir" },
  { id: "tarjeta", label: "Débito / Crédito", detalle: "Cargás la tarjeta en Mercado Pago" },
  { id: "qr", label: "QR", detalle: "Escaneás el QR con cualquier billetera" },
]

export function etiquetaMedioWeb(m: MedioPagoWeb): string {
  return MEDIOS_WEB.find((x) => x.id === m)?.label ?? m
}

type Fila = Record<string, unknown>
const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function pedidoItemDesdeFila(f: Fila): PedidoItem {
  return {
    id: f.id as string,
    productoId: (f.producto_id as string | null) ?? null,
    nombre: (f.nombre as string) ?? "",
    marca: (f.marca as string) ?? "",
    presentacion: (f.presentacion as string) ?? "",
    imagenUrl: (f.imagen_url as string | null) ?? null,
    unidad: (f.unidad as ProductoUnidad) ?? "un",
    cantidad: num(f.cantidad),
    precioUnitario: num(f.precio_unitario),
    subtotal: num(f.subtotal),
  }
}

export function pedidoDesdeFila(f: Fila): Pedido {
  const items = ((f.pedido_items as Fila[] | undefined) ?? [])
    .slice()
    .sort((a, b) => num(a.orden) - num(b.orden))
  return {
    id: f.id as string,
    tenantId: f.tenant_id as string,
    numero: num(f.numero),
    estado: f.estado as EstadoPedido,
    usuarioId: (f.usuario_id as string | null) ?? null,
    clienteId: (f.cliente_id as string | null) ?? null,
    clienteNombre: (f.cliente_nombre as string) ?? "",
    clienteTelefono: (f.cliente_telefono as string) ?? "",
    clienteEmail: (f.cliente_email as string) ?? "",
    clienteDni: (f.cliente_dni as string) ?? "",
    entrega: f.entrega as EntregaPedido,
    direccion: (f.direccion as string) ?? "",
    nota: (f.nota as string) ?? "",
    medioPago: f.medio_pago as MedioPagoWeb,
    pagoEstado: f.pago_estado as PagoEstado,
    mpPaymentId: (f.mp_payment_id as string | null) ?? null,
    subtotal: num(f.subtotal),
    descuento: num(f.descuento),
    total: num(f.total),
    ventaId: (f.venta_id as string | null) ?? null,
    ventaError: (f.venta_error as string | null) ?? null,
    facturaError: (f.factura_error as string | null) ?? null,
    documentosEstado: (f.documentos_estado as DocumentosEstado) ?? null,
    canceladoMotivo: (f.cancelado_motivo as string | null) ?? null,
    createdAt: (f.created_at as string) ?? "",
    updatedAt: (f.updated_at as string) ?? "",
    completadoAt: (f.completado_at as string | null) ?? null,
    items: items.map(pedidoItemDesdeFila),
  }
}

export function tiendaPublicaDesdeJson(d: Fila | null | undefined): TiendaPublica {
  const medios = Array.isArray(d?.medios) ? (d.medios as MedioPagoWeb[]) : []
  return {
    pedidosHabilitados: Boolean(d?.pedidos_habilitados),
    retiroHabilitado: d?.retiro_habilitado !== false,
    envioHabilitado: d?.envio_habilitado !== false,
    notaEnvio: (d?.nota_envio as string) ?? "",
    medios,
    aliasTransferencia: (d?.alias_transferencia as string) ?? "",
    titularTransferencia: (d?.titular_transferencia as string) ?? "",
    mpConectado: Boolean(d?.mp_conectado),
  }
}

/** Número para mostrar: "Pedido N° 0042". */
export function numeroPedido(numero: number): string {
  return `Pedido N° ${String(numero).padStart(4, "0")}`
}
