import { useCallback, useMemo, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { getTurnosByClienteEmail, updateTurno } from "@/lib/supabase/queries"
import type { Turno } from "@/lib/supabase/queries"
import { getCurrentUser } from "@/lib/supabase/auth"

function getFechaTurno(t: Turno) {
  return t.turno?.fecha ?? t.fecha ?? ""
}

/**
 * Hook para que un cliente autenticado vea y cancele sus turnos.
 * Usa el email del usuario autenticado para buscar turnos (protegido por RLS de Supabase).
 * Opcionalmente acepta un DNI para búsqueda legacy (solo si el usuario está autenticado).
 */
export function useMisTurnosCliente(tenantId: string) {
  const { toast } = useToast()
  const [loading, setLoading]   = useState(false)
  const [turnos, setTurnos]     = useState<Turno[]>([])
  const [error, setError]       = useState<string | null>(null)
  const [emailActual, setEmailActual] = useState("")

  const buscarMisTurnos = useCallback(async () => {
    const user = await getCurrentUser()
    if (!user?.email) {
      setError("Debés iniciar sesión para ver tus turnos.")
      return false
    }
    setLoading(true); setError(null)
    try {
      const turnosData = await getTurnosByClienteEmail(tenantId, user.email)
      setEmailActual(user.email)
      setTurnos(turnosData)
      if (turnosData.length === 0) {
        setError("No se encontraron turnos para tu cuenta.")
        return false
      }
      return true
    } catch (e) {
      console.error(e); setError("No se pudo cargar la información."); return false
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  const refrescar = useCallback(async () => {
    if (!emailActual) return
    try {
      const turnosData = await getTurnosByClienteEmail(tenantId, emailActual)
      setTurnos(turnosData)
    } catch (e) {
      console.error(e)
      toast({ title: "Error", description: "No se pudo actualizar.", variant: "destructive" })
    }
  }, [emailActual, tenantId, toast])

  const cancelarTurno = useCallback(async (turno: Turno) => {
    if (!turno.id) return
    const user = await getCurrentUser()
    if (!user?.email || user.email !== turno.cliente?.email) {
      toast({ title: "Error", description: "Solo podés cancelar tus propios turnos.", variant: "destructive" })
      return
    }
    const fecha = getFechaTurno(turno)
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (turno.estado !== "pendiente" || !fecha || fecha < manana) {
      toast({ title: "No se puede cancelar", description: "Solo turnos pendientes futuros." }); return
    }
    try {
      await updateTurno(tenantId, turno.id, { estado: "cancelado" })
      toast({ title: "Turno cancelado" })
      await refrescar()
    } catch (e) {
      console.error(e)
      toast({ title: "Error", description: "No se pudo cancelar.", variant: "destructive" })
    }
  }, [refrescar, tenantId, toast])

  const turnosOrdenados = useMemo(() =>
    [...turnos].sort((a, b) => {
      const fa = getFechaTurno(a), fb = getFechaTurno(b)
      if (fa !== fb) return fa.localeCompare(fb)
      return (a.turno?.hora ?? "").localeCompare(b.turno?.hora ?? "")
    }), [turnos])

  return {
    loading, error, emailActual, turnos, turnosOrdenados,
    buscarMisTurnos, cancelarTurno, refrescar,
    reset: () => { setEmailActual(""); setTurnos([]); setError(null) },
  }
}
