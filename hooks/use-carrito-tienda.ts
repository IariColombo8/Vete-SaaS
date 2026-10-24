"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { cantidadValida, CANTIDAD_MAXIMA, pasoCantidad, precioLineaWeb } from "@/lib/pedidos/reglas"
import type { Producto } from "@/lib/supabase/types"

/**
 * Carrito de la vidriera, en localStorage por veterinaria. Sobrevive al
 * login con Google (que sale de la página y vuelve) y se comparte entre la
 * vidriera y el checkout. Los precios que se ven acá son orientativos: el
 * servidor los recalcula con el catálogo al confirmar.
 *
 * Varias instancias del hook (botón flotante, tarjetas, checkout) se
 * enteran de los cambios por un evento propio; otras pestañas, por `storage`.
 */

/** Lo que se guarda de cada producto: lo mínimo para mostrar y calcular. */
export type ProductoCarrito = Pick<
  Producto,
  "id" | "nombre" | "marca" | "imagenUrl" | "precio" | "unidad" | "ofertaActiva" | "ofertaTipo" | "ofertaValor" | "ofertaCantidad" | "ofertaHasta"
>

export interface LineaCarritoTienda {
  producto: ProductoCarrito
  cantidad: number
}

const EVENTO = "carrito-tienda"
const clave = (slug: string) => `vetpanel:carrito:${slug}`

function leer(slug: string): LineaCarritoTienda[] {
  try {
    const raw = window.localStorage.getItem(clave(slug))
    const data = raw ? (JSON.parse(raw) as LineaCarritoTienda[]) : []
    return Array.isArray(data) ? data.filter((l) => l?.producto?.id && l.cantidad > 0) : []
  } catch {
    return []
  }
}

function escribir(slug: string, lineas: LineaCarritoTienda[]) {
  try {
    window.localStorage.setItem(clave(slug), JSON.stringify(lineas))
  } catch {
    // Navegación privada / almacenamiento bloqueado: el carrito vive en memoria.
  }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { slug, lineas } }))
}

function aCarrito(p: Producto | ProductoCarrito): ProductoCarrito {
  return {
    id: p.id,
    nombre: p.nombre,
    marca: p.marca,
    imagenUrl: p.imagenUrl,
    precio: p.precio,
    unidad: p.unidad,
    ofertaActiva: p.ofertaActiva,
    ofertaTipo: p.ofertaTipo,
    ofertaValor: p.ofertaValor,
    ofertaCantidad: p.ofertaCantidad,
    ofertaHasta: p.ofertaHasta,
  }
}

export function useCarritoTienda(slug: string) {
  const [lineas, setLineas] = useState<LineaCarritoTienda[]>([])

  useEffect(() => {
    setLineas(leer(slug))
    const alCambiar = (e: Event) => {
      const d = (e as CustomEvent<{ slug: string; lineas: LineaCarritoTienda[] }>).detail
      if (d?.slug === slug) setLineas(d.lineas)
    }
    const alStorage = (e: StorageEvent) => {
      if (e.key === clave(slug)) setLineas(leer(slug))
    }
    window.addEventListener(EVENTO, alCambiar)
    window.addEventListener("storage", alStorage)
    return () => {
      window.removeEventListener(EVENTO, alCambiar)
      window.removeEventListener("storage", alStorage)
    }
  }, [slug])

  const guardar = useCallback(
    (cambiar: (actual: LineaCarritoTienda[]) => LineaCarritoTienda[]) => {
      const nuevas = cambiar(leer(slug))
      setLineas(nuevas)
      escribir(slug, nuevas)
    },
    [slug],
  )

  const agregar = useCallback(
    (producto: Producto | ProductoCarrito, cantidad?: number) => {
      const paso = cantidad ?? pasoCantidad(producto.unidad)
      guardar((actual) => {
        const i = actual.findIndex((l) => l.producto.id === producto.id)
        if (i === -1) return [...actual, { producto: aCarrito(producto), cantidad: paso }]
        const copia = actual.slice()
        copia[i] = { producto: aCarrito(producto), cantidad: Math.min(CANTIDAD_MAXIMA, copia[i].cantidad + paso) }
        return copia
      })
    },
    [guardar],
  )

  const cambiarCantidad = useCallback(
    (productoId: string, cantidad: number) => {
      guardar((actual) =>
        actual
          .map((l) => {
            if (l.producto.id !== productoId) return l
            const redondeada = Math.round(cantidad * 10) / 10
            // Bajar de la cantidad mínima saca el producto del carrito.
            if (redondeada <= 0) return { ...l, cantidad: 0 }
            return cantidadValida(l.producto.unidad, redondeada) ? { ...l, cantidad: redondeada } : l
          })
          .filter((l) => l.cantidad > 0),
      )
    },
    [guardar],
  )

  const quitar = useCallback(
    (productoId: string) => guardar((actual) => actual.filter((l) => l.producto.id !== productoId)),
    [guardar],
  )

  const vaciar = useCallback(() => guardar(() => []), [guardar])

  const resumen = useMemo(() => {
    const conPrecio = lineas.map((l) => ({ ...l, ...precioLineaWeb(l.producto, l.cantidad) }))
    return {
      lineas: conPrecio,
      total: Math.round(conPrecio.reduce((acc, l) => acc + l.subtotal, 0) * 100) / 100,
      unidades: lineas.length,
    }
  }, [lineas])

  return { ...resumen, agregar, cambiarCantidad, quitar, vaciar }
}
