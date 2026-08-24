import { jsPDF } from "jspdf"
import type { Venta, VentaItem } from "@/lib/supabase/types"
import { MEDIOS_PAGO } from "@/lib/supabase/types"
import { formatCantidad, formatCurrency, formatDateTime } from "@/lib/format"
import { COLOR, Lienzo, type RGB } from "./remito-layout"

/**
 * Remito de venta: PDF para imprimir o mandar, y el texto que acompaña al
 * mensaje de WhatsApp.
 *
 * Sigue la estructura del remito argentino, que es la que la gente reconoce:
 *
 *   ┌──────────────────────────────────────────┐
 *   │  logo + emisor      ┌─┐    N° 0001-00000042│  ← recuadro de la letra
 *   │  domicilio, CUIT    │R│    fecha, original │    partiendo el encabezado
 *   ├─────────────────────└─┘────────────────────┤
 *   │  SR./ES. — domicilio, DNI, teléfono        │
 *   ├────────────────────────────────────────────┤
 *   │  CANT.  DESCRIPCIÓN     P.UNIT.   IMPORTE  │
 *   │  ...                                       │
 *   ├────────────────────────────────────────────┤
 *   │              subtotal / descuento / TOTAL  │
 *   └────────────────────────────────────────────┘
 *
 * El recuadro de la letra y la numeración `0001-00000042` son lo que hace que
 * se lea como un remito y no como un ticket de supermercado.
 *
 * La tabla de detalle se estira con renglones vacíos hasta los totales, como en
 * el remito de papel: así una venta de tres ítems no deja media hoja en blanco.
 *
 * Se arma en el navegador con jsPDF y no se persiste: se regenera desde la
 * venta, que es el dato real. Toca `document` al descargar, así que solo corre
 * en cliente.
 */

/** Datos de la veterinaria que van en el encabezado. */
export interface EmisorRemito {
  nombre: string
  direccion?: string
  telefono?: string
  email?: string
  /** URL pública del logo. Si no carga, el remito sale igual sin él. */
  logoUrl?: string
  /** Opcional: no todas las veterinarias lo tienen cargado. */
  cuit?: string
}

// ── Medidas ──
// A4 = 595 × 842pt. Todo el documento cuelga de estas constantes.

const MARGEN = 40
const PAD = 14
const ALTO_ENCABEZADO = 104
const ALTO_FILA = 19
const ALTO_PIE = 30

/** Ancho de cada columna del detalle, de derecha a izquierda. */
const COL = { cantidad: 62, precio: 78, importe: 84 }

function etiquetaMedioPago(medio: Venta["medioPago"]): string {
  return MEDIOS_PAGO.find((m) => m.id === medio)?.label ?? medio
}

/**
 * Numeración estilo comprobante argentino: `0001-00000042`.
 *
 * El punto de venta es fijo en 0001 — no hay varios puntos de venta por
 * veterinaria, pero el formato es el que la gente espera ver en un remito.
 */
export function numeroFormateado(venta: Pick<Venta, "numero">): string {
  return `0001-${String(venta.numero).padStart(8, "0")}`
}

export function nombreArchivoRemito(venta: Pick<Venta, "numero">): string {
  return `Remito-0001-${String(venta.numero).padStart(8, "0")}.pdf`
}

/**
 * Descarga el logo y lo convierte a data URL, que es lo único que jsPDF sabe
 * incrustar sin pelearse con CORS.
 *
 * Devuelve `null` ante cualquier problema —red, permisos, formato— porque un
 * logo que no carga no puede impedir que salga el remito.
 */
export async function cargarLogo(
  url: string | undefined,
): Promise<{ dataUrl: string; ancho: number; alto: number } | null> {
  if (!url) return null

  try {
    const respuesta = await fetch(url, { mode: "cors" })
    if (!respuesta.ok) return null

    const blob = await respuesta.blob()
    // Los SVG no los rasteriza jsPDF: quedarían como un rectángulo vacío.
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(blob.type)) return null

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const lector = new FileReader()
      lector.onload = () => resolve(String(lector.result))
      lector.onerror = () => reject(new Error("No se pudo leer el logo"))
      lector.readAsDataURL(blob)
    })

    // Las proporciones reales hacen falta para no deformarlo en el encabezado.
    const { ancho, alto } = await new Promise<{ ancho: number; alto: number }>(
      (resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve({ ancho: img.naturalWidth, alto: img.naturalHeight })
        img.onerror = () => reject(new Error("Logo inválido"))
        img.src = dataUrl
      },
    )

    return { dataUrl, ancho, alto }
  } catch {
    return null
  }
}

export type Logo = Awaited<ReturnType<typeof cargarLogo>>

/** Geometría compartida por todas las secciones. */
interface Marco {
  izq: number
  der: number
  ancho: number
  /** X donde arranca cada columna del detalle. */
  xCantidad: number
  xDescripcion: number
  xPrecio: number
  xImporte: number
  finDescripcion: number
}

function marcoDe(l: Lienzo): Marco {
  const izq = MARGEN
  const der = l.ancho - MARGEN
  const xImporte = der - PAD
  const xPrecio = xImporte - COL.importe
  const xCantidad = izq + PAD
  const xDescripcion = xCantidad + COL.cantidad

  return {
    izq,
    der,
    ancho: der - izq,
    xCantidad,
    xDescripcion,
    xPrecio,
    xImporte,
    // Los nombres se recortan acá, con aire antes del precio unitario.
    finDescripcion: xPrecio - COL.precio - 10,
  }
}

/**
 * Arma el PDF y lo devuelve sin descargarlo. Para el caso normal usar
 * `descargarRemitoPDF`, que además resuelve el logo.
 */
export function generarRemitoPDF(venta: Venta, emisor: EmisorRemito, logo: Logo = null): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const l = new Lienzo(doc)
  const m = marcoDe(l)

  const items = venta.items ?? []
  // Cuántas filas entran entre el encabezado y el pie de la primera hoja.
  const yPrimerDetalle = MARGEN + ALTO_ENCABEZADO + 78
  const alturas = items.map(altoFila)

  const paginas = repartirEnPaginas(alturas, yPrimerDetalle, l.alto)

  paginas.forEach((pagina, i) => {
    if (i > 0) doc.addPage()

    dibujarEncabezado(l, m, venta, emisor, logo)
    const yDetalle = dibujarCliente(l, m, venta)
    const esUltima = i === paginas.length - 1

    const yFin = dibujarDetalle(
      l, m,
      items.slice(pagina.desde, pagina.hasta),
      pagina.desde,
      yDetalle,
      // La tabla se estira con renglones vacíos hasta donde empiezan los
      // totales. Es como se ve un remito de papel: el bloque de detalle ocupa
      // la hoja entera en vez de dejar medio A4 en blanco.
      esUltima ? l.alto - MARGEN - ALTO_PIE - 92 : l.alto - MARGEN - 30,
    )

    // Los totales van solo en la última hoja: repetirlos en cada una haría
    // parecer que cada página es una venta distinta.
    if (esUltima) {
      dibujarTotales(l, m, venta, yFin)
      dibujarPie(l, m, venta)
    }
  })

  sellarAnulada(l, venta)
  numerarPaginas(l, doc)

  return doc
}

/** Una fila mide más cuando el producto tiene presentación ("15 kg"). */
function altoFila(item: VentaItem): number {
  return item.presentacion ? ALTO_FILA + 9 : ALTO_FILA
}

/**
 * Reparte los items en páginas según cuánto ocupa cada fila.
 *
 * Se calcula antes de dibujar para saber cuál es la última página: los totales
 * y el "recibí conforme" tienen que ir ahí y en ningún otro lado.
 */
function repartirEnPaginas(
  alturas: number[],
  yInicial: number,
  altoPagina: number,
): { desde: number; hasta: number }[] {
  // La última página necesita lugar extra para totales + firma.
  const limiteNormal = altoPagina - MARGEN - 30
  const limiteUltima = altoPagina - MARGEN - ALTO_PIE - 90

  if (alturas.length === 0) return [{ desde: 0, hasta: 0 }]

  const paginas: { desde: number; hasta: number }[] = []
  let desde = 0
  let y = yInicial

  for (let i = 0; i < alturas.length; i++) {
    const esUltimo = i === alturas.length - 1
    const limite = esUltimo ? limiteUltima : limiteNormal

    if (y + alturas[i] > limite && i > desde) {
      paginas.push({ desde, hasta: i })
      desde = i
      y = yInicial
    }
    y += alturas[i]
  }

  paginas.push({ desde, hasta: alturas.length })
  return paginas
}

/**
 * Encabezado: el emisor a la izquierda, los datos del comprobante a la derecha,
 * y el recuadro de la letra "R" partiendo los dos al medio.
 */
function dibujarEncabezado(
  l: Lienzo,
  m: Marco,
  venta: Venta,
  emisor: EmisorRemito,
  logo: Logo,
) {
  const y = MARGEN
  const centro = l.ancho / 2

  // Marco del bloque, con la línea vertical que separa emisor de comprobante.
  l.rect(m.izq, y, m.ancho, ALTO_ENCABEZADO, { borde: COLOR.linea, radio: 4 })
  l.linea(centro, y, centro, y + ALTO_ENCABEZADO, COLOR.linea)

  // ── Izquierda: quién emite ──
  let x = m.izq + PAD
  const yLogo = y + 16

  if (logo) {
    const CAJA = 42
    const escala = Math.min(CAJA / logo.ancho, CAJA / logo.alto)
    const w = logo.ancho * escala
    const h = logo.alto * escala
    l.doc.addImage(logo.dataUrl, x + (CAJA - w) / 2, yLogo + (CAJA - h) / 2, w, h)
    x += CAJA + 12
  }

  const anchoEmisor = centro - x - 12
  l.texto(l.recortar(emisor.nombre || "VetPanel", anchoEmisor, { size: 14, bold: true }), x, y + 30, {
    size: 14,
    bold: true,
  })

  let yEmisor = y + 46
  const lineaEmisor = (valor?: string) => {
    if (!valor) return
    l.texto(l.recortar(valor, anchoEmisor, { size: 8 }), x, yEmisor, { size: 8, color: COLOR.gris })
    yEmisor += 11
  }
  lineaEmisor(emisor.direccion)
  lineaEmisor([emisor.telefono, emisor.email].filter(Boolean).join("  ·  "))
  lineaEmisor(emisor.cuit ? `CUIT ${emisor.cuit}` : undefined)

  // ── Recuadro de la letra ──
  // Es la marca visual del comprobante argentino: un cuadrado con la letra,
  // montado sobre la división entre los dos bloques.
  const LADO = 44
  const xLetra = centro - LADO / 2
  const yLetra = y + (ALTO_ENCABEZADO - LADO) / 2

  // El relleno blanco tapa la línea divisoria que pasa por detrás.
  l.rect(xLetra, yLetra, LADO, LADO, {
    relleno: COLOR.papel,
    borde: COLOR.tinta,
    grosor: 1,
  })
  l.texto("R", centro, yLetra + 27, { size: 24, bold: true, align: "center" })
  l.texto("COD. 91", centro, yLetra + 38, { size: 5.5, color: COLOR.gris, align: "center" })

  // ── Derecha: qué comprobante es ──
  const xDer = m.der - PAD
  // Los rótulos arrancan pasado el recuadro de la letra, o quedan tapados.
  const xRotulos = centro + LADO / 2 + 10
  l.texto("REMITO", xDer, y + 26, { size: 15, bold: true, align: "right", charSpace: 1.5 })
  l.texto("Documento no válido como factura", xDer, y + 38, {
    size: 6.5,
    color: COLOR.gris,
    align: "right",
  })

  l.linea(xRotulos, y + 48, m.der - PAD, y + 48, COLOR.lineaSuave)

  const dato = (rotulo: string, valor: string, yDato: number) => {
    l.rotulo(rotulo, xRotulos, yDato)
    l.texto(valor, xDer, yDato, { size: 9, bold: true, align: "right" })
  }
  dato("N°", numeroFormateado(venta), y + 64)
  dato("Fecha", formatDateTime(venta.createdAt), y + 79)
  dato("Pago", etiquetaMedioPago(venta.medioPago), y + 94)
}

/** Bloque del destinatario. Los datos que faltan se muestran como raya. */
function dibujarCliente(l: Lienzo, m: Marco, venta: Venta): number {
  const y = MARGEN + ALTO_ENCABEZADO + 12
  const ALTO = 50

  l.rect(m.izq, y, m.ancho, ALTO, { relleno: COLOR.acentoSuave, radio: 4 })

  const col2 = m.izq + m.ancho * 0.52
  const guion = "—"

  l.rotulo("Sr./es.", m.izq + PAD, y + 15)
  l.texto(
    l.recortar(venta.clienteNombre || "Consumidor final", col2 - m.izq - PAD * 2, {
      size: 11,
      bold: true,
    }),
    m.izq + PAD,
    y + 31,
    { size: 11, bold: true },
  )

  l.rotulo("Domicilio", m.izq + PAD, y + 43)
  l.texto(
    l.recortar(venta.clienteDomicilio || guion, col2 - m.izq - PAD * 2 - 46, { size: 8 }),
    m.izq + PAD + 46,
    y + 43,
    { size: 8, color: COLOR.gris },
  )

  l.rotulo("DNI / CUIT", col2, y + 15)
  l.texto(venta.clienteDni || guion, col2 + 60, y + 15, { size: 8.5 })

  l.rotulo("Teléfono", col2, y + 31)
  l.texto(venta.clienteTelefono || guion, col2 + 60, y + 31, { size: 8.5 })

  l.rotulo("Cond. IVA", col2, y + 43)
  l.texto("Consumidor final", col2 + 60, y + 43, { size: 8, color: COLOR.gris })

  return y + ALTO + 16
}

function dibujarDetalle(
  l: Lienzo,
  m: Marco,
  items: VentaItem[],
  offset: number,
  yInicial: number,
  yTope: number,
): number {
  let y = yInicial

  // Banda del encabezado de columnas.
  l.rect(m.izq, y, m.ancho, 20, { relleno: COLOR.tinta, radio: 3 })
  const yRot = y + 13
  l.texto("CANT.", m.xCantidad, yRot, { size: 6.5, bold: true, color: COLOR.papel, charSpace: 0.6 })
  l.texto("DESCRIPCIÓN", m.xDescripcion, yRot, {
    size: 6.5, bold: true, color: COLOR.papel, charSpace: 0.6,
  })
  l.texto("P. UNIT.", m.xPrecio, yRot, {
    size: 6.5, bold: true, color: COLOR.papel, charSpace: 0.6, align: "right",
  })
  l.texto("IMPORTE", m.xImporte, yRot, {
    size: 6.5, bold: true, color: COLOR.papel, charSpace: 0.6, align: "right",
  })

  y += 20

  const yTabla = y
  // Contador propio de filas: las alturas son variables (una fila con
  // presentación mide más), así que la paridad de la cebra no se puede deducir
  // dividiendo la distancia recorrida.
  let fila = offset

  if (items.length === 0) {
    l.texto("Sin ítems", m.xDescripcion, y + 14, { size: 9, color: COLOR.gris })
  }

  items.forEach((item) => {
    const alto = altoFila(item)

    // Cebra: ayuda a seguir el renglón hasta el importe en listas largas.
    if (fila % 2 === 1) {
      l.rect(m.izq, y, m.ancho, alto, { relleno: COLOR.cebra })
    }
    fila++

    const yTexto = y + 13

    const unidad = item.unidad === "kg" ? " kg" : ""
    l.texto(`${formatCantidad(item.cantidad)}${unidad}`, m.xCantidad, yTexto, {
      size: 9,
      bold: true,
    })

    const titulo = [item.marca, item.nombre].filter(Boolean).join(" ")
    const anchoTitulo = m.finDescripcion - m.xDescripcion
    l.texto(l.recortar(titulo, anchoTitulo, { size: 9 }), m.xDescripcion, yTexto, { size: 9 })

    l.texto(formatCurrency(item.precioUnitario), m.xPrecio, yTexto, {
      size: 9,
      color: COLOR.gris,
      align: "right",
    })
    l.texto(formatCurrency(item.subtotal), m.xImporte, yTexto, {
      size: 9,
      bold: true,
      align: "right",
    })

    if (item.presentacion) {
      l.texto(item.presentacion, m.xDescripcion, yTexto + 9, { size: 7, color: COLOR.gris })
    }

    y += alto
    l.linea(m.izq, y, m.der, y, COLOR.lineaSuave)
  })

  // Renglones vacíos hasta el tope, para que la tabla llegue al pie.
  while (y + ALTO_FILA <= yTope) {
    if (fila % 2 === 1) {
      l.rect(m.izq, y, m.ancho, ALTO_FILA, { relleno: COLOR.cebra })
    }
    fila++
    y += ALTO_FILA
    l.linea(m.izq, y, m.der, y, COLOR.lineaSuave)
  }

  // Bordes laterales e inferior: cierran la tabla como una caja.
  l.linea(m.izq, yTabla, m.izq, y, COLOR.linea)
  l.linea(m.der, yTabla, m.der, y, COLOR.linea)
  l.linea(m.izq, y, m.der, y, COLOR.linea)

  return y
}

function dibujarTotales(l: Lienzo, m: Marco, venta: Venta, yInicial: number): number {
  const ANCHO = 220
  const x = m.der - ANCHO
  let y = yInicial + 14

  const fila = (rotulo: string, valor: string) => {
    l.texto(rotulo, x + 12, y, { size: 8.5, color: COLOR.gris })
    l.texto(valor, m.xImporte, y, { size: 8.5, align: "right" })
    y += 14
  }

  if (venta.descuento > 0) {
    fila("Subtotal", formatCurrency(venta.subtotal))
    fila("Descuento", `- ${formatCurrency(venta.descuento)}`)
    y += 2
  }

  // El total en su propia barra: es el número que se busca de un vistazo.
  // En un remito anulado va en gris: el verde lo haría leer como cobrado.
  const ALTO = 30
  const fondo = venta.estado === "anulada" ? COLOR.gris : COLOR.acento
  l.rect(x, y - 10, ANCHO, ALTO, { relleno: fondo, radio: 4 })
  l.texto("TOTAL", x + 12, y + 9, { size: 10, bold: true, color: COLOR.papel, charSpace: 1 })
  l.texto(formatCurrency(venta.total), m.xImporte - 2, y + 10, {
    size: 14,
    bold: true,
    color: COLOR.papel,
    align: "right",
  })

  const cantidad = (venta.items ?? []).length
  l.texto(
    `${cantidad} ${cantidad === 1 ? "ítem" : "ítems"}`,
    m.izq + PAD,
    y + 10,
    { size: 8, color: COLOR.gris },
  )

  return y + ALTO + 6
}

/** Observaciones de la venta y legendas al pie de la hoja. */
function dibujarPie(l: Lienzo, m: Marco, venta: Venta) {
  if (venta.observaciones) {
    l.texto(
      l.recortar(`Observaciones: ${venta.observaciones}`, m.ancho, { size: 8 }),
      m.izq,
      l.alto - MARGEN - 12,
      { size: 8, color: COLOR.gris },
    )
  }

  const yLegenda = l.alto - MARGEN + 12
  l.texto("ORIGINAL", m.izq, yLegenda, { size: 6.5, bold: true, color: COLOR.gris, charSpace: 1 })
  if (venta.vendedorNombre) {
    l.texto(`Atendió: ${venta.vendedorNombre}`, m.der, yLegenda, {
      size: 6.5,
      color: COLOR.gris,
      align: "right",
    })
  }
}

/** Sello diagonal sobre todas las páginas de un remito anulado. */
function sellarAnulada(l: Lienzo, venta: Venta) {
  if (venta.estado !== "anulada") return

  const total = l.doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    l.doc.setPage(p)
    l.conOpacidad(0.14, () => {
      l.doc.setFont("helvetica", "bold")
      l.doc.setFontSize(76)
      l.doc.setTextColor(...(COLOR.rojo as RGB))
      l.doc.text("ANULADO", l.ancho / 2, l.alto / 2, { align: "center", angle: 24 })
    })
  }
}

function numerarPaginas(l: Lienzo, doc: jsPDF) {
  const total = doc.getNumberOfPages()
  if (total < 2) return

  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    l.texto(`Hoja ${p} de ${total}`, l.ancho / 2, l.alto - MARGEN + 12, {
      size: 6.5,
      color: COLOR.gris,
      align: "center",
    })
  }
}

/** Resuelve el logo, genera el PDF y dispara la descarga. */
export async function descargarRemitoPDF(venta: Venta, emisor: EmisorRemito): Promise<void> {
  const logo = await cargarLogo(emisor.logoUrl)
  generarRemitoPDF(venta, emisor, logo).save(nombreArchivoRemito(venta))
}

/**
 * Normaliza un teléfono argentino al formato que espera wa.me: solo dígitos,
 * con código de país. Devuelve `null` si no parece un número usable — en ese
 * caso se abre WhatsApp sin destinatario y el usuario elige el contacto.
 */
export function telefonoWhatsApp(telefono: string | undefined): string | null {
  const digitos = (telefono ?? "").replace(/\D/g, "")
  if (digitos.length < 8) return null

  if (digitos.startsWith("54")) return digitos
  // 0351... → se saca el 0 de larga distancia.
  if (digitos.startsWith("0")) return `54${digitos.slice(1)}`
  return `54${digitos}`
}

/** Mensaje que acompaña al remito. El PDF lo adjunta el usuario a mano. */
export function mensajeWhatsApp(venta: Venta, emisor: EmisorRemito): string {
  const saludo = venta.clienteNombre ? `Hola ${venta.clienteNombre}!` : "¡Hola!"
  const detalle = (venta.items ?? [])
    .map(
      (i) =>
        `• ${[i.marca, i.nombre].filter(Boolean).join(" ")}` +
        `${i.presentacion ? ` (${i.presentacion})` : ""}` +
        ` x${formatCantidad(i.cantidad)} — ${formatCurrency(i.subtotal)}`,
    )
    .join("\n")

  return [
    saludo,
    "",
    `Te paso el remito de tu compra en ${emisor.nombre}:`,
    "",
    detalle,
    "",
    `*Total: ${formatCurrency(venta.total)}*`,
    `Remito N° ${numeroFormateado(venta)}`,
    "",
    "¡Gracias por tu compra!",
  ].join("\n")
}

/** URL de wa.me lista para abrir en una pestaña nueva. */
export function linkWhatsApp(venta: Venta, emisor: EmisorRemito): string {
  const telefono = telefonoWhatsApp(venta.clienteTelefono)
  const texto = encodeURIComponent(mensajeWhatsApp(venta, emisor))
  return telefono ? `https://wa.me/${telefono}?text=${texto}` : `https://wa.me/?text=${texto}`
}
