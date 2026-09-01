"use client"

import { useState } from "react"
import { CheckCircle2, Download, Loader2, MessageCircle } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { descargarRemitoPDF, linkWhatsApp, type EmisorRemito } from "@/lib/ventas/remito"
import { formatCantidad, formatCurrency } from "@/lib/format"
import type { Venta } from "@/lib/supabase/types"

interface Props {
  venta: Venta | null
  emisor: EmisorRemito
  onCerrar: () => void
}

/**
 * Confirmación de la venta y salida del remito.
 *
 * WhatsApp no recibe archivos por URL, así que el flujo es en dos pasos:
 * primero se descarga el PDF y después se abre el chat con el mensaje ya
 * escrito, donde el usuario adjunta el archivo recién bajado. Mandar el PDF
 * automáticamente requiere la API de WhatsApp Business, con cuenta de Meta,
 * plantillas aprobadas y costo por mensaje.
 */
export function RemitoDialog({ venta, emisor, onCerrar }: Props) {
  const [generando, setGenerando] = useState(false)

  if (!venta) return null

  const descargar = async () => {
    setGenerando(true)
    try {
      await descargarRemitoPDF(venta, emisor)
    } catch {
      toast.error("No se pudo generar el remito")
    } finally {
      setGenerando(false)
    }
  }

  const enviarPorWhatsApp = async () => {
    // La ventana se abre ANTES del await: si se abre después, el navegador ya
    // no la asocia al click del usuario y la bloquea como popup.
    const chat = window.open(linkWhatsApp(venta, emisor), "_blank", "noopener,noreferrer")
    if (!chat) toast.error("El navegador bloqueó la ventana de WhatsApp")

    // El PDF se descarga igual, para tenerlo listo para adjuntar.
    await descargar()
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <DialogTitle className="text-center">Venta registrada</DialogTitle>
          <DialogDescription className="text-center">
            Remito N° {String(venta.numero).padStart(5, "0")} ·{" "}
            {venta.clienteNombre || "Consumidor final"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="max-h-40 space-y-1.5 overflow-y-auto overflow-x-hidden pr-1">
            {(venta.items ?? []).map((item, i) => (
              <div key={item.id ?? i} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  {[item.marca, item.nombre].filter(Boolean).join(" ")}
                  <span className="text-muted-foreground">
                    {" "}
                    ×{formatCantidad(item.cantidad)}
                    {item.unidad === "kg" ? " kg" : ""}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatCurrency(item.subtotal)}</span>
              </div>
            ))}
          </div>

          {venta.descuento > 0 && (
            <div className="flex justify-between border-t pt-1.5 text-muted-foreground">
              <span>Descuento</span>
              <span className="tabular-nums">- {formatCurrency(venta.descuento)}</span>
            </div>
          )}

          <div className="flex justify-between border-t pt-1.5 text-base font-bold">
            <span>Total</span>
            <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatCurrency(venta.total)}
            </span>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={enviarPorWhatsApp}
            disabled={generando}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
          >
            {generando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <MessageCircle className="mr-2 h-4 w-4" />
            )}
            Enviar por WhatsApp
          </Button>
          <Button variant="outline" className="w-full" onClick={descargar} disabled={generando}>
            <Download className="mr-2 h-4 w-4" /> Descargar PDF
          </Button>
          <Button variant="ghost" className="w-full" onClick={onCerrar}>
            Nueva venta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
