"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ClienteSelector } from "@/components/admin/pos/cliente-selector"
import { registrarCargoManualCtaCte } from "@/lib/supabase/cuentaCorriente"
import type { Cliente } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onGuardado: () => void
}

/**
 * Carga a mano un cobro pendiente de un cliente, sin pasar por una venta del
 * POS (ej: una seña, o una deuda que se sabe pero todavía no se facturó). El
 * cliente puede crearse ahí mismo con solo el nombre — DNI y teléfono se
 * completan después, desde Clientes, cuando se sepan.
 */
export function RegistrarCargoDialog({ tenantId, open, onOpenChange, onGuardado }: Props) {
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [monto, setMonto] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [guardando, setGuardando] = useState(false)

  const resetear = () => {
    setCliente(null)
    setMonto("")
    setDescripcion("")
  }

  const invalido = !cliente || !monto || Number(monto) <= 0

  const guardar = async () => {
    if (invalido || !cliente?.id) return
    setGuardando(true)
    try {
      await registrarCargoManualCtaCte(tenantId, cliente.id, Number(monto), descripcion.trim() || undefined)
      toast.success("Cobro pendiente registrado")
      resetear()
      onOpenChange(false)
      onGuardado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar el cobro")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetear() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar cobro pendiente</DialogTitle>
          <DialogDescription>
            Carga una deuda a mano, sin necesidad de una venta. Si el cliente todavía no está cargado, se puede crear con solo el nombre.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Cliente</Label>
            <ClienteSelector tenantId={tenantId} seleccionado={cliente} onCambiar={setCliente} obligatorio />
          </div>
          <div>
            <Label htmlFor="cargo-monto" className="mb-1 block text-xs text-muted-foreground">Monto</Label>
            <Input
              id="cargo-monto" type="number" min={0} placeholder="Ej: 5000"
              value={monto} onChange={(e) => setMonto(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cargo-descripcion" className="mb-1 block text-xs text-muted-foreground">Descripción (opcional)</Label>
            <Input
              id="cargo-descripcion" placeholder="Ej: Seña turno, fiado alimento…"
              value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={guardando || invalido} onClick={guardar}>
            {guardando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
