import { Package } from "lucide-react"
import { precioFinal, tieneOferta } from "@/lib/productos/precios"
import { formatCurrency } from "@/lib/format"
import type { Producto } from "@/lib/supabase/types"

interface Props {
  producto: Producto
  logo?: string
}

/**
 * Tarjeta de producto para vistas públicas (landing y /[slug]/productos).
 * Sin acciones de compra: es catálogo informativo, el cliente consulta por
 * WhatsApp/teléfono igual que con los servicios.
 */
export function ProductoTarjeta({ producto: p, logo }: Props) {
  const enOferta = tieneOferta(p)
  const imagen = p.imagenUrl || logo

  return (
    <div className="group relative h-full rounded-3xl p-[1px] bg-gradient-to-br from-emerald-500/20 via-transparent to-teal-500/20
                    hover:from-emerald-500/40 hover:to-teal-500/40 transition-all duration-700">
      <div className="relative h-full rounded-3xl bg-white dark:bg-slate-900 overflow-hidden
                      transition-all duration-500 group-hover:shadow-2xl group-hover:shadow-emerald-500/10">
        <div className="aspect-square w-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
          {imagen ? (
            <img
              src={imagen}
              alt={p.nombre}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <Package className="h-12 w-12 text-slate-300 dark:text-slate-600" />
          )}
        </div>
        <div className="p-5">
          <h3 className="font-bold text-slate-900 dark:text-white text-base mb-2 line-clamp-1
                         group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors duration-300">
            {p.nombre}
          </h3>
          {enOferta ? (
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-slate-400 line-through">{formatCurrency(p.precio)}</span>
              <span className="font-bold text-emerald-600">{formatCurrency(precioFinal(p))}</span>
            </div>
          ) : (
            <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(p.precio)}</span>
          )}
        </div>
      </div>
    </div>
  )
}
