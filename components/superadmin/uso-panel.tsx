import type { UsoResumen } from "@/lib/superadmin/actividad"
import { haceCuanto } from "@/lib/superadmin/actividad"
import { cn } from "@/lib/utils"

/**
 * Uso del panel en los últimos 30 días: una rayita por día (llena si entró),
 * el último ingreso y los totales. El número va siempre en texto: la tira
 * sola no se lee con lector de pantalla ni de un vistazo exacto.
 */
export function UsoPanel({
  uso, ahora, compacto = false,
}: {
  uso: UsoResumen | undefined
  ahora: Date
  compacto?: boolean
}) {
  if (!uso) {
    return <span className="text-xs text-muted-foreground">Sin registro</span>
  }
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium">{haceCuanto(uso.ultima, ahora)}</span>
        <span className="tabular-nums text-muted-foreground">
          {uso.diasActivos} {uso.diasActivos === 1 ? "día" : "días"}
          {!compacto && ` · ${uso.aperturas} ${uso.aperturas === 1 ? "ingreso" : "ingresos"}`}
        </span>
      </div>
      <div
        className="flex h-3 items-end gap-px"
        role="img"
        aria-label={`Entró ${uso.diasActivos} de los últimos ${uso.dias.length} días`}
      >
        {uso.dias.map((activo, i) => (
          <span
            key={i}
            className={cn(
              compacto ? "w-1 rounded-[1px]" : "w-1.5 rounded-[1px]",
              activo ? "h-3 bg-emerald-600 dark:bg-emerald-400" : "h-1 bg-muted-foreground/25",
            )}
          />
        ))}
      </div>
    </div>
  )
}
