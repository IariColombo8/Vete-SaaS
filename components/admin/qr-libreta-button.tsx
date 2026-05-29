"use client"

import { useState } from "react"
import QRCode from "qrcode"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { generarLibretaPublica, getTenantConfig } from "@/lib/firebase/firestore"
import { planAllows } from "@/lib/plans"
import { QrCode, Loader2, Download, ExternalLink } from "lucide-react"

interface Props {
  tenantId: string
  clienteId: string
  mascotaId: string
  vetNombre?: string
}

export function QrLibretaButton({ tenantId, clienteId, mascotaId, vetNombre }: Props) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState("")
  const [publicUrl, setPublicUrl] = useState("")

  const handleGenerar = async () => {
    setLoading(true)
    try {
      const config = await getTenantConfig(tenantId)
      if (!planAllows(config?.plan, "qrMascota")) {
        toast({
          title: "Función del plan Pro",
          description: "El QR público por mascota está disponible en el plan Pro.",
          variant: "destructive",
        })
        return
      }

      const token = await generarLibretaPublica(tenantId, clienteId, mascotaId, vetNombre || config?.nombre)
      const base = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin
      const url = `${base}/${tenantId}/libreta/${token}`
      const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2 })
      setPublicUrl(url)
      setQrDataUrl(dataUrl)
      setOpen(true)
    } catch (error) {
      console.error("Error generando QR:", error)
      toast({ title: "Error", description: "No se pudo generar el QR.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-11 w-11 p-0 rounded-xl border-2 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 shrink-0"
        onClick={handleGenerar}
        disabled={loading}
        title="Generar QR de la libreta pública"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <QrCode className="h-5 w-5" />}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>QR de la libreta</DialogTitle>
            <DialogDescription>
              Escaneá o compartí este código para ver la libreta pública de la mascota.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            {qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="QR de la libreta" className="rounded-lg border" width={240} height={240} />
            )}
            <div className="flex gap-2 w-full">
              <a href={qrDataUrl} download={`qr-libreta.png`} className="flex-1">
                <Button variant="outline" className="w-full" size="sm">
                  <Download className="h-4 w-4 mr-1.5" /> Descargar
                </Button>
              </a>
              <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button variant="outline" className="w-full" size="sm">
                  <ExternalLink className="h-4 w-4 mr-1.5" /> Abrir
                </Button>
              </a>
            </div>
            <p className="text-[10px] text-muted-foreground break-all text-center">{publicUrl}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
