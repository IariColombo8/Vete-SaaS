import { useState, useEffect } from "react"
import {
  getTurnos, updateTurno, deleteTurno, getMascotas,
  getDiasBloqueados, bloquearDia, desbloquearDia,
} from "@/lib/firebase/firestore"
import type { Turno, Mascota } from "@/lib/firebase/firestore"
import { useToast } from "@/hooks/use-toast"

export function useTurnosManagement(tenantId: string) {
  const { toast } = useToast()
  const [turnos, setTurnos]                 = useState<Turno[]>([])
  const [loading, setLoading]               = useState(true)
  const [selectedTurno, setSelectedTurno]   = useState<Turno | null>(null)
  const [mascotaDetails, setMascotaDetails] = useState<Mascota | null>(null)
  const [loadingMascota, setLoadingMascota] = useState(false)
  const [blockedDates, setBlockedDates]     = useState<string[]>([])
  const [selectedDate, setSelectedDate]     = useState<string>(new Date().toISOString().split("T")[0])

  const fetchTurnos = async () => {
    try {
      setTurnos(await getTurnos(tenantId))
    } catch (error) {
      console.error("Error fetching turnos:", error)
      toast({ title: "Error", description: "No se pudieron cargar los turnos", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const fetchBlockedDates = async () => {
    try {
      const dias = await getDiasBloqueados(tenantId)
      setBlockedDates(dias.map((d: any) => d.fecha ?? d.id))
    } catch (error) {
      console.error("Error fetching blocked dates:", error)
    }
  }

  const fetchMascotaDetails = async (clienteId: string, mascotaId: string) => {
    if (!mascotaId || !clienteId) return null
    setLoadingMascota(true)
    try {
      const mascotas = await getMascotas(tenantId, clienteId)
      const mascota = mascotas.find((m) => m.id === mascotaId)
      setMascotaDetails(mascota || null)
      return mascota || null
    } catch (error) {
      console.error("Error fetching mascota details:", error)
      return null
    } finally {
      setLoadingMascota(false)
    }
  }

  useEffect(() => { fetchTurnos(); fetchBlockedDates() }, [tenantId])

  const handleToggleBlockDate = async (dateStr: string) => {
    try {
      const isBlocked = blockedDates.includes(dateStr)
      if (isBlocked) {
        await desbloquearDia(tenantId, dateStr)
        setBlockedDates(prev => prev.filter(d => d !== dateStr))
        toast({ title: "Fecha habilitada", description: `La fecha ${dateStr} fue habilitada` })
      } else {
        await bloquearDia(tenantId, dateStr)
        setBlockedDates(prev => [...prev, dateStr])
        toast({ title: "Fecha bloqueada", description: `La fecha ${dateStr} fue bloqueada` })
      }
    } catch (error) {
      console.error("Error toggling block date:", error)
      toast({ title: "Error", description: "No se pudo actualizar el estado de la fecha", variant: "destructive" })
    }
  }

  const handleToggleSingleDate = async (fecha: string, action: "block" | "unblock", onSuccess: () => void) => {
    if (!fecha) { toast({ title: "Error", description: "Seleccioná una fecha", variant: "destructive" }); return }
    try {
      if (action === "block") {
        await bloquearDia(tenantId, fecha)
        setBlockedDates(prev => [...new Set([...prev, fecha])])
        toast({ title: "Fecha bloqueada", description: `Se bloqueó ${fecha}` })
      } else {
        await desbloquearDia(tenantId, fecha)
        setBlockedDates(prev => prev.filter(d => d !== fecha))
        toast({ title: "Fecha habilitada", description: `Se habilitó ${fecha}` })
      }
      onSuccess()
    } catch (error) {
      console.error("Error toggling single date:", error)
      toast({ title: "Error", description: "No se pudo actualizar la fecha", variant: "destructive" })
    }
  }

  const handleToggleDateRange = async (start: string, end: string, action: "block" | "unblock", onSuccess: () => void) => {
    if (!start || !end) { toast({ title: "Error", description: "Seleccioná ambas fechas", variant: "destructive" }); return }
    const startDate = new Date(start + "T00:00:00")
    const endDate   = new Date(end   + "T00:00:00")
    if (startDate > endDate) { toast({ title: "Error", description: "La fecha de inicio debe ser anterior a la de fin", variant: "destructive" }); return }
    const dates: string[] = []
    const cur = new Date(startDate)
    while (cur <= endDate) { dates.push(cur.toISOString().split("T")[0]); cur.setDate(cur.getDate() + 1) }
    try {
      if (action === "block") {
        await Promise.all(dates.map(f => bloquearDia(tenantId, f)))
        setBlockedDates(prev => [...new Set([...prev, ...dates])])
        toast({ title: "Rango bloqueado", description: `Se bloquearon ${dates.length} fechas` })
      } else {
        await Promise.all(dates.map(f => desbloquearDia(tenantId, f)))
        setBlockedDates(prev => prev.filter(d => !dates.includes(d)))
        toast({ title: "Rango habilitado", description: `Se habilitaron ${dates.length} fechas` })
      }
      onSuccess()
    } catch (error) {
      console.error("Error toggling date range:", error)
      toast({ title: "Error", description: "No se pudo actualizar el rango", variant: "destructive" })
    }
  }

  const handleMarkCompleted = async (turnoId: string, onSuccess: () => void) => {
    try {
      await updateTurno(tenantId, turnoId, { estado: "completado" })
      toast({ title: "Turno completado" })
      await fetchTurnos(); onSuccess()
    } catch (error) {
      console.error("Error updating turno:", error)
      toast({ title: "Error", description: "No se pudo actualizar el turno", variant: "destructive" })
    }
  }

  const handleCancel = async (turnoId: string, onSuccess: () => void) => {
    try {
      await updateTurno(tenantId, turnoId, { estado: "cancelado" })
      toast({ title: "Turno cancelado" })
      await fetchTurnos(); onSuccess()
    } catch (error) {
      console.error("Error canceling turno:", error)
      toast({ title: "Error", description: "No se pudo cancelar el turno", variant: "destructive" })
    }
  }

  const handleDelete = async (turnoId: string, onSuccess: () => void) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este turno?")) return
    try {
      await deleteTurno(tenantId, turnoId)
      toast({ title: "Turno eliminado" })
      await fetchTurnos(); onSuccess()
    } catch (error) {
      console.error("Error deleting turno:", error)
      toast({ title: "Error", description: "No se pudo eliminar el turno", variant: "destructive" })
    }
  }

  const handleSaveEdit = async (turnoId: string, editData: { fecha: string; hora: string }, turno: Turno, onSuccess: () => void) => {
    try {
      await updateTurno(tenantId, turnoId, { turno: { ...turno.turno, fecha: editData.fecha, hora: editData.hora } })
      toast({ title: "Turno actualizado" })
      await fetchTurnos(); onSuccess()
    } catch (error) {
      console.error("Error updating turno:", error)
      toast({ title: "Error", description: "No se pudo actualizar el turno", variant: "destructive" })
    }
  }

  return {
    turnos, loading, selectedTurno, setSelectedTurno,
    mascotaDetails, setMascotaDetails, loadingMascota,
    blockedDates, selectedDate, setSelectedDate,
    fetchMascotaDetails, fetchTurnos,
    handleToggleBlockDate, handleToggleSingleDate,
    handleToggleDateRange, handleMarkCompleted,
    handleCancel, handleDelete, handleSaveEdit,
  }
}
