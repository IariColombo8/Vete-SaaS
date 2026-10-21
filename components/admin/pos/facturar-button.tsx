"use client"

import { useEffect, useRef, useState } from "react"
import { AlertCircle, Download, FileText, Loader2, Lock, MessageCircle, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { Venta } from "@/lib/supabase/types"
import type { Comprobante, EstadoFacturacion } from "@/lib/supabase/comprobantes"
import { getComprobante } from "@/lib/supabase/comprobantes"
import type { EmisorRemito } from "@/lib/ventas/remito"
import { emisorFiscalDesdeEstado, linkWhatsAppFactura } from "@/lib/facturacion/factura-pdf"
import { descargarComprobanteGuardado, obtenerPdfComprobante } from "@/lib/facturacion/factura-guardada"
import { esNotaCredito, letraDeTipo, numeroComprobante } from "@/lib/facturacion/comprobante"
import { emitirFactura, emitirNotaCredito } from "./use-facturacion"

interface Props {
  tenantId: string
  venta: Venta
  emisor: EmisorRemito
  /** Estado de la integración (cargado una vez por el padre). `null` = todavía no se sabe. */
  facturacion: EstadoFacturacion | null
  /** Factura ya emitida de esta venta, si el padre la tiene. */
  comprobante?: Comprobante | null
  /** Nota de crédito ya emitida, si la hay. */
  notaCredito?: Comprobante | null
  /** Compacto para la fila del historial; normal para el diálogo del remito. */
  variante?: "fila" | "bloque"
  /** Emitir apenas se monta (venta que no es en efectivo, desde el mostrador). */
  autoEmitir?: boolean
}

/**
 * Control de facturación de una venta: "Facturar" si no tiene factura,
 * descargar / mandar por WhatsApp si la tiene, y "Nota de crédito" cuando la
 * venta se anuló después de facturada.
 *
 * Sin ARCA configurado (o sin certificado) se muestra bloqueado, con el
 * aviso de dónde se configura: así se sabe que la función existe.
 *
 * El PDF se guarda la primera vez y después se entrega siempre ese archivo
 * (`factura-guardada.ts`): una factura emitida no cambia.
 */
export function FacturarButton({
  tenantId,
  venta,
  emisor,
  facturacion,
  comprobante,
  notaCredito,
  variante = "bloque",
  autoEmitir = false,
}: Props) {
  const [factura, setFactura] = useState<Comprobante | null>(comprobante ?? null)
  const [nc, setNc] = useState<Comprobante | null>(notaCredito ?? null)
  const [ocupado, setOcupado] = useState<"emitir" | "descargar" | "nc" | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Candado contra la doble emisión: el efecto de StrictMode corre dos veces
  // y un doble click no puede pedir dos CAE para la misma venta.
  const emitiendo = useRef(false)

  // En el historial los comprobantes llegan después que las ventas.
  useEffect(() => {
    if (comprobante) setFactura(comprobante)
  }, [comprobante])
  useEffect(() => {
    if (notaCredito) setNc(notaCredito)
  }, [notaCredito])

  const fiscal = facturacion ? emisorFiscalDesdeEstado(facturacion) : null
  const listo = Boolean(facturacion?.listo && fiscal)
  const facturable = venta.estado !== "anulada" && !venta.esPagoCtaCte
  const compacto = variante === "fila"

  const pdfDe = (c: Comprobante) => {
    if (!fiscal) throw new Error("Faltan los datos fiscales de la veterinaria")
    return { tenantId, venta, emisor, comprobante: c, fiscal }
  }

  async function facturar() {
    if (!listo || emitiendo.current) return
    emitiendo.current = true
    setOcupado("emitir")
    setError(null)
    try {
      const r = await emitirFactura(tenantId, venta.id)
      if (r.estado !== "emitido") {
        throw new Error(
          `ARCA rechazó la factura${r.observaciones.length ? `: ${r.observaciones.map((o) => o.msg).join(" · ")}` : ""}`,
        )
      }
      const c = await getComprobante(tenantId, r.comprobanteId)
      if (!c) throw new Error("La factura se emitió pero no se pudo leer. Buscala en Ventas.")
      setFactura(c)
      toast.success(`Factura ${letraDeTipo(r.tipoCbte)} ${numeroComprobante(r.puntoVenta, r.numero ?? 0)} emitida`)
      if (r.observaciones.length) {
        toast.message("ARCA agregó observaciones", { description: r.observaciones.map((o) => o.msg).join(" · ") })
      }
      // Se dibuja y se guarda ya, con los datos de hoy: es la que queda.
      void obtenerPdfComprobante(pdfDe(c)).catch((e) => console.error("No se pudo guardar el PDF:", e))
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo emitir la factura"
      setError(msg)
      toast.error(msg, { duration: 10000 })
    } finally {
      emitiendo.current = false
      setOcupado(null)
    }
  }

  useEffect(() => {
    if (autoEmitir && listo && facturable && !factura) void facturar()
    // Solo al montar: la emisión automática es una por venta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function descargar(c: Comprobante) {
    setOcupado("descargar")
    try {
      await descargarComprobanteGuardado(pdfDe(c))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo descargar el PDF")
    } finally {
      setOcupado(null)
    }
  }

  function enviarPorWhatsApp(c: Comprobante) {
    // La ventana se abre ANTES del await: si se abre después, el navegador ya
    // no la asocia al click y la bloquea como popup.
    const chat = window.open(linkWhatsAppFactura(venta, emisor, c), "_blank", "noopener,noreferrer")
    if (!chat) toast.error("El navegador bloqueó la ventana de WhatsApp")
    // El PDF se descarga igual, para adjuntarlo en el chat.
    void descargar(c)
  }

  async function notaDeCredito() {
    if (!factura) return
    setOcupado("nc")
    try {
      const r = await emitirNotaCredito(tenantId, factura.id)
      const c = await getComprobante(tenantId, r.comprobanteId)
      setNc(c)
      toast.success(`Nota de crédito ${letraDeTipo(r.tipoCbte)} ${numeroComprobante(r.puntoVenta, r.numero ?? 0)} emitida`)
      if (c) void obtenerPdfComprobante(pdfDe(c)).catch((e) => console.error("No se pudo guardar el PDF:", e))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo emitir la nota de crédito", { duration: 10000 })
    } finally {
      setOcupado(null)
    }
  }

  // Todavía no se sabe si la veterinaria factura: no mostrar nada que después cambie.
  if (!facturacion) return null

  const size = compacto ? "sm" : "default"
  const ancho = compacto ? "" : "w-full"
  const icono = compacto ? "h-4 w-4" : "mr-2 h-4 w-4"
  const claseFila = "h-8 px-2 text-violet-700 hover:text-violet-800 dark:text-violet-300"

  if (!factura) {
    if (!facturable) return null

    if (!listo) {
      const aviso = facturacion.configurado
        ? "Falta cargar el certificado de ARCA en Configuración → Integraciones"
        : "Factura electrónica sin configurar: se activa en Configuración → Integraciones → ARCA"
      if (compacto) {
        return (
          <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground" disabled title={aviso}>
            <Lock className="h-3.5 w-3.5" />
          </Button>
        )
      }
      return (
        <div className="space-y-1">
          <Button variant="outline" className="w-full" disabled>
            <Lock className="mr-2 h-4 w-4" /> Factura electrónica bloqueada
          </Button>
          <p className="text-center text-xs text-muted-foreground">{aviso}</p>
        </div>
      )
    }

    const boton = (
      <Button
        size={size}
        variant={compacto ? "ghost" : "outline"}
        className={`${ancho} ${compacto ? claseFila : ""}`}
        onClick={facturar}
        disabled={ocupado !== null}
        title={facturacion.ambiente === "homologacion" ? "Ambiente de homologación: sin valor fiscal" : "Emitir factura electrónica"}
      >
        {ocupado === "emitir" ? <Loader2 className={`${icono} animate-spin`} /> : <FileText className={icono} />}
        {!compacto && (ocupado === "emitir" ? "Emitiendo factura…" : error ? "Reintentar factura" : "Facturar")}
      </Button>
    )
    if (compacto || !error) return boton
    return (
      <div className="space-y-2">
        <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </p>
        {boton}
      </div>
    )
  }

  const etiqueta = `${esNotaCredito(factura.tipoCbte) ? "NC" : "Factura"} ${letraDeTipo(factura.tipoCbte)} ${numeroComprobante(factura.puntoVenta, factura.numero ?? 0)}`

  return (
    <div className={compacto ? "flex items-center gap-0.5" : "space-y-2"}>
      {!compacto && (
        <div className="flex items-center justify-between rounded-lg border bg-violet-50/60 px-3 py-2 text-sm dark:bg-violet-950/20">
          <span className="font-medium">{etiqueta}</span>
          {factura.ambiente === "homologacion" ? (
            <Badge variant="outline">Prueba</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">CAE {factura.cae}</span>
          )}
        </div>
      )}
      <div className={compacto ? "contents" : "grid grid-cols-2 gap-2"}>
        <Button
          size={size}
          className={compacto ? `${claseFila}` : "bg-emerald-600 hover:bg-emerald-700"}
          variant={compacto ? "ghost" : "default"}
          onClick={() => enviarPorWhatsApp(factura)}
          disabled={ocupado !== null}
          title={`Enviar ${etiqueta} por WhatsApp`}
        >
          <MessageCircle className={icono} />
          {!compacto && "WhatsApp"}
        </Button>
        <Button
          size={size}
          variant={compacto ? "ghost" : "outline"}
          className={compacto ? claseFila : ""}
          onClick={() => descargar(factura)}
          disabled={ocupado !== null}
          title={`Descargar ${etiqueta}`}
        >
          {ocupado === "descargar" ? <Loader2 className={`${icono} animate-spin`} /> : <Download className={icono} />}
          {!compacto && "Descargar"}
        </Button>
      </div>
      {venta.estado === "anulada" && !nc && (
        <Button
          size={size}
          variant="ghost"
          className={`${ancho} ${compacto ? "h-8 px-2 text-amber-700 hover:text-amber-800" : "text-amber-700 hover:text-amber-800"}`}
          onClick={notaDeCredito}
          disabled={ocupado !== null}
          title="Emitir nota de crédito que anula la factura"
        >
          {ocupado === "nc" ? <Loader2 className={`${icono} animate-spin`} /> : <Undo2 className={icono} />}
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
          <Download className={icono} />
          {!compacto && `Nota de crédito ${numeroComprobante(nc.puntoVenta, nc.numero ?? 0)}`}
        </Button>
      )}
    </div>
  )
}
