import { jsPDF } from "jspdf"
import { formatFechaISO } from "@/lib/format"
import { cargarLogo } from "@/lib/ventas/remito"
import { COLOR, Lienzo } from "@/lib/ventas/remito-layout"

/**
 * Comprobante / orden veterinaria (tipo receta): se genera automáticamente
 * al guardar una vacuna, medicamento o desparasitación desde la Libreta
 * Sanitaria — ver `openAddAplicacion` en `libreta-sanitaria-management.tsx`.
 *
 * Formato "media hoja" (A5, no A4 completo): así entra en recetarios chicos
 * y también se ve bien compartido por WhatsApp. Estética simple —blanco y
 * negro con un solo acento— porque esto se imprime en impresoras comunes,
 * no en la impresora a color del remito.
 */

export interface EmisorComprobante {
  nombre?: string
  logoUrl?: string
  direccion?: string
  telefono?: string
  /** Línea de rubro/servicios, ej: "Clínica y Cirugía - Vacunas - Desparasitaciones". */
  rubro?: string
}

export interface ProfesionalComprobante {
  nombre?: string
  especialidad?: string
  matricula?: string
  firmaUrl?: string
  selloUrl?: string
}

export interface ItemComprobante {
  tipoLabel: string
  nombre: string
  /** Dosis, vía de administración, frecuencia, duración — texto libre del veterinario. */
  indicaciones?: string
}

interface GenerarComprobanteParams {
  emisor: EmisorComprobante
  profesional: ProfesionalComprobante
  clienteNombre: string
  mascotaNombre: string
  /** YYYY-MM-DD. Por defecto, hoy — pasarla al reimprimir para mostrar la fecha original, no la del reimpreso. */
  fecha?: string
  /** Modo itemizado (vacunas/medicamentos/servicios/desparasitación). */
  items?: ItemComprobante[]
  /** Modo nota libre (orden médica de texto libre) — alternativo a `items`. */
  notaLibre?: string
}

const MARGEN = 28
const PAD = 12

function nombreArchivoComprobante(mascotaNombre: string): string {
  const slug = (mascotaNombre || "mascota").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-")
  return `orden-veterinaria-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`
}

/** Construye el documento sin guardarlo — reutilizado por la descarga y por la vista previa. */
async function construirComprobante(params: GenerarComprobanteParams): Promise<jsPDF> {
  const { emisor, profesional, clienteNombre, mascotaNombre, fecha, items, notaLibre } = params

  const [logo, firma, sello] = await Promise.all([
    cargarLogo(emisor.logoUrl),
    cargarLogo(profesional.firmaUrl),
    cargarLogo(profesional.selloUrl),
  ])

  const doc = new jsPDF({ unit: "pt", format: "a5" })
  const l = new Lienzo(doc)
  const anchoUtil = l.ancho - MARGEN * 2
  let y = MARGEN

  // ── 1. Header: identidad de la veterinaria/profesional ──
  let xTexto = MARGEN
  if (logo) {
    const CAJA = 40
    const escala = Math.min(CAJA / logo.ancho, CAJA / logo.alto)
    const w = logo.ancho * escala
    const h = logo.alto * escala
    doc.addImage(logo.dataUrl, MARGEN + (CAJA - w) / 2, y + (CAJA - h) / 2, w, h)
    xTexto = MARGEN + CAJA + 10
  }
  const anchoNombre = anchoUtil - (xTexto - MARGEN) - 90
  l.texto(l.recortar(emisor.nombre || "Veterinaria", anchoNombre, { size: 14, bold: true }), xTexto, y + 12, { size: 14, bold: true })
  doc.setFont("helvetica", "italic")
  doc.setFontSize(9)
  doc.setTextColor(...COLOR.tinta)
  doc.text(`Médico Veterinario${profesional.nombre ? " — " + profesional.nombre : ""}`, xTexto, y + 26)
  doc.setFont("helvetica", "normal")

  const datosContacto = [emisor.direccion, emisor.telefono].filter(Boolean).join("  ·  ")
  if (datosContacto) l.texto(datosContacto, xTexto, y + 38, { size: 8, color: COLOR.gris })
  if (emisor.rubro) {
    l.texto(l.recortar(emisor.rubro, anchoUtil - (xTexto - MARGEN), { size: 7.5, color: COLOR.gris }), xTexto, y + 49, { size: 7.5, color: COLOR.gris })
  }

  // Fecha, arriba a la derecha.
  l.rotulo("Fecha", MARGEN + anchoUtil - PAD, y + 8, "right")
  l.texto(fecha ? formatFechaISO(fecha) : formatFechaISO(new Date().toISOString()), MARGEN + anchoUtil - PAD, y + 20, { size: 10, bold: true, align: "right" })

  y += 58
  l.linea(MARGEN, y, MARGEN + anchoUtil, y, COLOR.tinta, 1.4)
  y += 22

  // ── 2. Cuerpo: "Rp/" + recuadro con la indicación ──
  doc.setFont("times", "italic")
  doc.setFontSize(22)
  doc.setTextColor(...COLOR.acentoOscuro)
  doc.text("Rp/", MARGEN, y + 18)
  doc.setFont("helvetica", "normal")
  y += 30

  const lineasCuerpo: { texto: string; bold?: boolean; size?: number }[] = [
    { texto: `Paciente: ${mascotaNombre || "—"}    ·    Responsable: ${clienteNombre || "—"}`, bold: true, size: 9.5 },
  ]
  if (notaLibre !== undefined) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9.5)
    const envueltas = doc.splitTextToSize(notaLibre.trim() || "—", anchoUtil - PAD * 2) as string[]
    envueltas.forEach((linea) => lineasCuerpo.push({ texto: linea, size: 9.5 }))
  } else {
    (items ?? []).forEach((item) => {
      lineasCuerpo.push({ texto: `${item.tipoLabel}: ${item.nombre}`, bold: true, size: 10 })
      if (item.indicaciones?.trim()) {
        doc.setFont("helvetica", "normal")
        doc.setFontSize(9)
        const envueltas = doc.splitTextToSize(item.indicaciones.trim(), anchoUtil - PAD * 2 - 10) as string[]
        envueltas.forEach((linea) => lineasCuerpo.push({ texto: `  ${linea}`, size: 9 }))
      }
    })
  }

  const altoLinea = 15
  const altoCuerpo = Math.max(lineasCuerpo.length * altoLinea + PAD * 2, 90)
  l.rect(MARGEN, y, anchoUtil, altoCuerpo, { borde: COLOR.tinta, radio: 3 })
  let ly = y + PAD + 10
  for (const linea of lineasCuerpo) {
    l.texto(linea.texto, MARGEN + PAD, ly, { size: linea.size ?? 9, bold: linea.bold })
    ly += altoLinea
  }
  y += altoCuerpo + 26

  // ── 3. Firma y sello, esquina inferior derecha ──
  const ANCHO_FIRMA = 150
  const xFirma = MARGEN + anchoUtil - ANCHO_FIRMA
  // Ancla de la LÍNEA de firma, no de la imagen: la imagen crece hacia arriba
  // desde acá sin mover el bloque, así que este número tiene que quedar
  // pegado al pie de página (no "más arriba" para "hacerle lugar" a la
  // firma grande, que fue el error de la vuelta anterior).
  let yFirma = Math.max(y, l.alto - 80)

  if (sello) {
    const CAJA_SELLO = 64
    const escala = Math.min(CAJA_SELLO / sello.ancho, CAJA_SELLO / sello.alto)
    const w = sello.ancho * escala
    const h = sello.alto * escala
    l.conOpacidad(0.85, () => {
      doc.addImage(sello.dataUrl, xFirma - 6, yFirma - h + 12, w, h)
    })
  }
  if (firma) {
    // Ancho acotado a la columna de la firma (no invade el sello ni el
    // margen); alto libre hasta 160 — así la firma puede crecer bien grande
    // sin correr el resto del bloque (línea, nombre, matrícula, sello).
    const ALTO_FIRMA = 160
    const escala = Math.min(ANCHO_FIRMA / firma.ancho, ALTO_FIRMA / firma.alto)
    const w = firma.ancho * escala
    const h = firma.alto * escala
    doc.addImage(firma.dataUrl, xFirma + (ANCHO_FIRMA - w) / 2, yFirma - h - 2, w, h)
  }
  l.linea(xFirma, yFirma, xFirma + ANCHO_FIRMA, yFirma, COLOR.tinta)
  yFirma += 12
  l.texto(profesional.nombre || "—", xFirma + ANCHO_FIRMA / 2, yFirma, { size: 9, bold: true, align: "center" })
  yFirma += 11
  l.texto(profesional.especialidad || "Médico Veterinario", xFirma + ANCHO_FIRMA / 2, yFirma, { size: 8, color: COLOR.gris, align: "center" })
  if (profesional.matricula) {
    yFirma += 11
    l.texto(`M.P. ${profesional.matricula}`, xFirma + ANCHO_FIRMA / 2, yFirma, { size: 8, color: COLOR.gris, align: "center" })
  }

  return doc
}

export async function generarComprobanteVeterinario(params: GenerarComprobanteParams): Promise<void> {
  const doc = await construirComprobante(params)
  doc.save(nombreArchivoComprobante(params.mascotaNombre))
}

/**
 * Blob URL del PDF, para mostrar una vista previa (ej. en un `<iframe>`) antes
 * de descargar. Blob URL en vez de data URI: los navegadores lo renderizan de
 * forma confiable en un iframe (el data URI queda en blanco en algunos casos).
 * Quien llama es responsable de revocar la URL (`URL.revokeObjectURL`) cuando
 * ya no la necesita.
 */
export async function previsualizarComprobante(params: GenerarComprobanteParams): Promise<string> {
  const doc = await construirComprobante(params)
  return URL.createObjectURL(doc.output("blob"))
}

/** El PDF como `File`, para adjuntarlo directo con la Web Share API (`navigator.share`). */
export async function generarComprobanteArchivo(params: GenerarComprobanteParams): Promise<File> {
  const doc = await construirComprobante(params)
  const blob = doc.output("blob") as Blob
  return new File([blob], nombreArchivoComprobante(params.mascotaNombre), { type: "application/pdf" })
}
