"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ArrowLeft, Dices } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getParticipantes, sortear } from "@/lib/supabase/sorteos"
import type { ParticipanteSorteo, Sorteo } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  sorteo: Sorteo
  onVolver: () => void
  onSorteado: () => void
}

export function SorteoDetalle({ tenantId, sorteo, onVolver, onSorteado }: Props) {
  const [participantes, setParticipantes] = useState<ParticipanteSorteo[]>([])
  const [cargando, setCargando] = useState(true)
  const [confirmando, setConfirmando] = useState(false)
  const [sorteando, setSorteando] = useState(false)

  useEffect(() => {
    setCargando(true)
    getParticipantes(tenantId, sorteo).then(setParticipantes).finally(() => setCargando(false))
  }, [tenantId, sorteo])

  const puedeSortear = sorteo.estado !== "finalizado" && new Date() >= new Date(`${sorteo.hasta}T00:00:00`)

  const confirmarSorteo = async () => {
    setSorteando(true)
    try {
      await sortear(tenantId, sorteo.id)
      toast.success("Sorteo realizado")
      onSorteado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo sortear")
    } finally {
      setSorteando(false)
      setConfirmando(false)
    }
  }

  return (
    <div className="space-y-4 pt-4">
      <Button variant="ghost" className="-ml-3" onClick={onVolver}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Volver a sorteos
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">{sorteo.nombre}</h2>
          <p className="text-sm text-muted-foreground">{sorteo.desde} al {sorteo.hasta}</p>
        </div>
        {sorteo.estado === "finalizado" ? (
          <span className="text-sm font-medium text-emerald-600">Sorteado</span>
        ) : (
          <Button
            disabled={!puedeSortear || sorteando}
            title={!puedeSortear ? "Se puede sortear cuando termine el rango de fechas" : undefined}
            onClick={() => setConfirmando(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Dices className="mr-2 h-4 w-4" /> Sortear
          </Button>
        )}
      </div>

      {sorteo.ganadores.length > 0 && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <h3 className="text-sm font-semibold">Ganadores</h3>
          {sorteo.premios.map((premio) => {
            const ganador = sorteo.ganadores.find((g) => g.premioId === premio.id)
            return (
              <div key={premio.id} className="flex justify-between text-sm">
                <span>{premio.nombre}</span>
                <span className="font-medium">{ganador ? ganador.clienteNombre : "Sin ganador"}</span>
              </div>
            )
          })}
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
          Participantes ({participantes.length})
        </h3>
        {cargando ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : participantes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ventas con cliente en el rango del sorteo.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Chances</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participantes.map((p) => (
                <TableRow key={p.clienteId}>
                  <TableCell>{p.clienteNombre}</TableCell>
                  <TableCell>{p.chances}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Sortear "{sorteo.nombre}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es definitiva: se van a elegir los ganadores de cada premio y el sorteo pasa a "finalizado".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarSorteo}>Sortear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
