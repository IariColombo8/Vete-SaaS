import { precioLinea, type ConOferta } from "@/lib/productos/precios"
import type { MedioPago, ProductoUnidad } from "@/lib/supabase/types"
import type { EntregaPedido, EstadoPedido, MedioPagoWeb, TiendaPublica } from "./tipos"

/**
 * Reglas puras de los pedidos web. Testeadas en `reglas.test.ts`.
 */

/** Tope por línea: un pedido web no es una compra mayorista. */
export const CANTIDAD_MAXIMA = 100

/**
 * ¿Es una cantidad que se puede pedir? Por unidad, enteros; por kilo, de a
 * 100 g (lo que se puede pesar en el mostrador).
 */
export function cantidadValida(unidad: ProductoUnidad, cantidad: number): boolean {
  if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > CANTIDAD_MAXIMA) return false
  if (unidad === "kg") return Math.abs(cantidad * 10 - Math.round(cantidad * 10)) < 1e-9
  return Number.isInteger(cantidad)
}

/** Paso del selector de cantidad. */
export function pasoCantidad(unidad: ProductoUnidad): number {
  return unidad === "kg" ? 0.5 : 1
}

/**
 * Precio de una línea del pedido, con las ofertas del catálogo. Se calcula
 * SIN el costo: es el precio que muestra la vidriera (la consulta pública no
 * trae el costo), y el cliente tiene que pagar lo que vio.
 */
export function precioLineaWeb(producto: ConOferta, cantidad: number): { precioUnitario: number; subtotal: number } {
  const sinCosto: ConOferta = { ...producto, costo: null }
  const subtotal = precioLinea(sinCosto, cantidad)
  const precioUnitario = cantidad > 0 ? Math.round((subtotal / cantidad) * 100) / 100 : 0
  return { precioUnitario, subtotal }
}

/**
 * Medio con el que queda registrada la venta de un pago de Mercado Pago.
 * Tarjeta de crédito → crédito; débito o prepaga → débito; dinero en cuenta,
 * QR o lo que sea → transferencia (la plata entra a MP, no al cajón; mismo
 * criterio que el QR del mostrador).
 */
export function medioVentaDesdeMP(paymentTypeId: string | null | undefined): MedioPago {
  if (paymentTypeId === "credit_card") return "credito"
  if (paymentTypeId === "debit_card" || paymentTypeId === "prepaid_card") return "debito"
  return "transferencia"
}

/** ¿El pago se resuelve online (Mercado Pago) o lo cobra la veterinaria? */
export function esPagoOnline(medio: MedioPagoWeb): boolean {
  return medio === "tarjeta" || medio === "qr"
}

/**
 * La factura sale sola salvo con transferencia (decisión del dueño de VipVet:
 * las transferencias se facturan a mano, cuando corresponde).
 */
export function facturaAutomatica(medio: MedioPago | MedioPagoWeb): boolean {
  return medio !== "transferencia"
}

/** Próximo paso del tablero. Un retiro no pasa por "reparto". */
export function siguienteEstado(estado: EstadoPedido, entrega: EntregaPedido): EstadoPedido | null {
  if (estado === "pendiente") return "preparacion"
  if (estado === "preparacion") return entrega === "envio" ? "reparto" : "completado"
  if (estado === "reparto") return "completado"
  return null
}

/** Texto del botón que avanza al próximo estado. */
export function accionSiguiente(estado: EstadoPedido, entrega: EntregaPedido): string | null {
  const sig = siguienteEstado(estado, entrega)
  if (sig === "preparacion") return "Pasar a preparación"
  if (sig === "reparto") return "Mandar a reparto"
  if (sig === "completado") return entrega === "envio" ? "Entregado" : "Retirado"
  return null
}

export function esEditable(p: { estado: EstadoPedido; ventaId: string | null; pagoEstado: string }): boolean {
  return (p.estado === "pendiente" || p.estado === "preparacion") && !p.ventaId && p.pagoEstado !== "aprobado"
}

/** Medios que de verdad se pueden ofrecer: tarjeta y QR exigen Mercado Pago conectado. */
export function mediosDisponibles(t: TiendaPublica): MedioPagoWeb[] {
  return t.medios.filter((m) => !esPagoOnline(m) || t.mpConectado)
}

/** Formas de entrega habilitadas. */
export function entregasDisponibles(t: TiendaPublica): EntregaPedido[] {
  const r: EntregaPedido[] = []
  if (t.retiroHabilitado) r.push("retiro")
  if (t.envioHabilitado) r.push("envio")
  return r
}

/** DNI sin puntos, espacios ni guiones: "30.123.456" → "30123456". */
export function normalizarDni(dni: string): string {
  return dni.replace(/\D/g, "")
}

/**
 * Ruta pública del pedido: /{veterinaria}/pedido/{dni}/{número}. Es legible,
 * pero no es el secreto: verla exige la sesión de quien compró (o staff).
 */
export function rutaPedido(p: { tenantId: string; clienteDni: string; numero: number }): string {
  // Pedidos de antes de que el DNI fuera obligatorio: "sin-dni" se normaliza a "".
  return `/${p.tenantId}/pedido/${normalizarDni(p.clienteDni) || "sin-dni"}/${p.numero}`
}

/** Clave en sessionStorage del QR que dejó el checkout, ya dibujado como imagen. */
export function claveQr(slug: string, dni: string, numero: string | number): string {
  return `vetpanel:qr:${slug}:${normalizarDni(dni)}:${numero}`
}
