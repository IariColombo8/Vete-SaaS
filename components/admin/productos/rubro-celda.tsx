"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { actualizarCategoriaMasivo } from "@/lib/supabase/productos"
import { CATEGORIAS_FIJAS, ordenarCategorias } from "@/lib/productos/categorias"
import type { Producto } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  producto: Producto
  categoriasExistentes: string[]
  onCambiado: () => void | Promise<void>
  /** Abre el diálogo completo — es donde se escribe una categoría nueva. */
  onAbrirEdicion: (producto: Producto) => void
}

const AGREGAR = "__agregar__"

/**
 * Rubro editable directo desde la tabla: un desplegable en vez de texto
 * fijo, para no tener que abrir el producto solo para recategorizarlo.
 * "+ Agregar categoría" no se resuelve acá — abre el diálogo completo,
 * que es donde ya existe el campo de texto libre para escribir una nueva.
 */
export function RubroCelda({ tenantId, producto, categoriasExistentes, onCambiado, onAbrirEdicion }: Props) {
  const [guardando, setGuardando] = useState(false)

  const opciones = ordenarCategorias(
    Array.from(new Set([...CATEGORIAS_FIJAS, ...categoriasExistentes])),
  )

  const cambiar = async (nuevaCategoria: string) => {
    if (nuevaCategoria === AGREGAR) { onAbrirEdicion(producto); return }
    if (nuevaCategoria === producto.categoria) return

    setGuardando(true)
    try {
      const actualizados = await actualizarCategoriaMasivo(tenantId, [producto], nuevaCategoria)
      if (actualizados === 0) {
        toast.error("No se pudo cambiar el rubro")
        return
      }
      await onCambiado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar el rubro")
    } finally {
      setGuardando(false)
    }
  }

  if (guardando) {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
  }

  return (
    <select
      value={producto.categoria}
      onChange={(e) => cambiar(e.target.value)}
      className="h-7 w-full max-w-[140px] rounded-md border border-transparent bg-transparent text-xs text-muted-foreground outline-none transition-colors hover:border-input hover:bg-muted focus-visible:border-ring"
    >
      <option value="">Sin rubro</option>
      {opciones.map((c) => <option key={c} value={c}>{c}</option>)}
      <option value={AGREGAR}>+ Agregar categoría</option>
    </select>
  )
}
