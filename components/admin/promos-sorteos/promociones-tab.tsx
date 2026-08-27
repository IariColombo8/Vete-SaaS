"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Plus, Trash2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PromocionDialog } from "@/components/admin/promos-sorteos/promocion-dialog"
import {
  getPromociones, createPromocion, updatePromocion, eliminarPromocion, type PromocionInput,
} from "@/lib/supabase/promociones"
import { formatCurrency } from "@/lib/format"
import type { Promocion } from "@/lib/supabase/types"

interface Props {
  tenantId: string
}

export function PromocionesTab({ tenantId }: Props) {
  const [promociones, setPromociones] = useState<Promocion[]>([])
  const [cargando, setCargando] = useState(true)
  const [editando, setEditando] = useState<Promocion | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const cargar = () => {
    setCargando(true)
    getPromociones(tenantId).then(setPromociones).finally(() => setCargando(false))
  }

  useEffect(cargar, [tenantId])

  const abrirNueva = () => {
    setEditando(null)
    setDialogOpen(true)
  }

  const abrirEdicion = (p: Promocion) => {
    setEditando(p)
    setDialogOpen(true)
  }

  const guardar = async (input: PromocionInput) => {
    try {
      if (editando) {
        await updatePromocion(tenantId, editando.id, input)
      } else {
        await createPromocion(tenantId, input)
      }
      toast.success("Promoción guardada")
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la promoción")
    }
  }

  const eliminar = async (p: Promocion) => {
    if (!confirm(`¿Eliminar la promoción "${p.nombre}"?`)) return
    try {
      await eliminarPromocion(tenantId, p.id)
      toast.success("Promoción eliminada")
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar la promoción")
    }
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">
        <Button onClick={abrirNueva} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="mr-2 h-4 w-4" /> Nueva promoción
        </Button>
      </div>

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : promociones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay promociones.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Productos</TableHead>
              <TableHead>Precio final</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {promociones.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.nombre}</TableCell>
                <TableCell className="text-muted-foreground">{p.items.length} productos</TableCell>
                <TableCell className="font-medium text-emerald-600">{formatCurrency(p.precioFinal)}</TableCell>
                <TableCell>
                  <Badge variant={p.activa ? "default" : "secondary"}>{p.activa ? "Activa" : "Inactiva"}</Badge>
                </TableCell>
                <TableCell className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => abrirEdicion(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => eliminar(p)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <PromocionDialog
        tenantId={tenantId}
        promocion={editando}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onGuardar={guardar}
      />
    </div>
  )
}
