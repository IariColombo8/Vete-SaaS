import { Tag, Clock } from "lucide-react"
import { precioFinal, textoContadorDias } from "@/lib/productos/precios"
import { formatCurrency } from "@/lib/format"
import { imagenSupabase } from "@/lib/imagenes"
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
  // Promo sin foto propia -> logo del tenant -> logo de VetPanel, en ese orden.
  // Escalada por Supabase a 480 px: la tarjeta mide ~300 px; el logo de respaldo es la versión chica.
  const imagen = imagenSupabase(p.imagenUrl || logo || "/logo-512.png", 480)
  const items = p.items.map((i) => ({ item: i, producto: productos[i.productoId] }))
  // "Sin la promo" usa el precio con oferta individual ya aplicada (precioFinal),
  // no el de lista: si un producto además tiene su propia oferta activa, ese es
  // el precio real que se estaría pagando por fuera de la promo.
  const precioListaTotal = items.reduce(
    (acc, { item, producto }) => (producto ? acc + precioFinal(producto) * item.cantidad : acc),
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
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-warm-border bg-white
                 cursor-pointer text-left
                 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-300
                 hover:-translate-y-1 hover:border-coral/40 hover:shadow-[0_24px_48px_-18px_rgba(13,116,169,0.35)]
                 "
    >
      {/* Cinta superior de promo */}
      <div className="flex items-center justify-between bg-gradient-to-r from-coral to-teal-ink px-4 py-2 text-white">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
          <Tag className="h-3.5 w-3.5" />
          Promoción
        </span>
        {descuento > 0 && <span className="text-xs font-extrabold">-{descuento}%</span>}
      </div>

      {/* Media: mismo aspect-square que ProductoTarjeta, para que ambas
          queden del mismo tamaño una al lado de la otra en la grilla. */}
      <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-cream to-cream-deep">
        <img
          src={imagen}
          alt={p.nombre}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </div>

      {/* Cuerpo */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="mb-2 line-clamp-1 text-[15px] font-semibold text-ink transition-colors duration-200 group-hover:text-coral">
          {p.nombre}
        </h3>

        {p.descripcion && (
          <p className="mb-3 line-clamp-2 text-xs text-ink-muted">
            {p.descripcion}
          </p>
        )}

        <div className="mt-auto">
          {hayDescuento && (
            <span className="block text-xs text-ink-muted line-through">
              {formatCurrency(precioListaTotal)}
            </span>
          )}
          <span className="block text-2xl font-extrabold tracking-tight text-coral">
            {formatCurrency(p.precioFinal)}
          </span>
          {ahorro > 0 && (
            <span className="mt-1 inline-block rounded-md bg-teal-soft px-2 py-0.5 text-[11px] font-bold text-teal-ink">
              Ahorrás {formatCurrency(ahorro)}
            </span>
          )}
          {contador && (
            <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-coral-ink">
              <Clock className="h-3 w-3" />
              {contador}
            </span>
          )}
        </div>
      </div>

      <div className="h-1 w-full origin-left scale-x-0 bg-gradient-to-r from-coral to-teal transition-transform duration-300 group-hover:scale-x-100" />
    </div>
  )
}
