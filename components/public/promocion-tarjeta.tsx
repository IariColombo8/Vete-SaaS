import { Gift, Tag, Clock } from "lucide-react"
import { textoContadorDias } from "@/lib/productos/precios"
import { formatCurrency } from "@/lib/format"
import type { Producto, Promocion } from "@/lib/supabase/types"

interface Props {
  promocion: Promocion
  productos: Record<string, Producto>
  logo?: string
  onClick?: () => void
}

/**
 * Tarjeta de promoción para la landing pública. Mismo lenguaje visual que
 * `ProductoTarjeta`: sin acciones de compra, solo catálogo informativo.
 */
export function PromocionTarjeta({ promocion: p, productos, logo, onClick }: Props) {
  const imagen = p.imagenUrl || logo
  const items = p.items.map((i) => ({ item: i, producto: productos[i.productoId] }))
  const precioListaTotal = items.reduce(
    (acc, { item, producto }) => (producto ? acc + producto.precio * item.cantidad : acc),
    0,
  )
  const hayDescuento = precioListaTotal > p.precioFinal
  const ahorro = hayDescuento ? precioListaTotal - p.precioFinal : 0
  const descuento = hayDescuento && precioListaTotal > 0 ? Math.round((ahorro / precioListaTotal) * 100) : 0
  const contador = textoContadorDias(p.hasta)

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick() } : undefined}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-emerald-200/70 bg-white
                 cursor-pointer text-left
                 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-300
                 hover:-translate-y-1 hover:border-emerald-400 hover:shadow-[0_24px_48px_-18px_rgba(16,185,129,0.45)]
                 dark:border-emerald-500/20 dark:bg-slate-900 dark:hover:border-emerald-500/60"
    >
      {/* Cinta superior de promo */}
      <div className="flex items-center justify-between bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2 text-white">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
          <Tag className="h-3.5 w-3.5" />
          Promoción
        </span>
        {descuento > 0 && <span className="text-xs font-extrabold">-{descuento}%</span>}
      </div>

      {/* Media */}
      <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900">
        {imagen ? (
          <img
            src={imagen || "/placeholder.svg"}
            alt={p.nombre}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Gift className="h-12 w-12 text-slate-300 dark:text-slate-600" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </div>

      {/* Cuerpo */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="mb-2 line-clamp-1 text-[15px] font-semibold text-slate-900 transition-colors duration-200 group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-400">
          {p.nombre}
        </h3>

        {items.length > 0 && (
          <ul className="mb-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
            {items.map(({ item, producto }) => (
              <li key={item.productoId} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                <span className="line-clamp-1">
                  {producto ? producto.nombre : "…"}
                  <span className="ml-1 text-slate-400 dark:text-slate-500">
                    × {item.cantidad}
                    {producto?.unidad === "kg" ? " kg" : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto">
          {hayDescuento && (
            <span className="block text-xs text-slate-400 line-through dark:text-slate-500">
              {formatCurrency(precioListaTotal)}
            </span>
          )}
          <div className="flex items-end justify-between gap-2">
            <span className="text-2xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
              {formatCurrency(p.precioFinal)}
            </span>
            {ahorro > 0 && (
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                Ahorrás {formatCurrency(ahorro)}
              </span>
            )}
          </div>
          {contador && (
            <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-orange-600 dark:text-orange-400">
              <Clock className="h-3 w-3" />
              {contador}
            </span>
          )}
        </div>
      </div>

      <div className="h-1 w-full origin-left scale-x-0 bg-gradient-to-r from-emerald-500 to-teal-400 transition-transform duration-300 group-hover:scale-x-100" />
    </div>
  )
}
