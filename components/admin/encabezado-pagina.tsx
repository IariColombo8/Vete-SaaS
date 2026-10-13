import type { ReactNode } from "react"

interface Props {
  icono: React.ComponentType<{ className?: string }>
  titulo: ReactNode
  descripcion?: ReactNode
  /** Botones o controles a la derecha (en mobile bajan debajo del título). */
  acciones?: ReactNode
}

/**
 * Encabezado único de las pantallas del panel. Antes cada pantalla dibujaba el
 * suyo: Comercio con este estilo, Turnos y Clientes con otro (fondo propio,
 * letra de 9 px) y Configuración con un título suelto. Una sola pieza hace que
 * moverse entre secciones se sienta como el mismo sistema.
 */
export function EncabezadoPagina({ icono: Icono, titulo, descripcion, acciones }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-gradient-to-br from-emerald-50 via-sky-50/60 to-transparent p-4 dark:from-emerald-950/30 dark:via-sky-950/10">
      <div className="flex min-w-0 items-center gap-3">
        <div className="hidden shrink-0 rounded-xl bg-emerald-600 p-2.5 text-white shadow-sm sm:flex">
          <Icono className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          {/* Fraunces (font-display), la misma voz que la landing. Se carga con un
              solo peso (600): font-semibold, no font-bold, o el navegador
              inventa la negrita. */}
          <h1 className="truncate font-display text-2xl font-semibold tracking-tight">{titulo}</h1>
          {descripcion && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">{descripcion}</div>
          )}
        </div>
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  )
}
