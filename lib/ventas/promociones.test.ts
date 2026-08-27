import { describe, it, expect } from "vitest"
import { detectarPromocionAplicable, descuentoPromociones } from "./promociones"
import type { LineaCarrito } from "./carrito"
import type { Producto } from "@/lib/supabase/types"
import type { Promocion } from "@/lib/supabase/types"

function producto(id: string, precio: number): Producto {
  return {
    id, nombre: id, descripcion: "", categoria: "Accesorios", precio, precioLista: precio,
    stock: 100, stockMinimo: 0, controlaStock: true, unidad: "un",
    ofertaActiva: false, ofertaValor: 0, activo: true, revisar: false, publicadoEnLanding: false,
  }
}

function linea(p: Producto, cantidad: number): LineaCarrito {
  return { id: p.id, producto: p, cantidad }
}

function promo(items: { productoId: string; cantidad: number }[], precioFinal: number): Promocion {
  return { id: "promo-1", nombre: "Combo", precioFinal, activa: true, items }
}

describe("detectarPromocionAplicable", () => {
  it("detecta la promo cuando el carrito tiene las cantidades exactas", () => {
    const collar = producto("collar", 5000)
    const correa = producto("correa", 3000)
    const carrito = [linea(collar, 1), linea(correa, 1)]
    const promocion = promo([{ productoId: "collar", cantidad: 1 }, { productoId: "correa", cantidad: 1 }], 6500)

    const match = detectarPromocionAplicable(carrito, [promocion])
    expect(match?.promocion.id).toBe("promo-1")
    expect(match?.veces).toBe(1)
  })

  it("no detecta la promo si falta un producto", () => {
    const collar = producto("collar", 5000)
    const carrito = [linea(collar, 1)]
    const promocion = promo([{ productoId: "collar", cantidad: 1 }, { productoId: "correa", cantidad: 1 }], 6500)

    expect(detectarPromocionAplicable(carrito, [promocion])).toBeNull()
  })

  it("detecta cuantas veces se repite el combo completo", () => {
    const collar = producto("collar", 5000)
    const correa = producto("correa", 3000)
    const carrito = [linea(collar, 3), linea(correa, 2)]
    const promocion = promo([{ productoId: "collar", cantidad: 1 }, { productoId: "correa", cantidad: 1 }], 6500)

    // Con 3 collares y 2 correas, el combo (1+1) entra 2 veces (limita la correa).
    const match = detectarPromocionAplicable(carrito, [promocion])
    expect(match?.veces).toBe(2)
  })
})

describe("descuentoPromociones", () => {
  it("calcula el ahorro total: precio de lista de las unidades del combo menos el precio final", () => {
    const collar = producto("collar", 5000)
    const correa = producto("correa", 3000)
    const carrito = [linea(collar, 1), linea(correa, 1)]
    const promocion = promo([{ productoId: "collar", cantidad: 1 }, { productoId: "correa", cantidad: 1 }], 6500)

    // 5000 + 3000 = 8000 de lista, combo a 6500 -> descuento 1500.
    expect(descuentoPromociones(carrito, [promocion])).toBe(1500)
  })

  it("devuelve 0 si ninguna promo aplica", () => {
    const collar = producto("collar", 5000)
    const carrito = [linea(collar, 1)]
    expect(descuentoPromociones(carrito, [])).toBe(0)
  })
})
