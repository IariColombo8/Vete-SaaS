import { jsPDF } from "jspdf"

/**
 * Primitivas de dibujo del remito.
 *
 * Separadas del contenido para que `remito.ts` se lea como el documento que
 * describe —encabezado, cliente, detalle, totales, pie— y no como una lista de
 * `setFillColor` sueltos.
 */

export type RGB = [number, number, number]

/** Paleta. Un solo lugar: cambiar el verde acá lo cambia en todo el documento. */
export const COLOR = {
  acento: [16, 185, 129] as RGB,
  acentoOscuro: [4, 120, 87] as RGB,
  acentoSuave: [236, 253, 245] as RGB,
  tinta: [17, 24, 39] as RGB,
  gris: [107, 114, 128] as RGB,
  linea: [203, 213, 225] as RGB,
  lineaSuave: [233, 238, 244] as RGB,
  papel: [255, 255, 255] as RGB,
  cebra: [250, 251, 252] as RGB,
  rojo: [220, 38, 38] as RGB,
} as const

export interface OpcionesTexto {
  size?: number
  bold?: boolean
  color?: RGB
  align?: "left" | "center" | "right"
  /** Espaciado entre letras, para los rótulos en versalitas. */
  charSpace?: number
}

/**
 * Envoltorio de jsPDF con las operaciones que usa el remito.
 *
 * Importante: `texto` y `medirTexto` fijan la fuente antes de operar. jsPDF
 * mide con la fuente ACTIVA, así que medir sin fijarla primero da anchos de
 * otro tamaño y los recortes salen mal.
 */
export class Lienzo {
  readonly doc: jsPDF
  readonly ancho: number
  readonly alto: number

  constructor(doc: jsPDF) {
    this.doc = doc
    this.ancho = doc.internal.pageSize.getWidth()
    this.alto = doc.internal.pageSize.getHeight()
  }

  private aplicarFuente(o: OpcionesTexto) {
    this.doc.setFont("helvetica", o.bold ? "bold" : "normal")
    this.doc.setFontSize(o.size ?? 9)
    this.doc.setTextColor(...(o.color ?? COLOR.tinta))
    this.doc.setCharSpace(o.charSpace ?? 0)
  }

  texto(valor: string, x: number, y: number, o: OpcionesTexto = {}): void {
    this.aplicarFuente(o)
    this.doc.text(valor, x, y, { align: o.align ?? "left" })
    this.doc.setCharSpace(0)
  }

  medirTexto(valor: string, o: OpcionesTexto = {}): number {
    this.aplicarFuente(o)
    const ancho = this.doc.getTextWidth(valor)
    this.doc.setCharSpace(0)
    return ancho
  }

  /** Recorta a una línea que entre en `ancho`, midiendo con la fuente correcta. */
  recortar(valor: string, ancho: number, o: OpcionesTexto = {}): string {
    this.aplicarFuente(o)
    const [primera] = this.doc.splitTextToSize(valor, ancho)
    this.doc.setCharSpace(0)
    return primera ?? valor
  }

  /** Rótulo en versalitas: el gris chiquito que titula cada dato. */
  rotulo(valor: string, x: number, y: number, align: OpcionesTexto["align"] = "left"): void {
    this.texto(valor.toUpperCase(), x, y, {
      size: 6.5,
      bold: true,
      color: COLOR.gris,
      charSpace: 0.6,
      align,
    })
  }

  linea(x1: number, y1: number, x2: number, y2: number, color: RGB = COLOR.linea, grosor = 0.6): void {
    this.doc.setDrawColor(...color)
    this.doc.setLineWidth(grosor)
    this.doc.line(x1, y1, x2, y2)
  }

  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    o: { relleno?: RGB; borde?: RGB; radio?: number; grosor?: number } = {},
  ): void {
    const modo = o.relleno && o.borde ? "FD" : o.relleno ? "F" : "S"
    if (o.relleno) this.doc.setFillColor(...o.relleno)
    if (o.borde) {
      this.doc.setDrawColor(...o.borde)
      this.doc.setLineWidth(o.grosor ?? 0.6)
    }
    if (o.radio) {
      this.doc.roundedRect(x, y, w, h, o.radio, o.radio, modo)
    } else {
      this.doc.rect(x, y, w, h, modo)
    }
  }

  /** Dibuja `fn` con opacidad reducida. Se usa para el sello de anulada. */
  conOpacidad(valor: number, fn: () => void): void {
    const GState = (this.doc as unknown as { GState: new (o: object) => object }).GState
    this.doc.setGState(new GState({ opacity: valor }))
    fn()
    this.doc.setGState(new GState({ opacity: 1 }))
  }
}
