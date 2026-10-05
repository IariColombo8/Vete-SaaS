import type React from "react"
import { CalendarDays, Hourglass, Stethoscope, Users } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import type { ResumenPlataforma } from "@/lib/superadmin/resumen"

interface Props {
  resumen: ResumenPlataforma
  totalTurnos: number
  cargando: boolean
}

function Indicador({
  icono: Icono, titulo, valor, detalle, tono, cargando,
}: {
  icono: React.ElementType
  titulo: string
  valor: number
  detalle: string
  tono: string
  cargando: boolean
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{titulo}</p>
        <span className={`flex size-9 items-center justify-center rounded-xl ${tono}`}>
          <Icono className="size-4" aria-hidden />
        </span>
      </div>
      {cargando ? (
        <>
          <Skeleton className="mt-3 h-9 w-16" />
          <Skeleton className="mt-2 h-3 w-28" />
        </>
      ) : (
        <>
          <p className="mt-2 text-4xl font-extrabold tabular-nums tracking-tight">{valor}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>
        </>
      )}
    </div>
  )
}

/** Fila de números de la plataforma. Cada uno trae su desglose, no un total suelto. */
export function Indicadores({ resumen, totalTurnos, cargando }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Indicador
        icono={Stethoscope}
        titulo="Veterinarias"
        valor={resumen.veterinarias}
        detalle={`${resumen.activas} activas · ${resumen.pausadas} pausadas`}
        tono="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
        cargando={cargando}
      />
      <Indicador
        icono={Hourglass}
        titulo="En período de prueba"
        valor={resumen.enTrial}
        detalle={resumen.trialVencido > 0 ? `${resumen.trialVencido} con la prueba vencida` : "Ninguna prueba vencida"}
        tono="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        cargando={cargando}
      />
      <Indicador
        icono={Users}
        titulo="Usuarios"
        valor={resumen.usuarios}
        detalle={`${resumen.staff} de equipo · ${resumen.superadmins} superadmin`}
        tono="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
        cargando={cargando}
      />
      <Indicador
        icono={CalendarDays}
        titulo="Turnos totales"
        valor={totalTurnos}
        detalle="Sumando todas las veterinarias"
        tono="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
        cargando={cargando}
      />
    </div>
  )
}
