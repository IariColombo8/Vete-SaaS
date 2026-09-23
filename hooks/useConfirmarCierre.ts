import { useCallback, useState } from "react"

interface OpcionesConfirmarCierre {
  /** Si hay cambios sin guardar. Cuando es false, cerrar no pregunta nada. */
  hayCambios: boolean
  /** Debe devolver `true` si guardó con éxito (recién ahí se cierra el diálogo). */
  onGuardar: () => Promise<boolean> | boolean
  /** Se llama al confirmar "Descartar cambios" o cuando no había nada que preguntar. */
  onDescartar: () => void
}

/**
 * Intercepta el cierre de un diálogo con cambios sin guardar: en vez de
 * cerrarlo directo, muestra la confirmación "Guardar / Descartar / Seguir
 * editando". Se usa junto a `<ConfirmarDescarteDialog>`.
 *
 * Uso: en vez de `onOpenChange={(v) => !v && setOpen(false)}`, hacer
 * `onOpenChange={(v) => { if (!v && !solicitarCierre()) return; setOpen(v) }}`.
 */
export function useConfirmarCierre({ hayCambios, onGuardar, onDescartar }: OpcionesConfirmarCierre) {
  const [confirmando, setConfirmando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  /** Devuelve `true` si ya se puede cerrar (no había cambios); `false` si abrió el cartel de confirmación. */
  const solicitarCierre = useCallback((): boolean => {
    if (!hayCambios) {
      onDescartar()
      return true
    }
    setConfirmando(true)
    return false
  }, [hayCambios, onDescartar])

  const confirmarGuardar = useCallback(async () => {
    setGuardando(true)
    try {
      const ok = await onGuardar()
      if (ok) setConfirmando(false)
    } finally {
      setGuardando(false)
    }
  }, [onGuardar])

  const confirmarDescartar = useCallback(() => {
    setConfirmando(false)
    onDescartar()
  }, [onDescartar])

  const cancelarCierre = useCallback(() => setConfirmando(false), [])

  return { confirmando, guardando, solicitarCierre, confirmarGuardar, confirmarDescartar, cancelarCierre }
}
