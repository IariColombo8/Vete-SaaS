"use client"

import { Gift, Package, Sparkles, Tag, Clock } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { precioFinal, tieneOferta, textoContadorDias } from "@/lib/productos/precios"
import { formatCurrency } from "@/lib/format"
import type { Producto, Promocion } from "@/lib/supabase/types"

interface Props {
  producto: Producto | null
  promocion: Promocion | null
  productosDePromos: Record<string, Producto>
  logo?: string
  onOpenChange: (open: boolean) => void
}

/**
 * Modal de detalle al tocar una tarjeta en la vidriera pública. Panel grande
 * a dos columnas (imagen | info) en desktop: es la única forma de ver el
 * detalle completo de una promo con muchos productos, ya que la tarjeta
 * trunca la lista.
 */
export function DetalleDialog({ producto, promocion, productosDePromos, logo, onOpenChange }: Props) {
  const open = producto !== null || promocion !== null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-3xl border-0 p-0 shadow-2xl sm:max-w-3xl"
      >
        <DialogTitle className="sr-only">
          {producto?.nombre || promocion?.nombre || "Detalle"}
        </DialogTitle>
        {producto && <DetalleProducto producto={producto} logo={logo} onClose={() => onOpenChange(false)} />}
        {promocion && (
          <DetallePromocion
            promocion={promocion} productosDePromos={productosDePromos} logo={logo}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function BotonCerrar({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      aria-label="Cerrar"
      className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full
                 bg-white/90 text-slate-600 shadow-lg backdrop-blur-sm transition-all duration-200
                 hover:scale-110 hover:bg-white hover:text-slate-900 dark:bg-slate-900/90 dark:text-slate-300
                 dark:hover:bg-slate-900 dark:hover:text-white"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  )
}

function DetalleProducto({ producto: p, logo, onClose }: { producto: Producto; logo?: string; onClose: () => void }) {
  const enOferta = tieneOferta(p)
  const imagen = p.imagenUrl || logo
  const final = precioFinal(p)
  const descuento = enOferta && p.precio > 0 ? Math.round((1 - final / p.precio) * 100) : 0
  const ahorro = enOferta ? p.precio - final : 0
  const sufijoUnidad = p.unidad === "kg" ? " / kg" : ""
  const contador = enOferta ? textoContadorDias(p.ofertaHasta) : null

  return (
    <div className="grid max-h-[85vh] grid-cols-1 overflow-y-auto sm:max-h-[80vh] sm:grid-cols-2 sm:overflow-hidden">
      {/* Media */}
      <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-950 sm:aspect-auto">
        <BotonCerrar onClose={onClose} />
        {enOferta && descuento > 0 && (
          <span className="absolute left-4 top-4 z-10 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500
                           px-3 py-1.5 text-sm font-extrabold text-white shadow-lg shadow-orange-500/30">
            <Sparkles className="h-4 w-4" />
            {descuento}% OFF
          </span>
        )}
        {imagen ? (
          <img src={imagen} alt={p.nombre} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Package className="h-20 w-20 text-slate-300 dark:text-slate-600" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col justify-center gap-5 bg-white p-8 dark:bg-slate-900 sm:overflow-y-auto">
        <DialogHeader className="gap-2 text-left">
          {(p.categoria || p.marca) && (
            <span className="inline-flex w-fit items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold
                             uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
              {[p.categoria, p.marca].filter(Boolean).join(" · ")}
            </span>
          )}
          <DialogTitle className="text-2xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            {p.nombre}
          </DialogTitle>
          <DialogDescription className="sr-only">Detalle del producto</DialogDescription>
        </DialogHeader>

        <div className="h-px w-full bg-gradient-to-r from-emerald-200 via-slate-100 to-transparent dark:from-emerald-500/20 dark:via-slate-800" />

        {enOferta ? (
          <div className="space-y-2">
            <span className="block text-base text-slate-400 line-through dark:text-slate-500">
              {formatCurrency(p.precio)}
            </span>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
                {formatCurrency(final)}
              </span>
              {sufijoUnidad && <span className="pb-1.5 text-sm font-medium text-slate-400">{sufijoUnidad.trim()}</span>}
            </div>
            {ahorro > 0 && (
              <span className="inline-block rounded-lg bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                Ahorrás {formatCurrency(ahorro)}
              </span>
            )}
            {contador && (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-orange-600 dark:text-orange-400">
                <Clock className="h-4 w-4" />
                {contador}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <span className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {formatCurrency(p.precio)}
            </span>
            {sufijoUnidad && <span className="pb-1.5 text-sm font-medium text-slate-400">{sufijoUnidad.trim()}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function DetallePromocion({
  promocion: p, productosDePromos, logo, onClose,
}: { promocion: Promocion; productosDePromos: Record<string, Producto>; logo?: string; onClose: () => void }) {
  const imagen = p.imagenUrl || logo
  const items = p.items.map((i) => ({ item: i, producto: productosDePromos[i.productoId] }))
  const precioListaTotal = items.reduce(
    (acc, { item, producto }) => (producto ? acc + producto.precio * item.cantidad : acc),
    0,
  )
  const hayDescuento = precioListaTotal > p.precioFinal
  const ahorro = hayDescuento ? precioListaTotal - p.precioFinal : 0
  const descuento = hayDescuento && precioListaTotal > 0 ? Math.round((ahorro / precioListaTotal) * 100) : 0
  const contador = textoContadorDias(p.hasta)

  return (
    <div className="grid max-h-[85vh] grid-cols-1 overflow-y-auto sm:max-h-[80vh] sm:grid-cols-2 sm:overflow-hidden">
      {/* Media */}
      <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-950 dark:to-teal-950 sm:aspect-auto">
        <BotonCerrar onClose={onClose} />
        <div className="absolute left-0 top-0 z-10 flex items-center gap-1.5 rounded-br-2xl bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2 text-white">
          <Tag className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-wide">Promoción</span>
          {descuento > 0 && <span className="ml-1 text-xs font-extrabold">-{descuento}%</span>}
        </div>
        {imagen ? (
          <img src={imagen} alt={p.nombre} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Gift className="h-20 w-20 text-emerald-300 dark:text-emerald-800" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col justify-center gap-5 bg-white p-8 dark:bg-slate-900 sm:overflow-y-auto">
        <DialogHeader className="gap-2 text-left">
          <DialogTitle className="text-2xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            {p.nombre}
          </DialogTitle>
          {p.descripcion ? (
            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
              {p.descripcion}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">Detalle de la promoción</DialogDescription>
          )}
        </DialogHeader>

        {items.length > 0 && (
          <div>
            <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-slate-400">Esta promo incluye</h4>
            <ul className="space-y-2 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
              {items.map(({ item, producto }) => (
                <li key={item.productoId} className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                    ✓
                  </span>
                  <span className="flex-1">{producto ? producto.nombre : "…"}</span>
                  <span className="text-xs font-semibold text-slate-400">
                    × {item.cantidad}{producto?.unidad === "kg" ? " kg" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="h-px w-full bg-gradient-to-r from-emerald-200 via-slate-100 to-transparent dark:from-emerald-500/20 dark:via-slate-800" />

        <div>
          {hayDescuento && (
            <span className="block text-base text-slate-400 line-through dark:text-slate-500">
              {formatCurrency(precioListaTotal)}
            </span>
          )}
          <div className="flex items-end justify-between gap-2">
            <span className="text-4xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
              {formatCurrency(p.precioFinal)}
            </span>
            {ahorro > 0 && (
              <span className="rounded-lg bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                Ahorrás {formatCurrency(ahorro)}
              </span>
            )}
          </div>
          {contador && (
            <span className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-orange-600 dark:text-orange-400">
              <Clock className="h-4 w-4" />
              {contador}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
