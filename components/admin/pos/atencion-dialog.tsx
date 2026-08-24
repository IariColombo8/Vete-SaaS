"use client"

import { useEffect, useState } from "react"
import { Loader2, Stethoscope } from "lucide-react"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { getMascotas } from "@/lib/supabase/mascotas"
import type { VinculoAtencion } from "@/lib/ventas/carrito"
import type { Cliente, Mascota } from "@/lib/supabase/types"

interface Props {
  abierto: boolean
  tenantId: string
  /** Cliente ya elegido en el carrito. Sin cliente no hay a quién vincular la historia. */
  cliente: Cliente | null
  onCerrar: () => void
  onConfirmar: (costo: number, motivo: string, vinculo?: VinculoAtencion) => void
}

/**
 * Cobra una atención veterinaria (consulta, curación, lo que sea) con precio
 * libre: no hay tarifa fija en el catálogo porque cada atención vale distinto.
 *
 * Vincular a una mascota es opcional a propósito — el mostrador también cobra
 * atenciones de gente que no está cargada como cliente — pero si hay cliente y
 * se elige mascota, al cobrar se le anota sola una entrada en su historia
 * clínica, sin tener que ir después a cargarla a mano en Libreta Sanitaria.
 */
export function AtencionDialog({ abierto, tenantId, cliente, onCerrar, onConfirmar }: Props) {
  const [costo, setCosto] = useState("")
  const [motivo, setMotivo] = useState("")
  const [mascotas, setMascotas] = useState<Mascota[]>([])
  const [mascotaId, setMascotaId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!abierto) {
      setCosto("")
      setMotivo("")
      setMascotaId(null)
      setMascotas([])
      return
    }
    if (!cliente) return

    setCargando(true)
    getMascotas(tenantId, cliente.id!)
      .then(setMascotas)
      .finally(() => setCargando(false))
  }, [abierto, cliente, tenantId])

  const monto = Number(costo) || 0

  const confirmar = () => {
    if (monto <= 0) return
    const mascota = mascotas.find((m) => m.id === mascotaId)
    const vinculo: VinculoAtencion | undefined =
      cliente && mascota?.id
        ? { clienteId: cliente.id!, mascotaId: mascota.id, mascotaNombre: mascota.nombre }
        : undefined
    onConfirmar(monto, motivo, vinculo)
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4" /> Atención veterinaria
          </DialogTitle>
          <DialogDescription>
            Cargá el motivo y el costo de la atención para cobrarla en esta venta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="atencion-costo">Costo</Label>
            <Input
              id="atencion-costo"
              type="number"
              inputMode="decimal"
              min={0}
              step={100}
              autoFocus
              value={costo}
              placeholder="Ej: 15000"
              onChange={(e) => setCosto(e.target.value)}
              className="h-12 text-lg"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="atencion-motivo">Motivo (opcional)</Label>
            <Input
              id="atencion-motivo"
              value={motivo}
              placeholder="Ej: Consulta, control, curación"
              onChange={(e) => setMotivo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmar()
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Vincular a una mascota (opcional)</Label>
            {!cliente ? (
              <p className="rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground">
                Elegí un cliente en el carrito para poder anotar esta atención en la
                historia clínica de su mascota.
              </p>
            ) : cargando ? (
              <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando mascotas…
              </div>
            ) : mascotas.length === 0 ? (
              <p className="rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground">
                {cliente.nombre} todavía no tiene mascotas cargadas.
              </p>
            ) : (
              <Select
                value={mascotaId ?? "__ninguna"}
                onValueChange={(v) => setMascotaId(v === "__ninguna" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin vincular" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ninguna">Sin vincular</SelectItem>
                  {mascotas.filter((m) => m.id).map((m) => (
                    <SelectItem key={m.id} value={m.id!}>
                      {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={monto <= 0}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
