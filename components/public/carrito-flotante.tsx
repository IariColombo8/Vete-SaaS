"use client"

import { useState } from "react"
import Link from "next/link"
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { formatCurrency } from "@/lib/format"
import { imagenSupabase } from "@/lib/imagenes"
import { pasoCantidad } from "@/lib/pedidos/reglas"
import { useCarritoTienda } from "@/hooks/use-carrito-tienda"

interface Props {
  slug: string
  logo?: string
}

/**
 * Botón flotante del carrito de la vidriera y su panel. Solo aparece cuando
 * hay algo en el carrito; "Finalizar compra" lleva a /[slug]/carrito.
 */
export function CarritoFlotante({ slug, logo }: Props) {
  const { lineas, total, unidades, cambiarCantidad, quitar } = useCarritoTienda(slug)
  const [abierto, setAbierto] = useState(false)

  if (unidades === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-3 rounded-full bg-coral py-3 pl-4 pr-5 text-white
                   shadow-[0_18px_40px_-12px_rgba(13,116,169,0.6)] transition-transform hover:scale-[1.03] hover:bg-coral-ink"
        aria-label={`Ver carrito (${unidades} productos)`}
      >
        <span className="relative">
          <ShoppingCart className="h-5 w-5" />
          <span className="absolute -right-2.5 -top-2.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber px-1 text-[11px] font-extrabold text-ink">
            {unidades}
          </span>
        </span>
        <span className="text-sm font-bold">{formatCurrency(total)}</span>
      </button>

      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Tu carrito</SheetTitle>
            <SheetDescription>
              {unidades} producto{unidades === 1 ? "" : "s"}
            </SheetDescription>
          </SheetHeader>

          <ul className="flex-1 divide-y overflow-y-auto px-4">
            {lineas.map((l) => {
              const paso = pasoCantidad(l.producto.unidad)
              return (
                <li key={l.producto.id} className="flex gap-3 py-3">
                  <img
                    src={imagenSupabase(l.producto.imagenUrl || logo || "/logo-512.png", 128)}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-lg border bg-white object-contain p-1"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">{l.producto.nombre}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="inline-flex items-center rounded-full border">
                        <button
                          type="button" aria-label="Menos"
                          onClick={() => cambiarCantidad(l.producto.id, l.cantidad - paso)}
                          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-12 text-center text-sm font-semibold tabular-nums">
                          {l.cantidad.toLocaleString("es-AR")}{l.producto.unidad === "kg" ? " kg" : ""}
                        </span>
                        <button
                          type="button" aria-label="Más"
                          onClick={() => cambiarCantidad(l.producto.id, l.cantidad + paso)}
                          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="text-sm font-bold tabular-nums">{formatCurrency(l.subtotal)}</span>
                    </div>
                  </div>
                  <button
                    type="button" aria-label={`Quitar ${l.producto.nombre}`}
                    onClick={() => quitar(l.producto.id)}
                    className="self-start rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="space-y-3 border-t p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-extrabold tabular-nums">{formatCurrency(total)}</span>
            </div>
            <Link
              href={`/${slug}/carrito`}
              onClick={() => setAbierto(false)}
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-coral text-sm font-bold text-white hover:bg-coral-ink"
            >
              Finalizar compra
            </Link>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="w-full text-center text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Seguir comprando
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
