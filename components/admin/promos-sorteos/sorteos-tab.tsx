"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SorteoDialog } from "@/components/admin/promos-sorteos/sorteo-dialog"
import { SorteoDetalle } from "@/components/admin/promos-sorteos/sorteo-detalle"
import { getSorteos, createSorteo, type SorteoInput } from "@/lib/supabase/sorteos"
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
  const [seleccionado, setSeleccionado] = useState<Sorteo | null>(null)

  const cargar = () => {
    setCargando(true)
    getSorteos(tenantId).then(setSorteos).finally(() => setCargando(false))
  }

  useEffect(cargar, [tenantId])

  const crear = async (input: SorteoInput) => {
    try {
      await createSorteo(tenantId, input)
      toast.success("Sorteo creado")
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el sorteo")
    }
  }

  if (seleccionado) {
    return (
      <SorteoDetalle
        tenantId={tenantId}
        sorteo={seleccionado}
        onVolver={() => setSeleccionado(null)}
        onSorteado={() => {
          cargar()
          setSeleccionado(null)
        }}
      />
    )
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">
        <Button onClick={() => setDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
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

      <SorteoDialog tenantId={tenantId} open={dialogOpen} onOpenChange={setDialogOpen} onGuardar={crear} />
    </div>
  )
}
