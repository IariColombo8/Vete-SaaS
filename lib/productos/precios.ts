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
  /**
   * Costo de reposición. Una oferta "porcentaje" resta puntos al margen
   * sobre este valor (ver `precioFinal`); sin costo cargado no hay margen del
   * que restar, así que cae al descuento tradicional sobre `precio`.
   */
  costo?: number | null
  ofertaActiva?: boolean
  ofertaTipo?: OfertaTipo | null
  ofertaValor?: number | null
  ofertaCantidad?: number | null
  /** YYYY-MM-DD. `null`/`undefined` = sin vencimiento, dura hasta que se saque a mano. */
  ofertaHasta?: string | null
}

/** Redondea a 2 decimales y nunca devuelve negativo. */
function round2(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n * 100) / 100)
}

/** ¿El producto tiene una oferta activa y además aplicable? */
export function tieneOferta(p: ConOferta, hoy: Date = new Date()): boolean {
  if (!p.ofertaActiva || !p.ofertaTipo) return false
  if (p.ofertaHasta) {
    // Vence al final del día indicado: cargar "hasta el 20" tiene que incluir
    // todo el 20, no cortar la oferta a la medianoche del 19.
    const vence = new Date(`${p.ofertaHasta}T23:59:59.999`)
    if (!Number.isNaN(vence.getTime()) && hoy.getTime() > vence.getTime()) return false
  }
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
 *
 * "Monto" resta un importe fijo del precio de venta, como siempre. "Porcentaje"
 * es distinto: no descuenta % del precio, resta esa cantidad de PUNTOS al
 * margen sobre el costo — una oferta de "1" con margen 50% deja el margen en
 * 49%, no el precio en 99% de lo que estaba. Sin costo cargado no hay margen
 * del que restar puntos, así que cae al descuento tradicional sobre el precio.
 */
export function precioFinal(p: ConOferta): number {
  if (!tieneOferta(p) || p.ofertaTipo === "combo") return round2(p.precio)
  const valor = Number(p.ofertaValor) || 0

  if (p.ofertaTipo === "monto") return round2(p.precio - valor)

  if (p.costo != null && p.costo > 0) {
    const margenActual = ((p.precio - p.costo) / p.costo) * 100
    return round2(p.costo * (1 + (margenActual - valor) / 100))
  }
  return round2(p.precio * (1 - valor / 100))
}

/** Cuánto se ahorra el cliente por unidad respecto del precio de venta actual. */
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
 * Ganancia en % sobre el costo (recargo/markup), no sobre el precio de venta
 * (que sería el margen contable). Un recargo del 50% sobre el costo da un
 * margen real de 33.3% — para que la tabla muestre el mismo número que se
 * tipeó en "Aplicar ganancia" (`calcularPrecioConMargen`), acá se usa la
 * misma base de cálculo: `((precio - costo) / costo) × 100`.
 * `null` cuando no se puede calcular (sin costo cargado).
 */
export function margenPct(precio: number, costo?: number | null): number | null {
  if (costo == null || !Number.isFinite(costo) || costo <= 0) return null
  return ((precio - costo) / costo) * 100
}

/**
 * Precio de venta a partir del costo y un % de ganancia.
 * `precio = costo × (1 + porcentaje / 100)`, siempre partiendo del costo
 * guardado — no es acumulativo sobre el precio de venta actual.
 */
export function calcularPrecioConMargen(costo: number, porcentaje: number): number {
  return round2(costo * (1 + porcentaje / 100))
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
