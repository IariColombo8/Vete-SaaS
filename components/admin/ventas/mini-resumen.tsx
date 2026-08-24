import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"
import { MEDIOS_PAGO, type Venta } from "@/lib/supabase/types"
import { COLOR_MEDIO_PAGO } from "./colores-medio-pago"

interface Props {
  ventas: Venta[]
}

/**
 * Tarjetas chicas arriba del historial: cantidad y monto totales, y lo mismo
 * por cada medio de pago. Las anuladas no cuentan — ya no representan un cobro.
 */
export function MiniResumen({ ventas }: Props) {
  const vigentes = ventas.filter((v) => v.estado !== "anulada")
  const totalMonto = vigentes.reduce((acc, v) => acc + v.total, 0)

  return (
    <div className="flex flex-wrap gap-2 border-b bg-muted/30 p-3">
      <ChipResumen
        etiqueta={`${vigentes.length} ${vigentes.length === 1 ? "venta" : "ventas"}`}
        monto={formatCurrency(totalMonto)}
        className="bg-foreground text-background"
      />
      {MEDIOS_PAGO.map(({ id, label }) => {
        const deMedio = vigentes.filter((v) => v.medioPago === id)
        if (deMedio.length === 0) return null

        return (
          <ChipResumen
            key={id}
            etiqueta={`${label} (${deMedio.length})`}
            monto={formatCurrency(deMedio.reduce((acc, v) => acc + v.total, 0))}
            className={COLOR_MEDIO_PAGO[id]}
          />
        )
      })}
    </div>
  )
}

function ChipResumen({
  etiqueta,
  monto,
  className,
}: {
  etiqueta: string
  monto: string
  className: string
}) {
  return (
    <div className={cn("rounded-lg px-3 py-1.5", className)}>
      <p className="text-xs font-medium opacity-80">{etiqueta}</p>
      <p className="text-sm font-bold tabular-nums">{monto}</p>
    </div>
  )
}
