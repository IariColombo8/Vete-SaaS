import type { Producto } from "@/lib/supabase/types"
import { precioFinal, precioLinea } from "@/lib/productos/precios"

/**
 * Carrito del mostrador. Puro y sin acceso a datos: acá vive la plata, así que
 * conviene poder testearlo sin base ni navegador.
 *
 * Todas las funciones devuelven un carrito nuevo — nunca mutan el que reciben.
 * El estado del POS es un `useState<LineaCarrito[]>` y React necesita ver un
 * array distinto para volver a renderizar.
 *
 * El cálculo de ofertas no se reimplementa acá: se reusa `lib/productos/precios`,
 * que ya sabe de descuentos por monto, por porcentaje y de combos.
 */

/** A quién quedó atada la línea, para anotarlo en la historia clínica al cobrar. */
export interface VinculoAtencion {
  clienteId: string
  mascotaId: string
  mascotaNombre: string
}

/** Una línea del carrito: el producto y cuánto se lleva el cliente. */
export interface LineaCarrito {
  /**
   * Identifica la línea en el carrito. Para productos de catálogo es
   * `producto.id` (así dos escaneos del mismo código suman sobre la misma
   * línea); para servicios de precio libre como "Atención veterinaria" es un
   * id propio, porque dos atenciones en la misma venta son líneas distintas
   * aunque compartan el mismo producto-percha.
   */
  id: string
  producto: Producto
  /** Unidades, o kilos cuando `producto.unidad === "kg"`. */
  cantidad: number
  /** Precio cargado a mano (servicios sin tarifa fija). Pisa el precio de catálogo. */
  precioManual?: number
  /** Motivo de la atención ("Consulta", "Control"). Solo aplica a servicios manuales. */
  motivo?: string
  /** Cliente/mascota a los que se les va a anotar esta atención en su historia. */
  vinculo?: VinculoAtencion
}

export interface TotalesCarrito {
  /** Suma de las líneas, con las ofertas ya aplicadas. */
  subtotal: number
  /** Descuento global que carga el vendedor a mano. */
  descuento: number
  total: number
  /** Cuánto se ahorró el cliente por ofertas del catálogo. */
  ahorro: number
  /** Cantidad de líneas distintas (no de unidades). */
  items: number
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

/**
 * Los kg admiten decimales; las unidades, no — salvo una bolsa cerrada con
 * peso detectado (`pesoKg`) o un paquete divisible (`unidadesPorBulto`, ej.
 * una caja de 100 golosinas que se vende de a una), que se pueden fraccionar
 * (0.5 = media bolsa o medio paquete, vendido desde `CantidadDialog`). Vender
 * "1,5 collares" sigue siendo un error de tipeo: ahí no hay nada que fraccionar.
 */
function validarCantidad(producto: Producto, cantidad: number): void {
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    throw new Error("La cantidad tiene que ser mayor a cero")
  }
  const fraccionable =
    (producto.pesoKg != null && producto.pesoKg > 0) ||
    (producto.unidadesPorBulto != null && producto.unidadesPorBulto > 0)
  if (producto.unidad === "un" && !fraccionable && !Number.isInteger(cantidad)) {
    throw new Error(`"${producto.nombre}" se vende por unidad entera`)
  }
}

function validarStock(producto: Producto, cantidadTotal: number): void {
  // Los servicios (baño, peluquería) no llevan stock: se pueden vender siempre.
  if (!producto.controlaStock) return

  if (cantidadTotal > producto.stock) {
    const unidad = producto.unidad === "kg" ? "kg" : "u."
    throw new Error(
      `No hay stock suficiente de "${producto.nombre}": ` +
        `quedan ${producto.stock} ${unidad} y se piden ${cantidadTotal} ${unidad}`,
    )
  }
}

/**
 * Agrega un producto. Si ya está en el carrito suma sobre la línea existente:
 * escanear el mismo código dos veces tiene que dar "2", no dos renglones.
 */
export function agregarAlCarrito(
  carrito: LineaCarrito[],
  producto: Producto,
  cantidad = 1,
): LineaCarrito[] {
  validarCantidad(producto, cantidad)

  const existente = carrito.find((l) => l.id === producto.id)
  const nuevaCantidad = round3((existente?.cantidad ?? 0) + cantidad)
  validarStock(producto, nuevaCantidad)

  if (!existente) {
    return [...carrito, { id: producto.id, producto, cantidad }]
  }

  return carrito.map((l) =>
    l.id === producto.id ? { ...l, cantidad: nuevaCantidad } : l,
  )
}

/**
 * Agrega un servicio de precio libre (p. ej. "Atención veterinaria"). A
 * diferencia de `agregarAlCarrito`, siempre crea una línea nueva: dos
 * atenciones en la misma venta —para dos mascotas distintas— no se pueden
 * fusionar en una sola cantidad.
 */
export function agregarAtencion(
  carrito: LineaCarrito[],
  producto: Producto,
  costo: number,
  motivo?: string,
  vinculo?: VinculoAtencion,
): LineaCarrito[] {
  if (!Number.isFinite(costo) || costo <= 0) {
    throw new Error("El costo tiene que ser mayor a cero")
  }
  const id = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${producto.id}-${Date.now()}`
  return [
    ...carrito,
    { id, producto, cantidad: 1, precioManual: round2(costo), motivo: motivo || undefined, vinculo },
  ]
}

/** Los kg se manejan con 3 decimales, igual que la columna `stock` en la base. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** Fija la cantidad de una línea. Poner cero (o menos) equivale a quitarla. */
export function cambiarCantidad(
  carrito: LineaCarrito[],
  lineaId: string,
  cantidad: number,
): LineaCarrito[] {
  const linea = carrito.find((l) => l.id === lineaId)
  if (!linea) return carrito
  if (cantidad <= 0) return quitarDelCarrito(carrito, lineaId)

  validarCantidad(linea.producto, cantidad)
  validarStock(linea.producto, cantidad)

  return carrito.map((l) => (l.id === lineaId ? { ...l, cantidad } : l))
}

export function quitarDelCarrito(
  carrito: LineaCarrito[],
  lineaId: string,
): LineaCarrito[] {
  return carrito.filter((l) => l.id !== lineaId)
}

/** Importe de una línea. Un precio cargado a mano pisa el de catálogo y sus ofertas. */
export function subtotalLinea(linea: LineaCarrito): number {
  if (linea.precioManual != null) return round2(linea.precioManual * linea.cantidad)
  return precioLinea(linea.producto, linea.cantidad)
}

/** Descuento global que carga el vendedor: en pesos o en porcentaje. */
export type DescuentoTipo = "monto" | "porcentaje"

export interface Descuento {
  tipo: DescuentoTipo
  valor: number
}

export const SIN_DESCUENTO: Descuento = { tipo: "monto", valor: 0 }

/**
 * Resuelve el descuento a pesos.
 *
 * El porcentaje se aplica sobre el subtotal **ya con las ofertas del catálogo
 * aplicadas**, no sobre el precio de lista: un 10% arriba de un 2x1 se calcula
 * sobre lo que el cliente realmente paga.
 *
 * Nunca devuelve más que el subtotal — un descuento excesivo deja el total en
 * cero, no en saldo a favor.
 */
export function montoDescuento(subtotal: number, descuento: Descuento): number {
  const valor = Number(descuento.valor)
  if (!Number.isFinite(valor) || valor <= 0) return 0

  const bruto = descuento.tipo === "porcentaje" ? (subtotal * valor) / 100 : valor
  return Math.min(round2(bruto), round2(subtotal))
}

export function totalesCarrito(
  carrito: LineaCarrito[],
  descuento: Descuento = SIN_DESCUENTO,
): TotalesCarrito {
  let subtotal = 0
  let sinOferta = 0

  for (const linea of carrito) {
    subtotal += subtotalLinea(linea)
    sinOferta += linea.producto.precio * linea.cantidad
  }

  subtotal = round2(subtotal)
  const desc = montoDescuento(subtotal, descuento)

  return {
    subtotal,
    descuento: desc,
    total: Math.max(0, round2(subtotal - desc)),
    ahorro: Math.max(0, round2(sinOferta - subtotal)),
    items: carrito.length,
  }
}

/**
 * Etiqueta de la presentación para la UI y el remito.
 *
 * Espeja el `case` que arma `registrar_venta` en 005_ventas.sql. Se duplica a
 * propósito: la base necesita el valor para congelarlo en el item, y el POS lo
 * necesita antes de que la venta exista.
 */
export function presentacionDe(producto: Producto): string {
  if (producto.unidad === "kg") return "por kg"
  if (producto.pesoKg != null && producto.pesoKg > 0) {
    return `${producto.pesoKg.toLocaleString("es-AR", { maximumFractionDigits: 3 })} kg`
  }
  if (producto.unidadesPorBulto != null && producto.unidadesPorBulto > 0) {
    return `x${producto.unidadesPorBulto}`
  }
  return ""
}

/** Nombre completo para mostrar: "Royal Canin Adulto Mediano · 15 kg". */
export function descripcionLinea(producto: Producto): string {
  const partes = [producto.marca, producto.nombre, producto.linea].filter(
    (p): p is string => Boolean(p && p.trim()),
  )
  const presentacion = presentacionDe(producto)
  const base = partes.join(" ")
  return presentacion ? `${base} · ${presentacion}` : base
}

/** Item tal como lo espera la RPC `registrar_venta`. */
export interface ItemRPC {
  producto_id: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

/**
 * Traduce el carrito al formato de la RPC.
 *
 * En un combo no existe un precio por unidad fijo, así que se manda el de lista
 * y el subtotal ya calculado — es el subtotal el que manda, y la base lo vuelve
 * a sumar para armar el total de la venta.
 */
export function itemsParaRPC(carrito: LineaCarrito[]): ItemRPC[] {
  return carrito.map((linea) => ({
    producto_id: linea.producto.id,
    cantidad: linea.cantidad,
    precio_unitario:
      linea.precioManual != null
        ? round2(linea.precioManual)
        : linea.producto.ofertaTipo === "combo" && linea.producto.ofertaActiva
          ? round2(linea.producto.precio)
          : precioFinal(linea.producto),
    subtotal: subtotalLinea(linea),
  }))
}
