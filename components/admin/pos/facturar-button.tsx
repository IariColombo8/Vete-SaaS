"use client"

import { useState } from "react"
import { Download, FileText, Loader2, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { Venta } from "@/lib/supabase/types"
import type { Comprobante, EstadoFacturacion } from "@/lib/supabase/comprobantes"
import { getComprobante } from "@/lib/supabase/comprobantes"
import type { EmisorRemito } from "@/lib/ventas/remito"
import { descargarFacturaPDF, emisorFiscalDesdeEstado } from "@/lib/facturacion/factura-pdf"
import { esNotaCredito, letraDeTipo, numeroComprobante } from "@/lib/facturacion/comprobante"
import { emitirFactura, emitirNotaCredito } from "./use-facturacion"

interface Props {
  tenantId: string
  venta: Venta
  emisor: EmisorRemito
  /** Estado de la integración (cargado una vez por el padre). `null` = no configurada. */
  facturacion: EstadoFacturacion | null
  /** Factura ya emitida de esta venta, si el padre la tiene. */
  comprobante?: Comprobante | null
  /** Nota de crédito ya emitida, si la hay. */
  notaCredito?: Comprobante | null
  /** Compacto para la fila del historial; normal para el diálogo del remito. */
  variante?: "fila" | "bloque"
}

/**
 * Control de facturación de una venta: "Facturar" si no tiene factura,
 * "Descargar factura" si la tiene, y "Nota de crédito" cuando la venta se
 * anuló después de facturada. Se oculta si la factura electrónica no está
 * configurada, así el mostrador no muestra un botón que va a fallar.
 */
export function FacturarButton({ tenantId, venta, emisor, facturacion, comprobante, notaCredito, variante = "bloque" }: Props) {
  const [factura, setFactura] = useState<Comprobante | null>(comprobante ?? null)
  const [nc, setNc] = useState<Comprobante | null>(notaCredito ?? null)
  const [ocupado, setOcupado] = useState<"emitir" | "descargar" | "nc" | null>(null)

  if (!facturacion?.configurado) return null
  const fiscal = emisorFiscalDesdeEstado(facturacion)
  const compacto = variante === "fila"

  async function facturar() {
    if (!facturacion?.listo) {
      toast.error("Falta cargar el certificado de ARCA en Configuración → Integraciones")
      return
    }
    setOcupado("emitir")
    try {
      const r = await emitirFactura(tenantId, venta.id)
      const c = await getComprobante(tenantId, r.comprobanteId)
      setFactura(c)
      toast.success(`Factura ${letraDeTipo(r.tipoCbte)} ${numeroComprobante(r.puntoVenta, r.numero ?? 0)} emitida`)
      if (r.observaciones.length) {
        toast.message("ARCA agregó observaciones", { description: r.observaciones.map((o) => o.msg).join(" · ") })
      }
      if (c && fiscal) await descargarFacturaPDF(venta, emisor, c, fiscal)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo emitir la factura", { duration: 10000 })
    } finally {
      setOcupado(null)
    }
  }

  async function descargar(c: Comprobante) {
    if (!fiscal) return
    setOcupado("descargar")
    try {
      await descargarFacturaPDF(venta, emisor, c, fiscal)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF")
    } finally {
      setOcupado(null)
    }
  }

  async function notaDeCredito() {
    if (!factura) return
    setOcupado("nc")
    try {
      const r = await emitirNotaCredito(tenantId, factura.id)
      const c = await getComprobante(tenantId, r.comprobanteId)
      setNc(c)
      toast.success(`Nota de crédito ${letraDeTipo(r.tipoCbte)} ${numeroComprobante(r.puntoVenta, r.numero ?? 0)} emitida`)
      if (c && fiscal) await descargarFacturaPDF(venta, emisor, c, fiscal)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo emitir la nota de crédito", { duration: 10000 })
    } finally {
      setOcupado(null)
    }
  }

  const size = compacto ? "sm" : "default"
  const ancho = compacto ? "" : "w-full"

  if (!factura) {
    if (venta.estado === "anulada" || venta.esPagoCtaCte) return null
    return (
      <Button
        size={size}
        variant={compacto ? "ghost" : "outline"}
        className={`${ancho} ${compacto ? "h-8 px-2 text-violet-700 hover:text-violet-800 dark:text-violet-300" : ""}`}
        onClick={facturar}
        disabled={ocupado !== null}
        title={facturacion.ambiente === "homologacion" ? "Ambiente de homologación: sin valor fiscal" : "Emitir factura electrónica"}
      >
        {ocupado === "emitir" ? <Loader2 className={`h-4 w-4 animate-spin ${compacto ? "" : "mr-2"}`} /> : <FileText className={`h-4 w-4 ${compacto ? "" : "mr-2"}`} />}
        {!compacto && "Facturar"}
      </Button>
    )
  }

  const etiqueta = `${esNotaCredito(factura.tipoCbte) ? "NC" : "Factura"} ${letraDeTipo(factura.tipoCbte)} ${numeroComprobante(factura.puntoVenta, factura.numero ?? 0)}`

  return (
    <div className={compacto ? "flex items-center gap-1" : "space-y-2"}>
      {!compacto && (
        <div className="flex items-center justify-between rounded-lg border bg-violet-50/60 px-3 py-2 text-sm dark:bg-violet-950/20">
          <span className="font-medium">{etiqueta}</span>
          {factura.ambiente === "homologacion" && <Badge variant="outline">Prueba</Badge>}
        </div>
      )}
      <Button
        size={size}
        variant={compacto ? "ghost" : "outline"}
        className={`${ancho} ${compacto ? "h-8 px-2 text-violet-700 hover:text-violet-800 dark:text-violet-300" : ""}`}
        onClick={() => descargar(factura)}
        disabled={ocupado !== null}
        title={`Descargar ${etiqueta}`}
      >
        {ocupado === "descargar" ? <Loader2 className={`h-4 w-4 animate-spin ${compacto ? "" : "mr-2"}`} /> : <Download className={`h-4 w-4 ${compacto ? "" : "mr-2"}`} />}
        {!compacto && "Descargar factura"}
      </Button>
      {venta.estado === "anulada" && !nc && (
        <Button
          size={size}
          variant="ghost"
          className={`${ancho} ${compacto ? "h-8 px-2 text-amber-700 hover:text-amber-800" : "text-amber-700 hover:text-amber-800"}`}
          onClick={notaDeCredito}
          disabled={ocupado !== null}
          title="Emitir nota de crédito que anula la factura"
        >
          {ocupado === "nc" ? <Loader2 className={`h-4 w-4 animate-spin ${compacto ? "" : "mr-2"}`} /> : <Undo2 className={`h-4 w-4 ${compacto ? "" : "mr-2"}`} />}
          {!compacto && "Nota de crédito"}
        </Button>
      )}
      {nc && (
        <Button
          size={size}
          variant="ghost"
          className={`${ancho} ${compacto ? "h-8 px-2 text-amber-700" : "text-amber-700"}`}
          onClick={() => descargar(nc)}
          disabled={ocupado !== null}
          title={`Descargar nota de crédito ${numeroComprobante(nc.puntoVenta, nc.numero ?? 0)}`}
        >
          <Download className={`h-4 w-4 ${compacto ? "" : "mr-2"}`} />
          {!compacto && `Nota de crédito ${numeroComprobante(nc.puntoVenta, nc.numero ?? 0)}`}
        </Button>
      )}
    </div>
  )
}
