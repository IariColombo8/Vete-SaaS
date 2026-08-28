"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CampoCategoria } from "@/components/admin/productos/campo-categoria"
import { actualizarCategoriaMasivo } from "@/lib/supabase/productos"
import type { Producto } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  productos: Producto[]
  categoriasExistentes: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onAplicado: () => void
}

/** Cambia el rubro de la selección múltiple del listado, todos de una. */
export function CategoriaMasivaDialog({
  tenantId, productos, categoriasExistentes, open, onOpenChange, onAplicado,
}: Props) {
  const [categoria, setCategoria] = useState("")
  const [guardando, setGuardando] = useState(false)

  const cerrar = (abierto: boolean) => {
    if (!abierto) setCategoria("")
    onOpenChange(abierto)
  }

  const confirmar = async () => {
    if (!categoria.trim()) {
      toast.error("Elegí una categoría")
      return
    }
    setGuardando(true)
    try {
      const actualizados = await actualizarCategoriaMasivo(tenantId, productos, categoria.trim())
      toast.success(`${actualizados} producto${actualizados === 1 ? "" : "s"} actualizado${actualizados === 1 ? "" : "s"}`)
      onAplicado()
      cerrar(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar el rubro")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cambiar rubro</DialogTitle>
          <DialogDescription>
            {productos.length === 1 ? productos[0].nombre : `${productos.length} productos seleccionados`}
          </DialogDescription>
        </DialogHeader>

        <CampoCategoria value={categoria} categoriasExistentes={categoriasExistentes} onChange={setCategoria} />

        <DialogFooter>
          <Button variant="outline" onClick={() => cerrar(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={guardando} className="bg-emerald-600 hover:bg-emerald-700">
            {guardando ? "Aplicando…" : "Aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
