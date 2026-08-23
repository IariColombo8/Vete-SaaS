"use client"

import { Button } from "@/components/ui/button"
import { Ban, Lock, Unlock, ChevronLeft, ChevronRight, Settings } from "lucide-react"
import type { Turno } from "@/lib/supabase/queries"

interface CalendarViewProps {
  currentMonth: Date
  setCurrentMonth: (date: Date) => void
  selectedDate: string
  setSelectedDate: (date: string) => void
  turnos: Turno[]
  blockedDates: string[]
  onToggleBlockDate: (dateStr: string) => void
  onOpenBlockDialog: () => void
}

export function CalendarView({
  currentMonth,
  setCurrentMonth,
  selectedDate,
  setSelectedDate,
  turnos,
  blockedDates,
  onToggleBlockDate,
  onOpenBlockDialog,
}: CalendarViewProps) {
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    return { daysInMonth, startingDayOfWeek, year, month }
  }

  const getTurnosForDate = (dateStr: string) => {
    return turnos.filter((t) => t.turno.fecha === dateStr)
  }

  const isDateBlocked = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00")
    const isSunday = date.getDay() === 0
    return isSunday || blockedDates.includes(dateStr)
  }

  const renderCalendar = () => {
    const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentMonth)
    const days = []
    const monthNames = [
      "Enero",
      "Febrero",
      "Marzo",
      "Abril",
      "Mayo",
      "Junio",
      "Julio",
      "Agosto",
      "Septiembre",
      "Octubre",
      "Noviembre",
      "Diciembre",
    ]

    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="aspect-square" />)
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      const dayTurnos = getTurnosForDate(dateStr).filter((t) => t.estado !== "cancelado")
      const turnosCount = dayTurnos.length
      const isBlocked = isDateBlocked(dateStr)
      const isToday = new Date().toDateString() === new Date(year, month, day).toDateString()
      const isSelected = selectedDate === dateStr

      let ocupacionLevel = "low"
      if (turnosCount >= 10) ocupacionLevel = "high"
      else if (turnosCount >= 6) ocupacionLevel = "medium"

      days.push(
        <div key={day} className="relative group aspect-square">
          <button
            onClick={() => setSelectedDate(dateStr)}
            className={`w-full h-full p-0.5 sm:p-1 border rounded-lg sm:rounded-xl flex flex-col items-center justify-center relative transition-all duration-300 ${
              isBlocked
                ? "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-50"
                : isSelected
                  ? "bg-gradient-to-br from-indigo-500 to-purple-600 border-indigo-400 shadow-lg shadow-indigo-500/50 scale-105"
                  : isToday
                    ? "bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-emerald-400 dark:border-emerald-600 ring-2 ring-emerald-400"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md hover:scale-105"
            }`}
          >
            <span
              className={`text-[10px] sm:text-xs lg:text-sm font-bold ${
                isSelected
                  ? "text-white"
                  : isToday
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-slate-900 dark:text-white"
              }`}
            >
              {day}
            </span>
            {turnosCount > 0 && !isBlocked && (
              <div
                className={`mt-0.5 px-1 sm:px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black ${
                  isSelected
                    ? "bg-white/30 text-white"
                    : ocupacionLevel === "high"
                      ? "bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300"
                      : ocupacionLevel === "medium"
                        ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
                        : "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300"
                }`}
              >
                {turnosCount}
              </div>
            )}
            {isBlocked && <Ban className="absolute top-0.5 right-0.5 h-2 w-2 sm:h-3 sm:w-3 text-slate-400" />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleBlockDate(dateStr)
            }}
            className={`absolute -top-1 -right-1 p-1 sm:p-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 ${
              isBlocked ? "bg-emerald-500 hover:bg-emerald-600" : "bg-rose-500 hover:bg-rose-600"
            }`}
            title={isBlocked ? "Habilitar fecha" : "Bloquear fecha"}
          >
            {isBlocked ? (
              <Unlock className="h-2 w-2 sm:h-3 sm:w-3 text-white" />
            ) : (
              <Lock className="h-2 w-2 sm:h-3 sm:w-3 text-white" />
            )}
          </button>
        </div>,
      )
    }

    return (
      <div className="space-y-2 sm:space-y-3 lg:space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm sm:text-lg lg:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">
            {monthNames[month]} {year}
          </h3>
          <div className="flex gap-1 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-6 w-6 sm:h-8 sm:w-8 lg:h-9 lg:w-9 p-0 rounded-lg sm:rounded-xl border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 bg-transparent"
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
            >
              <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 w-6 sm:h-8 sm:w-8 lg:h-9 lg:w-9 p-0 rounded-lg sm:rounded-xl border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 bg-transparent"
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
            >
              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {["D", "L", "M", "X", "J", "V", "S"].map((day, idx) => (
            <div
              key={idx}
              className="text-center text-[9px] sm:text-[10px] lg:text-xs font-bold text-slate-600 dark:text-slate-400 py-1 sm:py-2"
            >
              {day}
            </div>
          ))}
          {days}
        </div>
        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenBlockDialog}
            className="w-full text-[10px] sm:text-xs h-7 sm:h-8 bg-transparent"
          >
            <Settings className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1" />
            Gestionar Fechas
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3 text-[9px] sm:text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-4 lg:h-4 rounded bg-emerald-100 dark:bg-emerald-900/50 border border-emerald-300" />
            <span className="text-slate-600 dark:text-slate-400 font-medium">1-5</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-4 lg:h-4 rounded bg-amber-100 dark:bg-amber-900/50 border border-amber-300" />
            <span className="text-slate-600 dark:text-slate-400 font-medium">6-9</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-4 lg:h-4 rounded bg-rose-100 dark:bg-rose-900/50 border border-rose-300" />
            <span className="text-slate-600 dark:text-slate-400 font-medium">10+</span>
          </div>
        </div>
      </div>
    )
  }

  return renderCalendar()
}
