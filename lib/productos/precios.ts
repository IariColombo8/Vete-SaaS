import type { OfertaTipo } from "@/lib/supabase/types"

/**
 * Cálculo del precio efectivo con oferta de catálogo.
 *
 * Puro y sin dependencias: lo usa el panel para mostrar precios y el diálogo
 * de ofertas para la vista previa. Si más adelante hay mostrador, el mismo
 * módulo sirve para calcular el total de una venta.
 */

/** Lo mínimo que hay que saber de un producto para calcular su precio. */
export interface ConOferta {
  precio: number
  ofertaActiva?: boolean
  ofertaTipo?: OfertaTipo | null
  ofertaValor?: number | null
  ofertaCantidad?: number | null
}

/** Redondea a 2 decimales y nunca devuelve negativo. */
function round2(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n * 100) / 100)
}

/** ¿El producto tiene una oferta activa y además aplicable? */
export function tieneOferta(p: ConOferta): boolean {
  if (!p.ofertaActiva || !p.ofertaTipo) return false
  if (p.ofertaTipo === "combo") {
    return Number(p.ofertaCantidad) > 1 && Number(p.ofertaValor) > 0
  }
  if (p.ofertaTipo === "porcentaje") {
    const v = Number(p.ofertaValor)
    return v > 0 && v < 100
  }
  return Number(p.ofertaValor) > 0
}

/**
 * Precio final por unidad.
 *
 * En un combo no existe un precio por unidad fijo (depende de cuántas se
 * lleven), así que devuelve el de lista — para el total real usar `precioLinea`.
 */
export function precioFinal(p: ConOferta): number {
  if (!tieneOferta(p) || p.ofertaTipo === "combo") return round2(p.precio)
  const valor = Number(p.ofertaValor) || 0
  const bruto =
    p.ofertaTipo === "porcentaje" ? p.precio * (1 - valor / 100) : p.precio - valor
  return round2(bruto)
}

/** Cuánto se ahorra el cliente por unidad respecto del precio de lista. */
export function ahorroOferta(p: ConOferta): number {
  if (p.ofertaTipo === "combo") return 0
  return round2(p.precio - precioFinal(p))
}

/**
 * Total de llevarse `cantidad` unidades, teniendo en cuenta los combos:
 * cada N unidades cuestan `ofertaValor`, y el resto suelto va a precio de lista.
 */
export function precioLinea(p: ConOferta, cantidad: number): number {
  if (cantidad <= 0) return 0

  if (tieneOferta(p) && p.ofertaTipo === "combo") {
    const n = Number(p.ofertaCantidad) || 0
    const precioCombo = Number(p.ofertaValor) || 0
    const combos = Math.floor(cantidad / n)
    const sueltas = cantidad - combos * n
    return round2(combos * precioCombo + sueltas * p.precio)
  }

  return round2(precioFinal(p) * cantidad)
}

/** Etiqueta corta del combo para la UI: "2x1" o "3x$1000". */
export function comboLabel(p: ConOferta): string | null {
  if (!tieneOferta(p) || p.ofertaTipo !== "combo") return null
  const n = Number(p.ofertaCantidad) || 0
  const valor = Number(p.ofertaValor) || 0
  // "2x1" es el caso donde pagás una unidad y te llevás dos.
  if (n === 2 && Math.abs(valor - p.precio) < 0.01) return "2x1"
  return `${n}x$${valor}`
}

/**
 * Margen en % sobre el precio de venta. `null` cuando no se puede calcular
 * (sin costo cargado o producto gratis).
 */
export function margenPct(precio: number, costo?: number | null): number | null {
  if (costo == null || !Number.isFinite(costo) || precio <= 0) return null
  return ((precio - costo) / precio) * 100
}

// ── Estado de stock ──

export type EstadoStock = "servicio" | "agotado" | "bajo" | "ok"

/** Clasifica el stock de un producto para pintarlo en la tabla. */
export function estadoStock(p: {
  stock: number
  stockMinimo: number
  controlaStock: boolean
}): EstadoStock {
  if (!p.controlaStock) return "servicio"
  if (p.stock <= 0) return "agotado"
  if (p.stock <= p.stockMinimo) return "bajo"
  return "ok"
}

/** Días hasta el vencimiento. Negativo = ya venció. `null` si no tiene fecha. */
export function diasHastaVencimiento(
  fechaVencimiento?: string | null,
  hoy: Date = new Date(),
): number | null {
  if (!fechaVencimiento) return null
  const vence = new Date(`${fechaVencimiento}T00:00:00`)
  if (Number.isNaN(vence.getTime())) return null
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const MS_POR_DIA = 86_400_000
  return Math.round((vence.getTime() - inicioHoy.getTime()) / MS_POR_DIA)
}
