import { Sparkles, Clock } from "lucide-react"
import { precioFinal, tieneOferta, textoContadorDias } from "@/lib/productos/precios"
import { formatCurrency } from "@/lib/format"
import type { Producto } from "@/lib/supabase/types"

interface Props {
  producto: Producto
  logo?: string
  onClick?: () => void
}

/**
 * Tarjeta de producto para vistas públicas (landing y /[slug]/productos).
 * Sin acciones de compra: es catálogo informativo, el cliente consulta por
 * WhatsApp/teléfono igual que con los servicios.
 */
export function ProductoTarjeta({ producto: p, logo, onClick }: Props) {
  const enOferta = tieneOferta(p)
  // Producto sin foto propia -> logo del tenant -> logo de VetPanel, en ese orden.
  const imagen = p.imagenUrl || logo || "/logo.png"
  const final = precioFinal(p)
  const descuento = enOferta && p.precio > 0 ? Math.round((1 - final / p.precio) * 100) : 0
  const ahorro = enOferta ? p.precio - final : 0
  const sufijoUnidad = p.unidad === "kg" ? " / kg" : ""
  const contador = enOferta ? textoContadorDias(p.ofertaHasta) : null

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick() } : undefined}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white
                 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-300
                 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-[0_20px_40px_-16px_rgba(16,185,129,0.35)]
                 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-500/50 cursor-pointer text-left"
    >
      {/* Media */}
      <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900">
        <img
          src={imagen}
          alt={p.nombre}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
        />

        {/* Brillo sutil al pasar el mouse */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* Badge de descuento */}
        {enOferta && descuento > 0 && (
          <span
            className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500
                       px-2.5 py-1 text-xs font-extrabold text-white shadow-lg shadow-orange-500/30"
          >
            <Sparkles className="h-3 w-3" />
            {descuento}% OFF
          </span>
        )}
      </div>

      {/* Cuerpo */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="mb-3 line-clamp-3 text-xs font-semibold leading-snug text-slate-900 transition-colors duration-200 group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-400">
          {p.nombre}
        </h3>

        <div className="mt-auto">
          {enOferta ? (
            <div className="space-y-1">
              <span className="block text-xs text-slate-400 line-through dark:text-slate-500">
                {formatCurrency(p.precio)}
              </span>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(final)}
                </span>
                {sufijoUnidad && (
                  <span className="pb-1 text-xs font-medium text-slate-400">{sufijoUnidad.trim()}</span>
                )}
              </div>
              {ahorro > 0 && (
                <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                  Ahorrás {formatCurrency(ahorro)}
                </span>
              )}
              {contador && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                  <Clock className="h-3 w-3" />
                  {contador}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <span className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {formatCurrency(p.precio)}
              </span>
              {sufijoUnidad && (
                <span className="pb-1 text-xs font-medium text-slate-400">{sufijoUnidad.trim()}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Línea de acento inferior que aparece en hover */}
      <div className="h-1 w-full origin-left scale-x-0 bg-gradient-to-r from-emerald-500 to-teal-400 transition-transform duration-300 group-hover:scale-x-100" />
    </div>
  )
}
