"use client"

import { useEffect, useState } from "react"
import { Loader2, Minus, Plus, Search, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { getProductos } from "@/lib/supabase/productos"
import { montoDescuento, type Descuento } from "@/lib/ventas/carrito"
import { pasoCantidad, precioLineaWeb } from "@/lib/pedidos/reglas"
import { formatCurrency } from "@/lib/format"
import type { Producto, ProductoUnidad } from "@/lib/supabase/types"

/**
 * Una línea del pedido mientras se edita. `producto` está cuando se conoce el
 * catálogo (para recalcular ofertas y combos al cambiar la cantidad);
 * `precioManual` cuando el staff fijó el precio a mano.
 */
export interface LineaEdicion {
  productoId: string
  nombre: string
  unidad: ProductoUnidad
  cantidad: number
  precioUnitario: number
  subtotal: number
  producto?: Producto
  precioManual?: boolean
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Recalcula el subtotal de una línea con su cantidad nueva. */
export function recalcular(l: LineaEdicion, cantidad: number): LineaEdicion {
  if (l.producto && !l.precioManual) {
    const { precioUnitario, subtotal } = precioLineaWeb(l.producto, cantidad)
    return { ...l, cantidad, precioUnitario, subtotal }
  }
  return { ...l, cantidad, subtotal: round2(l.precioUnitario * cantidad) }
}

interface Props {
  tenantId: string
  lineas: LineaEdicion[]
  onLineas: (l: LineaEdicion[]) => void
  descuento: Descuento
  onDescuento: (d: Descuento) => void
}

export function EditorItems({ tenantId, lineas, onLineas, descuento, onDescuento }: Props) {
  const [busqueda, setBusqueda] = useState("")
  const [resultados, setResultados] = useState<Producto[]>([])
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    const termino = busqueda.trim()
    if (termino.length < 2) {
      setResultados([])
      return
    }
    let vigente = true
    setBuscando(true)
    const t = setTimeout(() => {
      getProductos(tenantId, { busqueda: termino, porPagina: 8 })
        .then((r) => { if (vigente) setResultados(r.productos) })
        .finally(() => { if (vigente) setBuscando(false) })
    }, 250)
    return () => {
      vigente = false
      clearTimeout(t)
    }
  }, [busqueda, tenantId])

  const subtotal = round2(lineas.reduce((acc, l) => acc + l.subtotal, 0))
  const descuentoPesos = montoDescuento(subtotal, descuento)

  const agregar = (p: Producto) => {
    const i = lineas.findIndex((l) => l.productoId === p.id)
    if (i >= 0) {
      const copia = lineas.slice()
      copia[i] = recalcular({ ...copia[i], producto: copia[i].producto ?? p }, copia[i].cantidad + pasoCantidad(p.unidad))
      onLineas(copia)
    } else {
      const nueva: LineaEdicion = {
        productoId: p.id,
        nombre: [p.marca, p.nombre, p.linea].filter(Boolean).join(" "),
        unidad: p.unidad,
        cantidad: 0,
        precioUnitario: 0,
        subtotal: 0,
        producto: p,
      }
      onLineas([...lineas, recalcular(nueva, pasoCantidad(p.unidad))])
    }
    setBusqueda("")
    setResultados([])
  }

  const cambiarCantidad = (i: number, cantidad: number) => {
    const c = Math.round(cantidad * 1000) / 1000
    if (c <= 0) return
    const copia = lineas.slice()
    copia[i] = recalcular(copia[i], c)
    onLineas(copia)
  }

  const cambiarPrecio = (i: number, precio: number) => {
    if (!Number.isFinite(precio) || precio < 0) return
    const copia = lineas.slice()
    const l = { ...copia[i], precioUnitario: precio, precioManual: true }
    copia[i] = recalcular(l, l.cantidad)
    onLineas(copia)
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Sumar un producto: buscá por nombre o marca"
          className="pl-9"
        />
        {buscando && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        {resultados.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
            {resultados.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => agregar(p)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="min-w-0 truncate">{[p.marca, p.nombre, p.linea].filter(Boolean).join(" ")}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatCurrency(precioLineaWeb(p, 1).precioUnitario)}
                    {p.controlaStock && ` · stock ${p.stock.toLocaleString("es-AR")}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="divide-y rounded-lg border">
        {lineas.map((l, i) => {
          const paso = pasoCantidad(l.unidad)
          return (
            <div key={l.productoId} className="flex flex-wrap items-center gap-2 p-2.5 text-sm">
              <span className="min-w-0 flex-1 basis-48 truncate">{l.nombre}</span>
              <div className="inline-flex items-center rounded-md border">
                <button type="button" aria-label="Menos" className="flex h-8 w-8 items-center justify-center hover:bg-muted"
                  onClick={() => cambiarCantidad(i, l.cantidad - paso)}>
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <Input
                  type="number" min={0} step={paso} value={l.cantidad}
                  onChange={(e) => cambiarCantidad(i, Number(e.target.value))}
                  className="h-8 w-16 border-0 text-center shadow-none"
                  aria-label="Cantidad"
                />
                <button type="button" aria-label="Más" className="flex h-8 w-8 items-center justify-center hover:bg-muted"
                  onClick={() => cambiarCantidad(i, l.cantidad + paso)}>
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">$</span>
                <Input
                  type="number" min={0} value={l.precioUnitario}
                  onChange={(e) => cambiarPrecio(i, Number(e.target.value))}
                  className="h-8 w-24"
                  aria-label={l.unidad === "kg" ? "Precio por kilo" : "Precio unitario"}
                />
              </div>
              <span className="w-24 text-right font-semibold tabular-nums">{formatCurrency(l.subtotal)}</span>
              <Button
                type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-600"
                aria-label={`Quitar ${l.nombre}`}
                onClick={() => onLineas(lineas.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )
        })}
        {lineas.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">El pedido tiene que tener al menos un producto.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Descuento</span>
          <div className="inline-flex rounded-md border p-0.5">
            {(["monto", "porcentaje"] as const).map((tipo) => (
              <button
                key={tipo} type="button"
                onClick={() => onDescuento({ ...descuento, tipo })}
                className={`rounded px-2 py-1 text-xs font-semibold ${descuento.tipo === tipo ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {tipo === "monto" ? "$" : "%"}
              </button>
            ))}
          </div>
          <Input
            type="number" min={0} value={descuento.valor || ""}
            onChange={(e) => onDescuento({ ...descuento, valor: Number(e.target.value) || 0 })}
            className="h-8 w-24"
            aria-label="Descuento"
          />
        </div>
        <div className="text-right text-sm">
          {descuentoPesos > 0 && (
            <p className="text-muted-foreground">
              Subtotal {formatCurrency(subtotal)} · − {formatCurrency(descuentoPesos)}
            </p>
          )}
          <p className="text-lg font-bold">Total {formatCurrency(Math.max(subtotal - descuentoPesos, 0))}</p>
        </div>
      </div>
    </div>
  )
}
