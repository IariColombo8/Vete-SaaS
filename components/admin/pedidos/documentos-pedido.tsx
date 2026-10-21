"use client"

import { useEffect, useState } from "react"
import { Download, Loader2, MessageCircle, Receipt } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { FacturarButton } from "@/components/admin/pos/facturar-button"
import { getVenta } from "@/lib/supabase/ventas"
import { getComprobantesDeVenta, type Comprobante, type EstadoFacturacion } from "@/lib/supabase/comprobantes"
import { descargarRemitoPDF, linkWhatsApp, type EmisorRemito } from "@/lib/ventas/remito"
import { facturaAutomatica } from "@/lib/pedidos/reglas"
import type { Venta } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  ventaId: string
  emisor: EmisorRemito
  facturacion: EstadoFacturacion | null
  /** Recién cobrado desde el panel: si el medio lo pide, la factura se emite sola. */
  recienCobrado?: boolean
}

/**
 * Remito y factura de la venta de un pedido. Los mismos controles que el
 * mostrador: descargar o mandar por WhatsApp, y facturar (o descargar la
 * factura que ya emitió el servidor si se pagó online).
 */
export function DocumentosPedido({ tenantId, ventaId, emisor, facturacion, recienCobrado = false }: Props) {
  const [venta, setVenta] = useState<Venta | null>(null)
  const [factura, setFactura] = useState<Comprobante | null>(null)
  const [notaCredito, setNotaCredito] = useState<Comprobante | null>(null)
  const [generando, setGenerando] = useState(false)

  useEffect(() => {
    let vigente = true
    Promise.all([getVenta(tenantId, ventaId), getComprobantesDeVenta(tenantId, ventaId)])
      .then(([v, comprobantes]) => {
        if (!vigente) return
        setVenta(v)
        const emitidos = comprobantes.filter((c) => c.estado === "emitido")
        setFactura(emitidos.find((c) => [1, 6, 11].includes(c.tipoCbte)) ?? null)
        setNotaCredito(emitidos.find((c) => [3, 8, 13].includes(c.tipoCbte)) ?? null)
      })
      .catch(() => toast.error("No se pudo cargar la venta del pedido"))
    return () => {
      vigente = false
    }
  }, [tenantId, ventaId])

  if (!venta) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando remito…
      </div>
    )
  }

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

  const whatsapp = async () => {
    // Antes del await: si no, el navegador lo bloquea como popup.
    const chat = window.open(linkWhatsApp(venta, emisor), "_blank", "noopener,noreferrer")
    if (!chat) toast.error("El navegador bloqueó la ventana de WhatsApp")
    await descargar()
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Receipt className="h-3.5 w-3.5" /> Remito N° {String(venta.numero).padStart(5, "0")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={whatsapp} disabled={generando} className="bg-emerald-600 hover:bg-emerald-700">
            {generando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
            WhatsApp
          </Button>
          <Button variant="outline" onClick={descargar} disabled={generando}>
            <Download className="mr-2 h-4 w-4" /> Descargar
          </Button>
        </div>
      </div>

      {facturacion && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Factura electrónica</p>
          <FacturarButton
            key={`${venta.id}-${factura?.id ?? ""}`}
            tenantId={tenantId}
            venta={venta}
            emisor={emisor}
            facturacion={facturacion}
            comprobante={factura}
            notaCredito={notaCredito}
            autoEmitir={recienCobrado && !factura && facturaAutomatica(venta.medioPago)}
          />
        </div>
      )}
    </div>
  )
}
