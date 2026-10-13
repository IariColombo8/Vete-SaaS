import type { ReactNode } from "react"
import { CalendarCheck, CheckCircle2, Clock, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export type TonoEstado = "ok" | "aviso" | "peligro" | "info" | "neutro"

const TONOS: Record<TonoEstado, string> = {
  ok: "bg-success-soft text-success-soft-foreground",
  aviso: "bg-warning-soft text-warning-soft-foreground",
  peligro: "bg-destructive-soft text-destructive-soft-foreground",
  info: "bg-info-soft text-info-soft-foreground",
  neutro: "bg-muted text-muted-foreground",
}

/**
 * Badge de estado sobre los tokens semánticos de `app/globals.css`
 * (`--success`, `--warning`, `--info`, `--destructive` y sus `-soft`). Antes
 * cada pantalla armaba su combinación de emerald/amber/rose a mano y el mismo
 * estado se veía distinto según dónde estuvieras.
 */
export function EstadoBadge({
  tono,
  icono: Icono,
  children,
  className,
}: {
  tono: TonoEstado
  icono?: React.ComponentType<{ className?: string }>
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        TONOS[tono],
        className,
      )}
    >
      {Icono && <Icono className="h-3 w-3 shrink-0" />}
      {children}
    </span>
  )
}

const ESTADOS_TURNO: Record<string, { tono: TonoEstado; icono: React.ComponentType<{ className?: string }>; label: string }> = {
  pendiente: { tono: "aviso", icono: Clock, label: "Pendiente" },
  confirmado: { tono: "info", icono: CalendarCheck, label: "Confirmado" },
  completado: { tono: "ok", icono: CheckCircle2, label: "Completado" },
  cancelado: { tono: "peligro", icono: XCircle, label: "Cancelado" },
}

/** Estado de un turno. Antes había tres copias y dos no conocían "confirmado". */
export function EstadoTurnoBadge({ estado, className }: { estado: string; className?: string }) {
  const e = ESTADOS_TURNO[estado]
  if (!e) return <EstadoBadge tono="neutro" className={className}>{estado}</EstadoBadge>
  return (
    <EstadoBadge tono={e.tono} icono={e.icono} className={className}>
      {e.label}
    </EstadoBadge>
  )
}
