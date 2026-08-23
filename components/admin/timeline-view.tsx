// Guardar como: components/admin/timeline-view.tsx

"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Clock, PawPrint, AlertCircle, CheckCircle2, XCircle, Dog, Cat, Bird } from "lucide-react"
import type { Turno } from "@/lib/supabase/queries"

function getMascotaIcon(tipo: string) {
  const t = tipo?.toLowerCase() || ""
  if (t.includes("perro") || t.includes("dog")) return Dog
  if (t.includes("gato") || t.includes("cat")) return Cat
  if (t.includes("ave") || t.includes("bird") || t.includes("pájaro")) return Bird
  return PawPrint
}

interface TimelineViewProps {
  turnos: Turno[]
  selectedDate: string
  onViewDetails: (turno: Turno) => void
  mode?: "date" | "full"
}

export function TimelineView({
  turnos,
  selectedDate,
  onViewDetails,
  mode = "date",
}: TimelineViewProps) {
  const startHour = 8
  const endHour = 20

  const getTimeSlots = () => {
    const slots = []
    for (let hour = startHour; hour <= endHour; hour++) {
      slots.push(`${String(hour).padStart(2, "0")}:00`)
    }
    return slots
  }

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case "pendiente":
        return (
          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-300 border-0 text-[9px] sm:text-[10px]">
            <Clock className="h-2 w-2 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
            Pendiente
          </Badge>
        )
      case "completado":
        return (
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 border-0 text-[9px] sm:text-[10px]">
            <CheckCircle2 className="h-2 w-2 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
            Completado
          </Badge>
        )
      case "cancelado":
        return (
          <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-950/50 dark:text-rose-400 border-0 text-[9px] sm:text-[10px]">
            <XCircle className="h-2 w-2 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
            Cancelado
          </Badge>
        )
      default:
        return <Badge variant="outline">{estado}</Badge>
    }
  }

  const timeSlots = getTimeSlots()
  const getFecha = (t: Turno) => t.turno?.fecha ?? t.fecha ?? ""
  const getHora = (t: Turno) => t.turno?.hora ?? t.hora ?? ""
  const selectedDateTurnos = turnos.filter((t) => getFecha(t) === selectedDate)
  const canceladosDelDia = selectedDateTurnos.filter((t) => t.estado === "cancelado")
  const activosDelDia = selectedDateTurnos.filter((t) => t.estado !== "cancelado")
  const now = new Date()
  const currentHour = now.getHours()
  const isToday = selectedDate === now.toISOString().split("T")[0]

  const renderTurnoCard = (turno: Turno, isUrgent: boolean) => (
    <div
      key={turno.id}
      className={`group relative overflow-hidden rounded-lg sm:rounded-xl lg:rounded-2xl border sm:border-2 transition-all duration-300 hover:scale-[1.01] sm:hover:scale-[1.02] hover:shadow-lg sm:hover:shadow-xl ${
        turno.estado === "completado"
          ? "bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border-emerald-200 dark:border-emerald-800"
          : turno.estado === "cancelado"
            ? "bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/30 dark:to-slate-800/30 border-slate-300 dark:border-slate-700 opacity-60"
            : isUrgent
              ? "bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-950/30 dark:to-pink-950/30 border-rose-300 dark:border-rose-700 shadow-lg shadow-rose-500/20"
              : "bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800/50 border-slate-200 dark:border-slate-700"
      }`}
    >
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 sm:w-1.5 ${
          turno.estado === "completado"
            ? "bg-gradient-to-b from-emerald-500 to-teal-500"
            : turno.estado === "cancelado"
              ? "bg-gradient-to-b from-slate-400 to-slate-500"
              : isUrgent
                ? "bg-gradient-to-b from-rose-500 to-pink-500"
                : "bg-gradient-to-b from-indigo-500 to-purple-500"
        }`}
      />

      <div className="p-2 sm:p-3 lg:p-4 pl-3 sm:pl-4 lg:pl-5">
        <div className="flex items-start justify-between gap-2 sm:gap-3 mb-2 sm:mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
              <span className="text-xs sm:text-sm lg:text-base font-black text-slate-900 dark:text-white truncate">
                {turno.cliente.nombre}
              </span>
              {isUrgent && (
                <Badge className="bg-rose-500 text-white border-0 px-1 sm:px-2 py-0.5 text-[8px] sm:text-[9px] font-bold">
                  <AlertCircle className="h-2 w-2 sm:h-3 sm:w-3 mr-0.5" />
                  PRÓXIMO
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs lg:text-sm text-slate-600 dark:text-slate-400">
              {(() => {
                const MascotaIcon = getMascotaIcon(turno.mascota?.tipo ?? "")
                return <MascotaIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4" />
              })()}
              <span className="font-semibold truncate">{turno.mascota.nombre}</span>
              <span className="text-[9px] sm:text-[10px] lg:text-xs">({turno.mascota.tipo})</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 sm:gap-2">
            {getEstadoBadge(turno.estado)}
            <span className="text-[9px] sm:text-[10px] lg:text-xs font-bold text-indigo-600 dark:text-indigo-400">
              {getHora(turno) || "—"}
            </span>
          </div>
        </div>

        <Button
          onClick={() => onViewDetails(turno)}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-lg sm:rounded-xl h-7 sm:h-8 lg:h-9 text-[10px] sm:text-xs lg:text-sm shadow-lg"
        >
          Ver Detalles
        </Button>
      </div>
    </div>
  )

  if (mode === "full") {
    const grouped = new Map<string, Turno[]>()
    const sorted = [...turnos].sort((a, b) => {
      const fa = getFecha(a)
      const fb = getFecha(b)
      if (fa !== fb) return fb.localeCompare(fa)
      return (getHora(b) || "").localeCompare(getHora(a) || "")
    })
    sorted.forEach((t) => {
      const f = getFecha(t)
      if (!f) return
      if (!grouped.has(f)) grouped.set(f, [])
      grouped.get(f)!.push(t)
    })
    return (
      <div className="space-y-4">
        {Array.from(grouped.entries()).map(([fechaStr, list]) => {
          const fechaLabel = fechaStr
            ? new Date(fechaStr + "T00:00:00").toLocaleDateString("es-AR", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "—"
          const activos = list.filter((t) => t.estado !== "cancelado")
          const cancelados = list.filter((t) => t.estado === "cancelado")
          return (
            <div key={fechaStr} className="space-y-2">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                  {fechaLabel}
                </p>
              </div>
              <div className="space-y-2 sm:space-y-3">
                {activos.map((turno) => {
                  const fecha = getFecha(turno)
                  const horaStr = getHora(turno)
                  const isTodayCard = fecha === now.toISOString().split("T")[0]
                  const turnoHour = Number.parseInt((horaStr || "0").split(":")[0], 10)
                  const isUrgent = turno.estado === "pendiente" && isTodayCard && turnoHour <= now.getHours() + 1
                  return renderTurnoCard(turno, isUrgent)
                })}
                {cancelados.length > 0 && (
                  <div className="pt-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                      Cancelados
                    </p>
                    <div className="space-y-2 sm:space-y-3">
                      {cancelados.map((turno) => renderTurnoCard(turno, false))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-0">
        {timeSlots.map((slot) => {
          const hourTurnos = activosDelDia.filter((t) =>
            (t.turno?.hora ?? t.hora ?? "").startsWith(slot.split(":")[0])
          )
          const hour = Number.parseInt(slot.split(":")[0])
          const isPast = isToday && hour < currentHour
          const isCurrentHour = isToday && hour === currentHour

          return (
            <div
              key={slot}
              className="relative flex items-start border-l-2 sm:border-l-4 border-slate-200 dark:border-slate-800 pl-3 sm:pl-6 pb-2 sm:pb-4 ml-8 sm:ml-12 lg:ml-16"
            >
              <div
                className={`absolute -left-8 sm:-left-12 lg:-left-16 top-0 w-7 sm:w-10 lg:w-14 text-right ${
                  isCurrentHour
                    ? "text-indigo-600 dark:text-indigo-400 font-black"
                    : "text-slate-600 dark:text-slate-400 font-semibold"
                }`}
              >
                <div className="text-[9px] sm:text-xs lg:text-sm">{slot}</div>
              </div>

              <div
                className={`absolute -left-[5px] sm:-left-[9px] lg:-left-[11px] top-0.5 sm:top-1 w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 rounded-full border-2 sm:border-4 ${
                  isCurrentHour
                    ? "bg-indigo-500 border-indigo-200 dark:border-indigo-800 shadow-lg shadow-indigo-500/50"
                    : hourTurnos.length > 0
                      ? "bg-emerald-500 border-emerald-200 dark:border-emerald-800"
                      : "bg-slate-200 dark:bg-slate-700 border-slate-100 dark:border-slate-800"
                }`}
              />

              <div className="flex-1 space-y-2 sm:space-y-3">
                {hourTurnos.length > 0 ? (
                  hourTurnos.map((turno) => {
                    const isUrgent = turno.estado === "pendiente" && isToday && hour <= currentHour + 1
                    return renderTurnoCard(turno, isUrgent)
                  })
                ) : (
                  <div
                    className={`rounded-lg sm:rounded-xl lg:rounded-2xl border sm:border-2 border-dashed p-2 sm:p-3 lg:p-4 text-center ${
                      isPast
                        ? "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30"
                        : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/50"
                    }`}
                  >
                    <Clock
                      className={`h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 mx-auto mb-1 sm:mb-2 ${
                        isPast ? "text-slate-300 dark:text-slate-700" : "text-slate-400 dark:text-slate-600"
                      }`}
                    />
                    <p
                      className={`text-[9px] sm:text-[10px] lg:text-xs font-semibold ${
                        isPast ? "text-slate-400 dark:text-slate-600" : "text-slate-500 dark:text-slate-500"
                      }`}
                    >
                      {isPast ? "Pasado" : "Disponible"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      {canceladosDelDia.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Cancelados
            </p>
          </div>
          <div className="mt-2 space-y-2 sm:space-y-3">
            {canceladosDelDia.map((turno) => renderTurnoCard(turno, false))}
          </div>
        </div>
      )}
    </div>
  )
}