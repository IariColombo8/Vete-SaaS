import { useState, useEffect, useCallback } from "react"
import { getTurnosByDateRange, getDiasBloqueados } from "@/lib/supabase/queries"
import type { Turno } from "@/lib/supabase/queries"
import { useToast } from "@/hooks/use-toast"

/** Calcula rango: primer día del mes actual → último día del mes siguiente */
function getDateRange(): { desde: string; hasta: string } {
  const now = new Date()
  const desde = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0)
  const hasta = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-${String(nextMonth.getDate()).padStart(2, "0")}`

  return { desde, hasta }
}

export function useDisponibilidadTurnos(tenantId: string) {
  const { toast } = useToast()
  const [diasBloqueados, setDiasBloqueados] = useState<string[]>([])
  const [turnosExistentes, setTurnosExistentes] = useState<Turno[]>([])

  const cargar = useCallback(async () => {
    if (!tenantId) return
    try {
      const { desde, hasta } = getDateRange()
      const [dias, turnos] = await Promise.all([
        getDiasBloqueados(tenantId),
        getTurnosByDateRange(tenantId, desde, hasta),
      ])
      setDiasBloqueados(dias.map((d) => d.fecha ?? d.id ?? ""))
      setTurnosExistentes(turnos)
    } catch (error) {
      console.error("Error cargando disponibilidad:", error)
      toast({ title: "Error", description: "No se pudo cargar la disponibilidad", variant: "destructive" })
    }
  }, [tenantId, toast])

  useEffect(() => { cargar() }, [cargar])

  return { diasBloqueados, turnosExistentes, refrescarDisponibilidad: cargar }
}
