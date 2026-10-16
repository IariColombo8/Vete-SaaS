"use client"

import { forwardRef, useImperativeHandle, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { createRecordatorioVacuna, getTenantConfig } from "@/lib/supabase/queries"
import { planAllows } from "@/lib/plans"
import { Syringe, Loader2 } from "lucide-react"

interface Props {
  tenantId: string
  clienteId: string
  mascotaId: string
  mascotaNombre: string
  telefono: string
  /** Sin trigger propio: lo abre un menú externo ("Acciones") vía `ref.abrir()`. */
  sinTrigger?: boolean
}

export interface RecordatorioVacunaButtonRef {
  abrir: () => void
}

export const RecordatorioVacunaButton = forwardRef<RecordatorioVacunaButtonRef, Props>(function RecordatorioVacunaButton(
  { tenantId, clienteId, mascotaId, mascotaNombre, telefono, sinTrigger },
  ref,
) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [vacuna, setVacuna] = useState("")
  const [fecha, setFecha] = useState("")

  // En cualquier plan: en Pro le llega un email al cliente; en todos aparece en
  // el Dashboard ("Vacunas por vencer") para avisar a mano con wa.me.
  const [envioAutomatico, setEnvioAutomatico] = useState(false)

  const handleAbrir = async () => {
    setOpen(true)
    const config = await getTenantConfig(tenantId).catch(() => null)
    setEnvioAutomatico(planAllows(config?.plan, "recordatoriosVacunas"))
  }

  const handleGuardar = async () => {
    if (!vacuna.trim() || !fecha) {
      toast({ title: "Completá vacuna y fecha", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      await createRecordatorioVacuna(tenantId, {
        clienteId,
        mascotaId,
        mascotaNombre,
        telefono,
        vacuna: vacuna.trim(),
        fecha,
      })
      toast({
        title: "Recordatorio programado",
        description: envioAutomatico
          ? `Le llega un email al cliente antes del ${fecha} y te aparece en el Dashboard.`
          : "Te va a aparecer en el Dashboard para avisarle al dueño.",
      })
      setOpen(false)
      setVacuna("")
      setFecha("")
    } catch (error) {
      console.error("Error creando recordatorio:", error)
      toast({ title: "Error", description: "No se pudo programar el recordatorio.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  useImperativeHandle(ref, () => ({ abrir: handleAbrir }))

  return (
    <>
      {!sinTrigger && (
        <Button
          size="sm"
          variant="outline"
          className="h-11 w-11 p-0 rounded-xl border-2 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 shrink-0"
          onClick={handleAbrir}
          title="Programar recordatorio de vacuna"
        >
          <Syringe className="h-5 w-5" />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Recordatorio de vacuna</DialogTitle>
            <DialogDescription>
              {envioAutomatico
                ? "Unos días antes de la próxima dosis le llega un email al cliente, y te aparece en el Dashboard para avisarle por WhatsApp."
                : "Unos días antes te aparece en el Dashboard para avisarle al dueño por WhatsApp."}
              {" "}Si la cargás como próxima dosis en la historia, no hace falta: se crea sola.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Vacuna</Label>
              <Input value={vacuna} onChange={(e) => setVacuna(e.target.value)} placeholder="Ej: Antirrábica" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha de la próxima dosis</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-9" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleGuardar} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Programar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
})
