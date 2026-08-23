import { useState, useEffect } from "react"
import { getClienteByEmail, getMascotas } from "@/lib/supabase/queries"
import type { Cliente, Mascota } from "@/lib/supabase/queries"

export function useClienteByEmail(email: string, tenantId: string) {
  const [clienteExistente, setClienteExistente] = useState<Cliente | null>(null)
  const [mascotas, setMascotas] = useState<Mascota[]>([])
  const [mostrarNuevaMascota, setMostrarNuevaMascota] = useState(true)

  useEffect(() => {
    const buscarCliente = async () => {
      if (email && email.includes("@")) {
        try {
          const cliente = await getClienteByEmail(tenantId, email)
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
        }
      }
    }
    const debounce = setTimeout(buscarCliente, 500)
    return () => clearTimeout(debounce)
  }, [email, tenantId])

  return { clienteExistente, mascotas, mostrarNuevaMascota, setMostrarNuevaMascota }
}
