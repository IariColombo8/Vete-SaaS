"use client"

import { supabase } from "@/lib/supabase/config"
import type { Venta } from "@/lib/supabase/types"
import type { Comprobante } from "@/lib/supabase/comprobantes"
import type { EmisorRemito } from "@/lib/ventas/remito"
import { generarFacturaPDF, nombreArchivoFactura, type EmisorFiscal } from "./factura-pdf"

/**
 * El PDF de una factura se dibuja UNA vez y se guarda en Storage
 * (`comprobantes/{tenant}/{comprobante}.pdf`, ver 065_comprobantes_pdf.sql).
 * Desde ahí se descarga y se manda siempre el mismo archivo: cambiar el logo,
 * el domicilio o el generador no toca una factura ya emitida. Las policies
 * no permiten update ni delete, así que un PDF subido no se puede pisar.
 *
 * Las facturas emitidas antes de esto no tienen PDF guardado: la primera
 * descarga lo dibuja y lo deja fijo.
 */

const BUCKET = "comprobantes"

const rutaDe = (tenantId: string, comprobanteId: string) => `${tenantId}/${comprobanteId}.pdf`

async function bajar(ruta: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(ruta)
  if (error || !data) return null
  return data
}

export async function obtenerPdfComprobante(params: {
  tenantId: string
  venta: Venta
  emisor: EmisorRemito
  comprobante: Comprobante
  fiscal: EmisorFiscal
}): Promise<Blob> {
  const ruta = rutaDe(params.tenantId, params.comprobante.id)
  const guardado = await bajar(ruta)
  if (guardado) return guardado

  const pdf = await generarFacturaPDF(params.venta, params.emisor, params.comprobante, params.fiscal)
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, pdf, { contentType: "application/pdf", upsert: false, cacheControl: "31536000" })
  if (error) {
    // Otra pestaña lo subió primero: vale el que quedó guardado.
    const ganador = await bajar(ruta)
    if (ganador) return ganador
    // Sin poder guardarlo, la factura se entrega igual: no puede quedar trabada.
    console.error("No se pudo guardar el PDF de la factura:", error)
  }
  return pdf
}

/** Baja el PDF guardado (o lo genera y guarda la primera vez) y lo descarga. */
export async function descargarComprobanteGuardado(params: Parameters<typeof obtenerPdfComprobante>[0]): Promise<void> {
  const pdf = await obtenerPdfComprobante(params)
  const url = URL.createObjectURL(pdf)
  const a = document.createElement("a")
  a.href = url
  a.download = nombreArchivoFactura(params.comprobante)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
