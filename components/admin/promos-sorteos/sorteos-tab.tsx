"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SorteoDialog } from "@/components/admin/promos-sorteos/sorteo-dialog"
import { SorteoDetalle } from "@/components/admin/promos-sorteos/sorteo-detalle"
import { getSorteos, createSorteo, updateSorteo, cancelarSorteo, type SorteoInput } from "@/lib/supabase/sorteos"
import type { Sorteo, SorteoEstado } from "@/lib/supabase/types"

interface Props {
  tenantId: string
}

const ETIQUETA_ESTADO: Record<SorteoEstado, string> = {
  borrador: "Borrador", activo: "Activo", finalizado: "Finalizado",
}

export function SorteosTab({ tenantId }: Props) {
  const [sorteos, setSorteos] = useState<Sorteo[]>([])
  const [cargando, setCargando] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editando, setEditando] = useState<Sorteo | null>(null)
  const [seleccionado, setSeleccionado] = useState<Sorteo | null>(null)

  const cargar = () => {
    setCargando(true)
    getSorteos(tenantId).then(setSorteos).finally(() => setCargando(false))
  }

  useEffect(cargar, [tenantId])

  const abrirNuevo = () => {
    setEditando(null)
    setDialogOpen(true)
  }

  const abrirEdicion = (sorteo: Sorteo) => {
    setEditando(sorteo)
    setDialogOpen(true)
  }

  const guardar = async (input: SorteoInput) => {
    try {
      if (editando) {
        await updateSorteo(tenantId, editando.id, input)
        toast.success("Sorteo actualizado")
      } else {
        await createSorteo(tenantId, input)
        toast.success("Sorteo creado")
      }
      cargar()
      setSeleccionado(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el sorteo")
    }
  }

  const cancelar = async (sorteo: Sorteo) => {
    try {
      await cancelarSorteo(tenantId, sorteo.id)
      toast.success("Sorteo cancelado")
      cargar()
      setSeleccionado(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cancelar el sorteo")
    }
  }

  if (seleccionado) {
    return (
      <>
        <SorteoDetalle
          tenantId={tenantId}
          sorteo={seleccionado}
          onVolver={() => setSeleccionado(null)}
          onSorteado={() => {
            cargar()
            setSeleccionado(null)
          }}
          onEditar={() => abrirEdicion(seleccionado)}
          onCancelar={() => cancelar(seleccionado)}
        />
        <SorteoDialog tenantId={tenantId} sorteo={editando} open={dialogOpen} onOpenChange={setDialogOpen} onGuardar={guardar} />
      </>
    )
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">
        <Button onClick={abrirNuevo} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="mr-2 h-4 w-4" /> Nuevo sorteo
        </Button>
      </div>

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : sorteos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay sorteos.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Fechas</TableHead>
              <TableHead>Premios</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorteos.map((s) => (
              <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSeleccionado(s)}>
                <TableCell>{s.nombre}</TableCell>
                <TableCell className="text-muted-foreground">{s.desde} al {s.hasta}</TableCell>
                <TableCell className="text-muted-foreground">{s.premios.length}</TableCell>
                <TableCell>
                  <Badge variant={s.estado === "finalizado" ? "secondary" : "default"}>
                    {ETIQUETA_ESTADO[s.estado]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <SorteoDialog tenantId={tenantId} sorteo={editando} open={dialogOpen} onOpenChange={setDialogOpen} onGuardar={guardar} />
    </div>
  )
}
