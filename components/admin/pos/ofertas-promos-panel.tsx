"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { formatCurrency } from "@/lib/format"
import { precioFinal, comboLabel } from "@/lib/productos/precios"
import type { Producto, Promocion } from "@/lib/supabase/types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  productosEnOferta: Producto[]
  promociones: Promocion[]
  onAgregarProducto: (producto: Producto) => void
  onAgregarPromocion: (promocion: Promocion) => void
}

/**
 * Agregado manual: el POS ya aplica ofertas y promociones automáticamente al
 * detectar el producto/combo en el carrito, pero el vendedor puede querer
 * forzarlas (ej: mostrarle al cliente la promo antes de armar el carrito).
 */
export function OfertasPromosPanel({
  open, onOpenChange, productosEnOferta, promociones, onAgregarProducto, onAgregarPromocion,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Ofertas y promociones vigentes</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-6 overflow-y-auto">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Ofertas</h3>
            {productosEnOferta.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin productos en oferta.</p>
            ) : (
              <div className="space-y-2">
                {productosEnOferta.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onAgregarProducto(p)}
                    className="flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm hover:border-emerald-500"
                  >
                    <span>{p.nombre}</span>
                    <span className="font-medium text-emerald-600">
                      {comboLabel(p) ?? formatCurrency(precioFinal(p))}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Promociones</h3>
            {promociones.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin promociones vigentes.</p>
            ) : (
              <div className="space-y-2">
                {promociones.map((promo) => (
                  <button
                    key={promo.id}
                    type="button"
                    onClick={() => onAgregarPromocion(promo)}
                    className="flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm hover:border-emerald-500"
                  >
                    <span>{promo.nombre}</span>
                    <span className="font-medium text-emerald-600">{formatCurrency(promo.precioFinal)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
