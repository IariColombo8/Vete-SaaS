"use client"

import type React from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export interface AccionPendiente {
  titulo: string
  descripcion: React.ReactNode
  confirmar: string
  peligrosa?: boolean
  ejecutar: () => Promise<void>
}

interface Props {
  accion: AccionPendiente | null
  ejecutando: boolean
  onCancelar: () => void
  onConfirmar: () => void
}

/**
 * Confirmación para los cambios que afectan a una veterinaria en uso: pausar,
 * reactivar, cambiar de plan o quitar la prueba. Antes se aplicaban con un
 * solo click: un click de más le cambiaba el plan o le cortaba los turnos
 * online a un cliente real.
 */
export function ConfirmarAccionDialog({ accion, ejecutando, onCancelar, onConfirmar }: Props) {
  return (
    <AlertDialog open={accion !== null} onOpenChange={(open) => { if (!open && !ejecutando) onCancelar() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{accion?.titulo}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">{accion?.descripcion}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={ejecutando}>Cancelar</AlertDialogCancel>
          <Button
            variant={accion?.peligrosa ? "destructive" : "default"}
            onClick={onConfirmar}
            disabled={ejecutando}
          >
            {ejecutando && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
            {accion?.confirmar}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
