import { describe, expect, it } from "vitest"
import type { Producto } from "@/lib/supabase/types"
import {
  agregarAlCarrito,
  cambiarCantidad,
  itemsParaRPC,
  presentacionDe,
  quitarDelCarrito,
  totalesCarrito,
  type LineaCarrito,
} from "./carrito"

/** Producto mínimo, con lo que el carrito realmente mira. */
function producto(over: Partial<Producto> = {}): Producto {
  return {
    id: "p1",
    nombre: "Producto",
    descripcion: "",
    categoria: "",
    precio: 1000,
    stock: 10,
    stockMinimo: 0,
    controlaStock: true,
    unidad: "un",
    ofertaActiva: false,
    ofertaValor: 0,
    activo: true,
    revisar: false,
    ...over,
  }
}

describe("agregarAlCarrito", () => {
  it("agrega una línea nueva con la cantidad pedida", () => {
    const carrito = agregarAlCarrito([], producto(), 2)

    expect(carrito).toHaveLength(1)
    expect(carrito[0].cantidad).toBe(2)
  })

  it("acumula sobre la línea existente en vez de duplicarla", () => {
    const p = producto()
    const carrito = agregarAlCarrito(agregarAlCarrito([], p, 2), p, 3)

    expect(carrito).toHaveLength(1)
    expect(carrito[0].cantidad).toBe(5)
  })

  it("no muta el carrito original", () => {
    const original: LineaCarrito[] = []
    agregarAlCarrito(original, producto(), 1)

    expect(original).toHaveLength(0)
  })

  it("rechaza cantidades no positivas", () => {
    expect(() => agregarAlCarrito([], producto(), 0)).toThrow(/cantidad/i)
    expect(() => agregarAlCarrito([], producto(), -1)).toThrow(/cantidad/i)
  })

  it("rechaza más unidades de las que hay en stock", () => {
    expect(() => agregarAlCarrito([], producto({ stock: 3 }), 4)).toThrow(/stock/i)
  })

  it("cuenta lo que ya está en el carrito al validar el stock", () => {
    const p = producto({ stock: 5 })
    const carrito = agregarAlCarrito([], p, 4)

    expect(() => agregarAlCarrito(carrito, p, 2)).toThrow(/stock/i)
  })

  it("deja pasar cualquier cantidad si el producto no controla stock", () => {
    const servicio = producto({ controlaStock: false, stock: 0 })

    expect(agregarAlCarrito([], servicio, 99)[0].cantidad).toBe(99)
  })

  it("permite kilos con decimales cuando la unidad es kg", () => {
    const alimento = producto({ unidad: "kg", precio: 2000, stock: 30 })
    const carrito = agregarAlCarrito([], alimento, 2.5)

    expect(carrito[0].cantidad).toBe(2.5)
    expect(totalesCarrito(carrito).subtotal).toBe(5000)
  })

  it("rechaza fracciones de una unidad indivisible", () => {
    expect(() => agregarAlCarrito([], producto(), 1.5)).toThrow(/entera/i)
  })

  it("permite vender una fracción de una bolsa cerrada con peso detectado", () => {
    const bolsa = producto({ unidad: "un", pesoKg: 6, precio: 9000, stock: 10 })
    const mediaBolsa = agregarAlCarrito([], bolsa, 0.5)

    expect(mediaBolsa[0].cantidad).toBe(0.5)
    expect(totalesCarrito(mediaBolsa).subtotal).toBe(4500)
  })

  it("permite vender unidades sueltas de un paquete divisible", () => {
    const caja = producto({ unidad: "un", unidadesPorBulto: 100, precio: 50000, stock: 10 })
    const tresSueltas = agregarAlCarrito([], caja, 0.03)

    expect(tresSueltas[0].cantidad).toBe(0.03)
    expect(totalesCarrito(tresSueltas).subtotal).toBe(1500)
  })
})

describe("cambiarCantidad y quitarDelCarrito", () => {
  it("reemplaza la cantidad de la línea", () => {
    const carrito = agregarAlCarrito([], producto(), 2)

    expect(cambiarCantidad(carrito, "p1", 7)[0].cantidad).toBe(7)
  })

  it("quitar deja el carrito sin la línea", () => {
    const carrito = agregarAlCarrito([], producto(), 2)

    expect(quitarDelCarrito(carrito, "p1")).toHaveLength(0)
  })

  it("bajar a cero equivale a quitar la línea", () => {
    const carrito = agregarAlCarrito([], producto(), 2)

    expect(cambiarCantidad(carrito, "p1", 0)).toHaveLength(0)
  })

  it("sigue validando el stock al cambiar la cantidad", () => {
    const carrito = agregarAlCarrito([], producto({ stock: 5 }), 1)

    expect(() => cambiarCantidad(carrito, "p1", 6)).toThrow(/stock/i)
  })
})

describe("totalesCarrito", () => {
  it("suma las líneas a precio de lista", () => {
    const carrito = agregarAlCarrito([], producto({ precio: 1500 }), 2)

    expect(totalesCarrito(carrito)).toMatchObject({ subtotal: 3000, total: 3000 })
  })

  it("aplica el descuento por monto de la oferta", () => {
    const p = producto({ precio: 1000, ofertaActiva: true, ofertaTipo: "monto", ofertaValor: 200 })

    expect(totalesCarrito(agregarAlCarrito([], p, 3)).subtotal).toBe(2400)
  })

  it("aplica el descuento por porcentaje", () => {
    const p = producto({
      precio: 1000,
      ofertaActiva: true,
      ofertaTipo: "porcentaje",
      ofertaValor: 25,
    })

    expect(totalesCarrito(agregarAlCarrito([], p, 2)).subtotal).toBe(1500)
  })

  it("cobra los combos completos al precio del combo y el resto suelto", () => {
    // 3x$2500 sobre un precio de lista de $1000: 4 unidades = 1 combo + 1 suelta.
    const p = producto({
      precio: 1000,
      stock: 20,
      ofertaActiva: true,
      ofertaTipo: "combo",
      ofertaValor: 2500,
      ofertaCantidad: 3,
    })

    expect(totalesCarrito(agregarAlCarrito([], p, 4)).subtotal).toBe(3500)
  })

  it("resta el descuento global por monto", () => {
    const carrito = agregarAlCarrito([], producto({ precio: 1000 }), 3)

    expect(
      totalesCarrito(carrito, { tipo: "monto", valor: 500 }),
    ).toMatchObject({ subtotal: 3000, total: 2500 })
  })

  it("resta el descuento global por porcentaje", () => {
    const carrito = agregarAlCarrito([], producto({ precio: 1000 }), 3)

    expect(
      totalesCarrito(carrito, { tipo: "porcentaje", valor: 10 }),
    ).toMatchObject({ subtotal: 3000, descuento: 300, total: 2700 })
  })

  it("calcula el porcentaje sobre el subtotal ya con ofertas aplicadas", () => {
    // 50% de descuento en catálogo + 10% global = 500, no 900.
    const p = producto({
      precio: 1000,
      ofertaActiva: true,
      ofertaTipo: "porcentaje",
      ofertaValor: 50,
    })

    expect(
      totalesCarrito(agregarAlCarrito([], p, 1), { tipo: "porcentaje", valor: 10 }),
    ).toMatchObject({ subtotal: 500, descuento: 50, total: 450 })
  })

  it("redondea el descuento por porcentaje a dos decimales", () => {
    const carrito = agregarAlCarrito([], producto({ precio: 333 }), 1)

    expect(
      totalesCarrito(carrito, { tipo: "porcentaje", valor: 15 }),
    ).toMatchObject({ descuento: 49.95, total: 283.05 })
  })

  it("un porcentaje del 100% deja el total en cero", () => {
    const carrito = agregarAlCarrito([], producto({ precio: 1000 }), 2)

    expect(totalesCarrito(carrito, { tipo: "porcentaje", valor: 100 }).total).toBe(0)
  })

  it("recorta un porcentaje mayor a 100 en vez de dar saldo a favor", () => {
    const carrito = agregarAlCarrito([], producto({ precio: 1000 }), 1)

    expect(
      totalesCarrito(carrito, { tipo: "porcentaje", valor: 150 }),
    ).toMatchObject({ descuento: 1000, total: 0 })
  })

  it("nunca deja el total en negativo por un monto excesivo", () => {
    const carrito = agregarAlCarrito([], producto({ precio: 1000 }), 1)

    expect(totalesCarrito(carrito, { tipo: "monto", valor: 5000 })).toMatchObject({
      descuento: 1000,
      total: 0,
    })
  })

  it("ignora descuentos negativos o no numéricos", () => {
    const carrito = agregarAlCarrito([], producto({ precio: 1000 }), 1)

    expect(totalesCarrito(carrito, { tipo: "monto", valor: -50 }).total).toBe(1000)
    expect(totalesCarrito(carrito, { tipo: "porcentaje", valor: Number.NaN }).total).toBe(1000)
  })

  it("sin descuento el total es el subtotal", () => {
    const carrito = agregarAlCarrito([], producto({ precio: 1000 }), 2)

    expect(totalesCarrito(carrito)).toMatchObject({ descuento: 0, total: 2000 })
  })

  it("informa el ahorro total por ofertas", () => {
    const p = producto({
      precio: 1000,
      ofertaActiva: true,
      ofertaTipo: "porcentaje",
      ofertaValor: 10,
    })

    expect(totalesCarrito(agregarAlCarrito([], p, 2)).ahorro).toBe(200)
  })

  it("un carrito vacío da todo en cero", () => {
    expect(totalesCarrito([])).toMatchObject({ subtotal: 0, total: 0, ahorro: 0, items: 0 })
  })
})

describe("presentacionDe", () => {
  it("describe la bolsa cerrada por su peso", () => {
    expect(presentacionDe(producto({ pesoKg: 15 }))).toBe("15 kg")
  })

  it("no arrastra ceros de relleno en los pesos con coma", () => {
    expect(presentacionDe(producto({ pesoKg: 7.5 }))).toBe("7,5 kg")
  })

  it("marca el suelto como por kg", () => {
    expect(presentacionDe(producto({ unidad: "kg" }))).toBe("por kg")
  })

  it("queda vacía cuando no es alimento", () => {
    expect(presentacionDe(producto())).toBe("")
  })

  it("describe el paquete divisible por su cantidad de unidades", () => {
    expect(presentacionDe(producto({ unidadesPorBulto: 100 }))).toBe("x100")
  })
})

describe("itemsParaRPC", () => {
  it("manda un item por línea con el subtotal ya calculado", () => {
    const carrito = agregarAlCarrito([], producto({ precio: 1200 }), 2)

    expect(itemsParaRPC(carrito)).toEqual([
      { producto_id: "p1", cantidad: 2, precio_unitario: 1200, subtotal: 2400 },
    ])
  })

  it("en un combo manda el precio de lista y el subtotal con el combo aplicado", () => {
    const p = producto({
      precio: 1000,
      stock: 20,
      ofertaActiva: true,
      ofertaTipo: "combo",
      ofertaValor: 2500,
      ofertaCantidad: 3,
    })

    expect(itemsParaRPC(agregarAlCarrito([], p, 3))[0]).toMatchObject({
      precio_unitario: 1000,
      subtotal: 2500,
    })
  })
})
