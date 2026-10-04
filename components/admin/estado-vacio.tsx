import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface Props {
  icono: ReactNode
  titulo: string
  /** Qué hacer para que deje de estar vacío. Es lo que diferencia esto de un "No hay nada". */
  descripcion: string
  accion?: ReactNode
  className?: string
}

/**
 * Pantalla vacía que guía: dice qué falta y cómo cargarlo, en lugar de un
 * "No hay X" suelto que deja a quien recién empieza sin saber por dónde seguir.
 */
export function EstadoVacio({ icono, titulo, descripcion, accion, className }: Props) {
  return (
    <div className={cn("flex flex-col items-center px-4 py-12 text-center", className)}>
      <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-accent text-primary [&_svg]:size-6">
        {icono}
      </div>
      <p className="text-sm font-semibold text-foreground">{titulo}</p>
      <p className="mt-1 max-w-sm text-balance text-xs leading-relaxed text-muted-foreground">
        {descripcion}
      </p>
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  )
}
