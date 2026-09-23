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

interface RestaurarBorradorDialogProps {
  open: boolean
  /** Cuándo se guardó el borrador, para mostrarlo ("hace 5 minutos"). */
  guardadoEn?: number
  onRestaurar: () => void
  onDescartar: () => void
}

function formatearHaceCuanto(timestamp?: number): string {
  if (!timestamp) return ""
  const minutos = Math.round((Date.now() - timestamp) / 60000)
  if (minutos < 1) return "hace un momento"
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  return `hace ${Math.round(horas / 24)} días`
}

/**
 * Al reabrir un formulario que se había quedado a medio llenar (se cerró el
 * navegador, se cortó la luz, se perdió la conexión), ofrece continuar donde
 * quedó en vez de perder lo tipeado.
 */
export function RestaurarBorradorDialog({
  open, guardadoEn, onRestaurar, onDescartar,
}: RestaurarBorradorDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onDescartar() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Tenés un borrador sin terminar</AlertDialogTitle>
          <AlertDialogDescription>
            Guardado {formatearHaceCuanto(guardadoEn)}. ¿Querés seguir donde quedaste o empezar de nuevo?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDescartar}>Empezar de nuevo</AlertDialogCancel>
          <AlertDialogAction onClick={onRestaurar}>Continuar borrador</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
