import { jsPDF } from "jspdf"
import type { Producto } from "@/lib/supabase/types"
import { formatCantidad, formatCurrency, formatDateTime } from "@/lib/format"
import { estadoStock } from "@/lib/productos/precios"

/**
 * PDF del stock completo. Es la vía prevista para "ver todo el catálogo":
 * la tabla del panel pagina de a 30 a propósito, así que quien necesita mirar
 * los mil productos juntos —para un inventario físico, por ejemplo— lo hace
 * acá y no forzando la paginación de la pantalla.
 *
 * Tabla simple armada a mano con `jsPDF` (no hay plugin de autotable
 * instalado): una fila de texto por producto, repitiendo el encabezado en
 * cada hoja nueva.
 */

const MARGEN = 40
const ALTO_FILA = 16
const ALTO_ENCABEZADO_TABLA = 20

interface Columna {
  titulo: string
  x: number
  ancho: number
  align?: "left" | "right"
}

function columnas(anchoPagina: number): Columna[] {
  const izq = MARGEN
  const der = anchoPagina - MARGEN
  return [
    { titulo: "Código", x: izq, ancho: 70 },
    { titulo: "Producto", x: izq + 74, ancho: der - izq - 74 - 150 },
    { titulo: "Rubro", x: der - 150, ancho: 70 },
    { titulo: "Stock", x: der - 76, ancho: 40, align: "right" },
    { titulo: "Precio", x: der - 4, ancho: 60, align: "right" },
  ]
}

function recortar(doc: jsPDF, texto: string, anchoMax: number): string {
  if (doc.getTextWidth(texto) <= anchoMax) return texto
  let recorte = texto
  while (recorte.length > 1 && doc.getTextWidth(`${recorte}…`) > anchoMax) {
    recorte = recorte.slice(0, -1)
  }
  return `${recorte}…`
}

function dibujarEncabezadoTabla(doc: jsPDF, cols: Columna[], y: number): number {
  doc.setFillColor(30, 41, 59)
  doc.rect(MARGEN, y, doc.internal.pageSize.getWidth() - MARGEN * 2, ALTO_ENCABEZADO_TABLA, "F")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  for (const c of cols) {
    doc.text(c.titulo, c.x, y + 13, { align: c.align ?? "left" })
  }
  return y + ALTO_ENCABEZADO_TABLA
}

/** Arma el PDF y lo devuelve sin descargarlo. */
export function generarStockPDF(productos: Producto[], nombreVeterinaria: string): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const anchoPagina = doc.internal.pageSize.getWidth()
  const altoPagina = doc.internal.pageSize.getHeight()
  const cols = columnas(anchoPagina)
  const yTope = altoPagina - MARGEN

  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.setTextColor(15, 23, 42)
  doc.text(`Stock — ${nombreVeterinaria}`, MARGEN, MARGEN)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text(
    `${formatDateTime(new Date())} · ${productos.length} producto${productos.length === 1 ? "" : "s"}`,
    MARGEN,
    MARGEN + 14,
  )

  let y = MARGEN + 30
  y = dibujarEncabezadoTabla(doc, cols, y)

  productos.forEach((p, i) => {
    if (y + ALTO_FILA > yTope) {
      doc.addPage()
      y = MARGEN
      y = dibujarEncabezadoTabla(doc, cols, y)
    }

    if (i % 2 === 1) {
      doc.setFillColor(248, 250, 252)
      doc.rect(MARGEN, y, anchoPagina - MARGEN * 2, ALTO_FILA, "F")
    }

    const estado = estadoStock(p)
    const yTexto = y + 11

    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(51, 65, 85)

    doc.text(recortar(doc, p.codigoBarras || p.codigo || "—", cols[0].ancho), cols[0].x, yTexto)
    doc.text(recortar(doc, p.nombre, cols[1].ancho), cols[1].x, yTexto)
    doc.text(recortar(doc, p.categoria || "—", cols[2].ancho), cols[2].x, yTexto)

    if (estado === "servicio") {
      doc.setTextColor(148, 163, 184)
      doc.text("Servicio", cols[3].x, yTexto, { align: "right" })
    } else {
      if (estado === "agotado") doc.setTextColor(220, 38, 38)
      else if (estado === "bajo") doc.setTextColor(217, 119, 6)
      else doc.setTextColor(51, 65, 85)
      doc.text(`${formatCantidad(p.stock)} ${p.unidad}`, cols[3].x, yTexto, { align: "right" })
    }

    doc.setTextColor(51, 65, 85)
    doc.text(formatCurrency(p.precio), cols[4].x, yTexto, { align: "right" })

    y += ALTO_FILA
  })

  const totalPaginas = doc.getNumberOfPages()
  for (let pg = 1; pg <= totalPaginas; pg++) {
    doc.setPage(pg)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(148, 163, 184)
    doc.text(`Hoja ${pg} de ${totalPaginas}`, anchoPagina / 2, altoPagina - MARGEN + 16, {
      align: "center",
    })
  }

  return doc
}

export function nombreArchivoStock(): string {
  const hoy = new Date().toISOString().slice(0, 10)
  return `Stock-${hoy}.pdf`
}

export function descargarStockPDF(productos: Producto[], nombreVeterinaria: string): void {
  generarStockPDF(productos, nombreVeterinaria).save(nombreArchivoStock())
}
