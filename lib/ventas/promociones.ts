import type { Producto, Promocion } from "@/lib/supabase/types"
import type { LineaCarrito } from "./carrito"

/**
 * Detecta y descuenta promociones (combos de varios productos a precio fijo)
 * en el carrito del POS. Puro: no toca la base ni el estado de React.
 *
 * A diferencia del combo de un solo producto (`lib/productos/precios.ts`), acá
 * el combo involucra distintos `producto_id`, así que no se puede resolver por
 * unidad — hay que mirar el carrito completo para saber cuántas veces entra.
 */

export interface MatchPromocion {
  promocion: Promocion
  /** Cuántas veces entra el combo completo en las cantidades del carrito. */
  veces: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Cuántas veces entra el combo de una promoción en el carrito dado. */
function vecesQueEntra(carrito: LineaCarrito[], promocion: Promocion): number {
  if (promocion.items.length === 0) return 0

  let veces = Infinity
  for (const item of promocion.items) {
    const linea = carrito.find((l) => l.producto.id === item.productoId)
    if (!linea) return 0
    veces = Math.min(veces, Math.floor(linea.cantidad / item.cantidad))
  }
  return Number.isFinite(veces) ? veces : 0
}

/**
 * De todas las promociones vigentes, la primera que aplica al menos una vez.
 * Si hay varias aplicables a la vez, se prioriza la de mayor ahorro total —
 * evita que el orden de carga en la base decida cuál "gana".
 */
export function detectarPromocionAplicable(
  carrito: LineaCarrito[],
  promociones: Promocion[],
): MatchPromocion | null {
  const candidatas = promociones
    .map((promocion) => ({ promocion, veces: vecesQueEntra(carrito, promocion) }))
    .filter((m) => m.veces > 0)

  if (candidatas.length === 0) return null

  return candidatas.reduce((mejor, actual) =>
    descuentoDeUnMatch(carrito, actual) > descuentoDeUnMatch(carrito, mejor) ? actual : mejor,
  )
}

function descuentoDeUnMatch(carrito: LineaCarrito[], match: MatchPromocion): number {
  const { promocion, veces } = match
  if (veces <= 0) return 0

  let precioLista = 0
  for (const item of promocion.items) {
    const linea = carrito.find((l) => l.producto.id === item.productoId)
    if (!linea) return 0
    precioLista += linea.producto.precio * item.cantidad * veces
  }
  return Math.max(0, round2(precioLista - promocion.precioFinal * veces))
}

/** Descuento total en pesos de aplicar la mejor promoción detectada. */
export function descuentoPromociones(carrito: LineaCarrito[], promociones: Promocion[]): number {
  const match = detectarPromocionAplicable(carrito, promociones)
  if (!match) return 0
  return descuentoDeUnMatch(carrito, match)
}
