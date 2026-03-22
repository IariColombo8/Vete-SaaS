import { useState, useEffect } from "react"
import { getTurnos, getDiasBloqueados } from "@/lib/firebase/firestore"
import { DEFAULT_TENANT_ID } from "@/lib/config"
import { useToast } from "@/hooks/use-toast"

export function useDisponibilidadTurnos(tenantId = DEFAULT_TENANT_ID) {
  const { toast } = useToast()
  const [diasBloqueados, setDiasBloqueados] = useState<string[]>([])
  const [turnosExistentes, setTurnosExistentes] = useState<any[]>([])

  useEffect(() => {
    const cargar = async () => {
      try {
        const [dias, turnos] = await Promise.all([
          getDiasBloqueados(tenantId),
          getTurnos(tenantId),
        ])
        setDiasBloqueados(dias.map((d: any) => d.fecha ?? d.id))
        setTurnosExistentes(turnos)
      } catch (error) {
        console.error("Error cargando disponibilidad:", error)
        toast({ title: "Error", description: "No se pudo cargar la disponibilidad", variant: "destructive" })
      }
    }
    cargar()
  }, [tenantId, toast])

  return { diasBloqueados, turnosExistentes }
}
