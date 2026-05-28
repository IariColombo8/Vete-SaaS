import { useState, useEffect } from "react"
import { getClienteByDNI, getMascotas } from "@/lib/firebase/firestore"

export function useClienteByDNI(dni: string, tenantId: string) {
  const [clienteExistente, setClienteExistente] = useState<any>(null)
  const [mascotas, setMascotas] = useState<any[]>([])
  const [mostrarNuevaMascota, setMostrarNuevaMascota] = useState(true)
  const [loadingCliente, setLoadingCliente] = useState(false)

  useEffect(() => {
    const buscarCliente = async () => {
      if (dni && dni.length >= 7) {
        setLoadingCliente(true)
        try {
          const cliente = await getClienteByDNI(tenantId, dni)
          if (cliente) {
            setClienteExistente(cliente)
            const mascotasCliente = await getMascotas(tenantId, cliente.id!)
            setMascotas(mascotasCliente)
            setMostrarNuevaMascota(mascotasCliente.length === 0)
          } else {
            setClienteExistente(null)
            setMascotas([])
            setMostrarNuevaMascota(true)
          }
        } catch (error) {
          console.error("Error buscando cliente:", error)
        } finally {
          setLoadingCliente(false)
        }
      }
    }
    const debounce = setTimeout(buscarCliente, 500)
    return () => clearTimeout(debounce)
  }, [dni, tenantId])

  return { clienteExistente, mascotas, mostrarNuevaMascota, setMostrarNuevaMascota, loadingCliente }
}
