"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { uploadFotoTenant } from "@/lib/supabase/storage"
import type { SorteoInput } from "@/lib/supabase/sorteos"

interface Props {
  tenantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onGuardar: (input: SorteoInput) => Promise<void>
}

interface PremioForm {
  nombre: string
  descripcion: string
  fotoFile: File | null
}

const PREMIO_VACIO: PremioForm = { nombre: "", descripcion: "", fotoFile: null }

export function SorteoDialog({ tenantId, open, onOpenChange, onGuardar }: Props) {
  const [nombre, setNombre] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [premios, setPremios] = useState<PremioForm[]>([{ ...PREMIO_VACIO }])
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!open) return
    setNombre("")
    setDescripcion("")
    setFotoFile(null)
    setDesde("")
    setHasta("")
    setPremios([{ ...PREMIO_VACIO }])
  }, [open])

  const agregarPremio = () => setPremios((prev) => [...prev, { ...PREMIO_VACIO }])
  const quitarPremio = (i: number) => setPremios((prev) => prev.filter((_, idx) => idx !== i))
  const cambiarPremio = (i: number, cambios: Partial<PremioForm>) =>
    setPremios((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...cambios } : p)))

  const invalido =
    !nombre.trim() || !desde || !hasta || hasta < desde ||
    premios.length === 0 || premios.some((p) => !p.nombre.trim())

  const guardar = async () => {
    if (invalido) return
    setGuardando(true)
    try {
      const fotoUrl = fotoFile ? await uploadFotoTenant(tenantId, "sorteos", fotoFile) : undefined
      const premiosConFoto = await Promise.all(
        premios.map(async (p, i) => ({
          orden: i + 1,
          nombre: p.nombre.trim(),
          descripcion: p.descripcion.trim() || undefined,
          fotoUrl: p.fotoFile ? await uploadFotoTenant(tenantId, "sorteos/premios", p.fotoFile) : undefined,
        })),
      )
      await onGuardar({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        fotoUrl,
        desde,
        hasta,
        premios: premiosConFoto,
      })
      onOpenChange(false)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo sorteo</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Sorteo Día del Animal" />
          </div>

          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Descripción (opcional)</Label>
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
          </div>

          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Foto (opcional)</Label>
            <Input type="file" accept="image/*" onChange={(e) => setFotoFile(e.target.files?.[0] ?? null)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Premios</Label>
              <Button size="sm" variant="outline" onClick={agregarPremio}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Agregar premio
              </Button>
            </div>
            {premios.map((p, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Premio #{i + 1}</span>
                  {premios.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => quitarPremio(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <Input
                  placeholder="Nombre del premio"
                  value={p.nombre}
                  onChange={(e) => cambiarPremio(i, { nombre: e.target.value })}
                />
                <Textarea
                  placeholder="Descripción (opcional)"
                  rows={2}
                  value={p.descripcion}
                  onChange={(e) => cambiarPremio(i, { descripcion: e.target.value })}
                />
                <Input
                  type="file" accept="image/*"
                  onChange={(e) => cambiarPremio(i, { fotoFile: e.target.files?.[0] ?? null })}
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={guardando || invalido} onClick={guardar}>
            {guardando ? "Guardando…" : "Crear sorteo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
