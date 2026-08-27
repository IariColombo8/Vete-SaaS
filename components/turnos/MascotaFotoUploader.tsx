"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Camera, Loader2 } from "lucide-react"

interface MascotaFotoUploaderProps {
  tenantId: string
  mascotaId: string
  onFotoSubida: (url: string) => void
}

export function MascotaFotoUploader({ tenantId, mascotaId, onFotoSubida }: MascotaFotoUploaderProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [archivoElegido, setArchivoElegido] = useState<File | null>(null)
  const [dni, setDni] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleArchivoElegido = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setArchivoElegido(file)
    setError(null)
    setDialogOpen(true)
  }

  const handleConfirmar = async () => {
    if (!archivoElegido || !dni.trim()) return
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append("tenantId", tenantId)
      form.append("dni", dni.trim())
      form.append("mascotaId", mascotaId)
      form.append("foto", archivoElegido)

      const res = await fetch("/api/mascota-foto", { method: "POST", body: form })
      const json = await res.json()

      if (!res.ok || !json.ok) {
        setError(json.error || "No se pudo subir la foto")
        return
      }

      onFotoSubida(json.fotoUrl)
      toast({ title: "¡Foto actualizada!", description: "El perfil ya se ve con la nueva foto." })
      setDialogOpen(false)
      setArchivoElegido(null)
      setDni("")
    } catch {
      setError("No pudimos subir la foto. Intentá de nuevo.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleArchivoElegido}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="bg-white/20 hover:bg-white/30 text-white border-white/40 backdrop-blur-md"
        onClick={() => fileInputRef.current?.click()}
      >
        <Camera className="mr-1.5 h-4 w-4" />
        Cambiar foto
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!loading) { setDialogOpen(v); if (!v) setArchivoElegido(null) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmá tu DNI</DialogTitle>
            <DialogDescription>
              Para subir la foto necesitamos verificar que la mascota es tuya.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="foto-dni">DNI</Label>
            <Input
              id="foto-dni"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              placeholder="30123456"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button onClick={handleConfirmar} disabled={loading || !dni.trim()}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Subir foto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
