import QRCode from "qrcode"
import type { Venta } from "@/lib/supabase/types"
import type { Comprobante, EstadoFacturacion } from "@/lib/supabase/comprobantes"
import {
  cargarLogo,
  generarRemitoPDF,
  LOGO_SERVITEC_URL,
  telefonoWhatsApp,
  type EmisorRemito,
  type ComprobanteFiscal,
} from "@/lib/ventas/remito"
import { formatCurrencyDecimals } from "@/lib/format"
import {
  CONDICION_IVA_LABEL,
  esNotaCredito,
  letraDeTipo,
  nombreComprobante,
  numeroComprobante,
  urlQrArca,
  type CondicionIvaEmisor,
} from "./comprobante"

/**
 * Factura electrónica en PDF, en el navegador. Reutiliza el generador del
 * remito: misma hoja, misma tabla; cambian letra, título, número, CAE, QR e
 * IVA. No se persiste: se regenera desde `comprobantes`, que es el dato real.
 */

const LABEL_DOC: Record<number, string> = { 80: "CUIT", 96: "DNI", 99: "Doc." }

/** Código ARCA → texto de condición IVA del receptor. */
const CONDICION_RECEPTOR: Record<number, string> = {
  1: "IVA Responsable Inscripto",
  4: "IVA Sujeto Exento",
  5: "Consumidor Final",
  6: "Responsable Monotributo",
  7: "Sujeto no categorizado",
  13: "Monotributista Social",
}

function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${d}/${m}/${a}`
}

export interface EmisorFiscal {
  cuit: string
  razonSocial: string
  condicionIva: CondicionIvaEmisor
  domicilioFiscal?: string
  ingresosBrutos?: string
  inicioActividades?: string
}

export function emisorFiscalDesdeEstado(e: EstadoFacturacion): EmisorFiscal | null {
  if (!e.configurado || !e.cuit || !e.razonSocial || !e.condicionIva) return null
  return {
    cuit: e.cuit,
    razonSocial: e.razonSocial,
    condicionIva: e.condicionIva,
    domicilioFiscal: e.domicilioFiscal,
    ingresosBrutos: e.ingresosBrutos,
    inicioActividades: e.inicioActividades ? fechaLarga(e.inicioActividades) : undefined,
  }
}

function formatCuit(cuit: string): string {
  const d = cuit.replace(/\D/g, "")
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : cuit
}

/** Arma los datos que el PDF necesita a partir del comprobante guardado. */
export async function datosParaPdf(c: Comprobante, emisor: EmisorFiscal): Promise<ComprobanteFiscal> {
  if (c.estado !== "emitido" || !c.cae || c.numero == null) {
    throw new Error("El comprobante no está emitido: no tiene CAE")
  }

  const url = urlQrArca({
    fecha: c.fecha,
    cuit: emisor.cuit,
    ptoVta: c.puntoVenta,
    tipoCmp: c.tipoCbte,
    nroCmp: c.numero,
    importe: c.impTotal,
    tipoDocRec: c.docTipo,
    nroDocRec: c.docNro,
    codAut: c.cae,
  })

  let qrDataUrl: string | null = null
  try {
    qrDataUrl = await QRCode.toDataURL(url, { margin: 0, width: 220, errorCorrectionLevel: "M" })
  } catch (e) {
    console.error("No se pudo generar el QR de ARCA:", e)
  }

  return {
    letra: letraDeTipo(c.tipoCbte),
    codigo: String(c.tipoCbte).padStart(2, "0"),
    titulo: nombreComprobante(c.tipoCbte),
    numero: numeroComprobante(c.puntoVenta, c.numero),
    fecha: fechaLarga(c.fecha),
    cae: c.cae,
    caeVto: c.caeVto ? fechaLarga(c.caeVto) : "—",
    qrDataUrl,
    emisor: {
      razonSocial: emisor.razonSocial,
      cuit: formatCuit(emisor.cuit),
      condicionIva: CONDICION_IVA_LABEL[emisor.condicionIva],
      domicilioFiscal: emisor.domicilioFiscal,
      ingresosBrutos: emisor.ingresosBrutos,
      inicioActividades: emisor.inicioActividades,
    },
    receptor: {
      nombre: c.receptorNombre,
      domicilio: c.receptorDomicilio,
      docLabel: LABEL_DOC[c.docTipo] ?? "Doc.",
      docNro: c.docTipo === 80 ? formatCuit(c.docNro) : c.docNro === "0" ? "" : c.docNro,
      condicionIva: CONDICION_RECEPTOR[c.receptorCondicionIva] ?? "Consumidor Final",
    },
    discriminaIva: letraDeTipo(c.tipoCbte) === "A",
    neto: c.impNeto,
    ivaLineas: c.alicuotas.map((a) => ({ alicuota: a.alicuota, importe: a.importe })),
    opEx: c.impOpEx,
    total: c.impTotal,
    // El unitario se deriva del importe: las facturas emitidas antes de que
    // `calcularImportes` escalara el unitario guardaron el precio sin el
    // recargo, y "cantidad × unitario" no daba el importe.
    items: c.items.length
      ? c.items.map((i) => (i.cantidad > 0 ? { ...i, precioUnitario: i.subtotal / i.cantidad } : i))
      : undefined,
    esPrueba: c.ambiente === "homologacion",
  }
}

export function nombreArchivoFactura(c: Comprobante): string {
  const tipo = esNotaCredito(c.tipoCbte) ? "nota-credito" : "factura"
  return `${tipo}-${letraDeTipo(c.tipoCbte)}-${numeroComprobante(c.puntoVenta, c.numero ?? 0)}.pdf`
}

/**
 * Resuelve logo y QR y dibuja el PDF. Solo se llama una vez por comprobante:
 * el resultado se guarda (`factura-guardada.ts`) y de ahí en más se descarga
 * ese archivo, no se vuelve a dibujar.
 */
export async function generarFacturaPDF(
  venta: Venta,
  emisor: EmisorRemito,
  comprobante: Comprobante,
  fiscal: EmisorFiscal,
): Promise<Blob> {
  const [logo, logoServitec, datos] = await Promise.all([
    cargarLogo(emisor.logoUrl),
    cargarLogo(LOGO_SERVITEC_URL),
    datosParaPdf(comprobante, fiscal),
  ])
  return generarRemitoPDF(venta, emisor, logo, datos, logoServitec).output("blob")
}

/** Texto para mandar la factura por WhatsApp (el PDF se adjunta a mano). */
export function mensajeWhatsAppFactura(venta: Venta, emisor: EmisorRemito, c: Comprobante): string {
  const saludo = venta.clienteNombre ? `Hola ${venta.clienteNombre}!` : "¡Hola!"
  const nombre = esNotaCredito(c.tipoCbte) ? "la nota de crédito" : "la factura"
  return [
    saludo,
    "",
    `Te paso ${nombre} de tu compra en ${emisor.nombre}:`,
    "",
    `*${nombreComprobante(c.tipoCbte)} N° ${numeroComprobante(c.puntoVenta, c.numero ?? 0)}*`,
    `Total: ${formatCurrencyDecimals(c.impTotal)}`,
    `CAE: ${c.cae ?? "—"}`,
    "",
    "¡Gracias por tu compra!",
  ].join("\n")
}

export function linkWhatsAppFactura(venta: Venta, emisor: EmisorRemito, c: Comprobante): string {
  const telefono = telefonoWhatsApp(venta.clienteTelefono)
  const texto = encodeURIComponent(mensajeWhatsAppFactura(venta, emisor, c))
  return telefono ? `https://wa.me/${telefono}?text=${texto}` : `https://wa.me/?text=${texto}`
}
