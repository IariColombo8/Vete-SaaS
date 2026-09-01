"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ArrowLeft, Dices, Pencil, Ban, Download, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  getFotosParticipacion, getParticipantes, rechazarFotoParticipacion, sortear, type FotoParticipacion,
} from "@/lib/supabase/sorteos"
import type { ParticipanteSorteo, Sorteo } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  sorteo: Sorteo
  onVolver: () => void
  onSorteado: () => void
  onEditar: () => void
  onCancelar: () => void
}

export function SorteoDetalle({ tenantId, sorteo, onVolver, onSorteado, onEditar, onCancelar }: Props) {
  const [participantes, setParticipantes] = useState<ParticipanteSorteo[]>([])
  const [fotos, setFotos] = useState<FotoParticipacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [confirmando, setConfirmando] = useState(false)
  const [sorteando, setSorteando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [rechazando, setRechazando] = useState<FotoParticipacion | null>(null)

  const cargar = () => {
    setCargando(true)
    Promise.all([
      getParticipantes(tenantId, sorteo),
      sorteo.mecanicas.foto ? getFotosParticipacion(sorteo.id) : Promise.resolve([]),
    ])
      .then(([p, f]) => { setParticipantes(p); setFotos(f) })
      .finally(() => setCargando(false))
  }

  useEffect(cargar, [tenantId, sorteo])

  const confirmarRechazo = async () => {
    if (!rechazando) return
    try {
      await rechazarFotoParticipacion(rechazando.id)
      toast.success("Imagen rechazada")
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo rechazar la imagen")
    } finally {
      setRechazando(null)
    }
  }

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
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onEditar}>
              <Pencil className="mr-2 h-4 w-4" /> Editar
            </Button>
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setCancelando(true)}>
              <Ban className="mr-2 h-4 w-4" /> Cancelar sorteo
            </Button>
            <Button
              disabled={!puedeSortear || sorteando}
              title={!puedeSortear ? "Se puede sortear cuando termine el rango de fechas" : undefined}
              onClick={() => setConfirmando(true)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Dices className="mr-2 h-4 w-4" /> Sortear
            </Button>
          </div>
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
          <p className="text-sm text-muted-foreground">Todavía no hay participantes para este sorteo.</p>
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

      {sorteo.mecanicas.foto && fotos.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
            Fotos de mascotas ({fotos.length})
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {fotos.map((f) => (
              <div key={f.id} className="group relative overflow-hidden rounded-lg border">
                <button
                  type="button"
                  aria-label="Rechazar imagen"
                  onClick={() => setRechazando(f)}
                  className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <a href={f.fotoUrl} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.fotoUrl} alt={f.clienteNombre} className="aspect-square w-full object-cover" />
                </a>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/60 px-2 py-1">
                  <span className="truncate text-xs text-white">{f.clienteNombre}</span>
                  <a
                    href={f.fotoUrl}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Descargar foto de ${f.clienteNombre}`}
                    className="shrink-0 rounded p-1 text-white hover:bg-white/20"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      <AlertDialog open={cancelando} onOpenChange={setCancelando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar "{sorteo.nombre}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra el sorteo y sus premios. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onCancelar}>
              Cancelar sorteo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!rechazando} onOpenChange={(o) => !o && setRechazando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Rechazar la imagen de {rechazando?.clienteNombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra la participación y la chance que había sumado con esta foto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmarRechazo}>
              Rechazar imagen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
