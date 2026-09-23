"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

interface ConfirmarDescarteDialogProps {
  open: boolean
  guardando?: boolean
  /** Qué se está editando, para el texto ("el cliente", "la mascota"...). */
  entidad?: string
  onGuardar: () => void
  onDescartar: () => void
  onCancelar: () => void
}

/**
 * Cartel de "hay cambios sin guardar" reutilizable en todo el panel: se
 * dispara desde `useConfirmarCierre` cuando alguien intenta cerrar un
 * diálogo con cambios pendientes.
 */
export function ConfirmarDescarteDialog({
  open, guardando, entidad = "los datos", onGuardar, onDescartar, onCancelar,
}: ConfirmarDescarteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onCancelar() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Guardar los cambios?</AlertDialogTitle>
          <AlertDialogDescription>
            Hay cambios sin guardar en {entidad}. Podés guardarlos ahora, descartarlos, o volver a editar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancelar} disabled={guardando}>
            Seguir editando
          </AlertDialogCancel>
          <Button variant="destructive" onClick={onDescartar} disabled={guardando}>
            Descartar cambios
          </Button>
          <AlertDialogAction onClick={onGuardar} disabled={guardando}>
            {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Guardar cambios
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
