// Guardar como: components/admin/timeline-view.tsx

"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Clock, PawPrint, AlertCircle, Dog, Cat, Bird } from "lucide-react"
import type { Turno } from "@/lib/supabase/queries"
import { EstadoTurnoBadge } from "@/components/admin/estado-badge"

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
          ? "bg-success-soft/60 border-success/30"
          : turno.estado === "cancelado"
            ? "bg-muted/50 border-input opacity-60"
            : isUrgent
              ? "bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-950/30 dark:to-pink-950/30 border-rose-300 dark:border-rose-700 shadow-lg shadow-rose-500/20"
              : "bg-card border-border"
      }`}
    >
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 sm:w-1.5 ${
          turno.estado === "completado"
            ? "bg-success"
            : turno.estado === "cancelado"
              ? "bg-muted-foreground/50"
              : isUrgent
                ? "bg-gradient-to-b from-rose-500 to-pink-500"
                : "bg-primary"
        }`}
      />

      <div className="p-2 sm:p-3 lg:p-4 pl-3 sm:pl-4 lg:pl-5">
        <div className="flex items-start justify-between gap-2 sm:gap-3 mb-2 sm:mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
              <span className="text-xs sm:text-sm lg:text-base font-black text-foreground truncate">
                {turno.cliente.nombre}
              </span>
              {isUrgent && (
                <Badge className="bg-rose-500 text-white border-0 px-1 sm:px-2 py-0.5 text-[10px] sm:text-[11px] font-bold">
                  <AlertCircle className="h-2 w-2 sm:h-3 sm:w-3 mr-0.5" />
                  PRÓXIMO
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs lg:text-sm text-muted-foreground">
              {(() => {
                const MascotaIcon = getMascotaIcon(turno.mascota?.tipo ?? "")
                return <MascotaIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4" />
              })()}
              <span className="font-semibold truncate">{turno.mascota.nombre}</span>
              <span className="text-xs">({turno.mascota.tipo})</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 sm:gap-2">
            <EstadoTurnoBadge estado={turno.estado} />
            <span className="text-xs font-bold text-primary">
              {getHora(turno) || "—"}
            </span>
          </div>
        </div>

        <Button
          onClick={() => onViewDetails(turno)}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg sm:rounded-xl h-7 sm:h-8 lg:h-9 text-[10px] sm:text-xs lg:text-sm shadow-lg"
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
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
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
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
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
              className="relative flex items-start border-l-2 sm:border-l-4 border-border pl-3 sm:pl-6 pb-2 sm:pb-4 ml-8 sm:ml-12 lg:ml-16"
            >
              <div
                className={`absolute -left-8 sm:-left-12 lg:-left-16 top-0 w-7 sm:w-10 lg:w-14 text-right ${
                  isCurrentHour
                    ? "text-primary font-black"
                    : "text-muted-foreground font-semibold"
                }`}
              >
                <div className="text-xs lg:text-sm">{slot}</div>
              </div>

              <div
                className={`absolute -left-[5px] sm:-left-[9px] lg:-left-[11px] top-0.5 sm:top-1 w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 rounded-full border-2 sm:border-4 ${
                  isCurrentHour
                    ? "bg-primary border-primary/30 shadow-md"
                    : hourTurnos.length > 0
                      ? "bg-success border-primary/30"
                      : "bg-muted border-border"
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
                        ? "border-border bg-muted/50"
                        : "border-input bg-card"
                    }`}
                  >
                    <Clock
                      className={`h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 mx-auto mb-1 sm:mb-2 ${
                        isPast ? "text-muted-foreground/40" : "text-muted-foreground"
                      }`}
                    />
                    <p
                      className={`text-xs font-semibold ${
                        isPast ? "text-muted-foreground" : "text-muted-foreground"
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
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
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