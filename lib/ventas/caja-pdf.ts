import { jsPDF } from "jspdf"
import type { Caja, Venta } from "@/lib/supabase/types"
import { MEDIOS_PAGO } from "@/lib/supabase/types"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { COLOR, Lienzo } from "./remito-layout"
import { cargarLogo, type Logo } from "./remito"

/**
 * Cierre de caja: mismo lenguaje visual que el remito (`remito.ts` sobre
 * `Lienzo`), pero para un turno completo en vez de una venta.
 *
 * A diferencia del remito, acá no hay forma de saber de antemano cuántas
 * ventas entran en la primera hoja: el detalle se corta línea por línea
 * contra el borde inferior y sigue en una página nueva con el mismo
 * encabezado de columnas.
 */

export interface EmisorCaja {
  nombre: string
  logoUrl?: string
}

const MARGEN = 40
const PAD = 12

function etiquetaMedioPago(medio: Venta["medioPago"]): string {
  return MEDIOS_PAGO.find((m) => m.id === medio)?.label ?? medio
}

export function nombreArchivoCaja(caja: Caja): string {
  const fecha = (caja.cierreAt ?? caja.aperturaAt).slice(0, 10)
  return `Caja-${fecha}.pdf`
}

interface TotalMedio {
  medio: Venta["medioPago"]
  cantidad: number
  total: number
}

function totalesPorMedio(ventas: Venta[]): TotalMedio[] {
  return MEDIOS_PAGO.map(({ id }) => {
    const deMedio = ventas.filter((v) => v.medioPago === id)
    return {
      medio: id,
      cantidad: deMedio.length,
      total: deMedio.reduce((acc, v) => acc + v.total, 0),
    }
  }).filter((m) => m.cantidad > 0)
}

export function generarCajaPDF(caja: Caja, ventas: Venta[], emisor: EmisorCaja, logo: Logo = null): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const l = new Lienzo(doc)
  const izq = MARGEN
  const der = l.ancho - MARGEN
  const ancho = der - izq

  const vigentes = ventas.filter((v) => v.estado !== "anulada")
  const porMedio = totalesPorMedio(vigentes)

  let y = dibujarEncabezado(l, izq, der, caja, emisor, logo)
  y = dibujarDatosCaja(l, izq, ancho, caja, y)
  y = dibujarTiles(l, izq, ancho, caja, vigentes, porMedio, y)
  y = dibujarResultado(l, izq, der, ancho, caja, y)
  if (caja.observaciones) y = dibujarNotas(l, izq, ancho, caja.observaciones, y)

  dibujarDetalle(l, izq, der, ancho, vigentes, y)

  return doc
}

function dibujarEncabezado(
  l: Lienzo,
  izq: number,
  der: number,
  caja: Caja,
  emisor: EmisorCaja,
  logo: Logo,
): number {
  const y = MARGEN
  let x = izq

  if (logo) {
    const CAJA = 34
    const escala = Math.min(CAJA / logo.ancho, CAJA / logo.alto)
    const w = logo.ancho * escala
    const h = logo.alto * escala
    l.doc.addImage(logo.dataUrl, x, y + (CAJA - h) / 2, w, h)
    x += CAJA + 10
  }

  l.texto("Cierre de caja", x, y + 16, { size: 18, bold: true, color: COLOR.acentoOscuro })
  l.texto(emisor.nombre, x, y + 31, { size: 10, color: COLOR.gris })

  const fecha = formatDateTime(caja.aperturaAt).split(" ")[0]
  l.texto(fecha, der, y + 16, { size: 10, bold: true, align: "right" })

  const badgeAncho = 66
  const badgeColor = caja.estado === "abierta" ? COLOR.acento : COLOR.tinta
  l.rect(der - badgeAncho, y + 22, badgeAncho, 16, { relleno: badgeColor, radio: 3 })
  l.texto(caja.estado === "abierta" ? "ABIERTA" : "CERRADA", der - badgeAncho / 2, y + 33, {
    size: 7.5,
    bold: true,
    color: COLOR.papel,
    align: "center",
    charSpace: 0.6,
  })

  const yLinea = y + 46
  l.linea(izq, yLinea, der, yLinea, COLOR.acento, 1.4)
  return yLinea + 20
}

function dibujarDatosCaja(l: Lienzo, izq: number, ancho: number, caja: Caja, yInicial: number): number {
  let y = yInicial
  const col2 = izq + ancho / 2

  const fila = (x: number, rotulo: string, valor: string) => {
    l.rotulo(rotulo, x, y)
    l.texto(valor, x, y + 13, { size: 9.5, bold: true })
  }

  fila(izq, "Abierta por", caja.abiertaPorNombre || "—")
  fila(col2, "Cerrada por", caja.cerradaPorNombre || (caja.estado === "abierta" ? "—" : "—"))
  y += 30
  fila(izq, "Apertura", formatDateTime(caja.aperturaAt))
  fila(col2, "Cierre", caja.cierreAt ? formatDateTime(caja.cierreAt) : "—")
  y += 30
  fila(izq, "Monto inicial", formatCurrency(caja.saldoInicial))

  return y + 26
}

function dibujarTiles(
  l: Lienzo,
  izq: number,
  ancho: number,
  caja: Caja,
  vigentes: Venta[],
  porMedio: TotalMedio[],
  yInicial: number,
): number {
  const totalVenta = vigentes.reduce((acc, v) => acc + v.total, 0)

  const tiles = [
    { etiqueta: "VENTA TOTAL", valor: formatCurrency(totalVenta), nota: `${vigentes.length} ventas` },
    ...porMedio.map((m) => ({
      etiqueta: etiquetaMedioPago(m.medio).toUpperCase(),
      valor: formatCurrency(m.total),
      nota: `${m.cantidad} ${m.cantidad === 1 ? "venta" : "ventas"}`,
    })),
  ]

  const gap = 8
  const anchoTile = (ancho - gap * (tiles.length - 1)) / tiles.length
  const alto = 46
  let y = yInicial

  tiles.forEach((t, i) => {
    const x = izq + i * (anchoTile + gap)
    l.rect(x, y, anchoTile, alto, { relleno: COLOR.acentoSuave, radio: 4 })
    l.texto(l.recortar(t.etiqueta, anchoTile - 16, { size: 6.5 }), x + 8, y + 15, {
      size: 6.5,
      bold: true,
      color: COLOR.gris,
      charSpace: 0.4,
    })
    l.texto(l.recortar(t.valor, anchoTile - 16, { size: 12, bold: true }), x + 8, y + 31, {
      size: 12,
      bold: true,
      color: COLOR.acentoOscuro,
    })
    l.texto(t.nota, x + 8, y + 41, { size: 6.5, color: COLOR.gris })
  })

  y += alto + 10

  l.rect(izq, y, ancho, 40, { relleno: COLOR.tinta, radio: 4 })
  l.texto("EFECTIVO ESPERADO EN CAJA", izq + 8, y + 15, {
    size: 6.5,
    bold: true,
    color: COLOR.papel,
    charSpace: 0.4,
  })
  const esperado = caja.saldoEsperado ?? caja.saldoInicial
  l.texto(formatCurrency(esperado), izq + 8, y + 31, { size: 12, bold: true, color: COLOR.papel })

  return y + 40 + 22
}

function dibujarResultado(
  l: Lienzo,
  izq: number,
  der: number,
  ancho: number,
  caja: Caja,
  yInicial: number,
): number {
  if (caja.estado === "abierta") return yInicial

  let y = yInicial
  l.texto("Resultado del cierre", izq, y, { size: 10.5, bold: true, color: COLOR.acentoOscuro })
  y += 12
  l.linea(izq, y, der, y, COLOR.lineaSuave)
  y += 16

  const dif = caja.diferencia ?? 0
  const filas: [string, string, boolean?][] = [
    ["Esperado en caja", formatCurrency(caja.saldoEsperado ?? 0)],
    ["Contado en caja", formatCurrency(caja.saldoDeclarado ?? 0)],
    [
      "Diferencia",
      `${dif > 0 ? "+" : ""}${formatCurrency(dif)} ${Math.abs(dif) < 1 ? "(cuadra)" : ""}`.trim(),
      true,
    ],
  ]

  filas.forEach(([rotulo, valor, destacar]) => {
    l.texto(rotulo, izq, y, { size: 9, color: COLOR.gris })
    l.texto(valor, der, y, {
      size: 9.5,
      bold: true,
      align: "right",
      color: destacar && Math.abs(dif) >= 1 ? COLOR.rojo : COLOR.tinta,
    })
    y += 16
    l.linea(izq, y - 5, der, y - 5, COLOR.lineaSuave)
  })

  return y + 10
}

function dibujarNotas(l: Lienzo, izq: number, ancho: number, notas: string, yInicial: number): number {
  const y = yInicial
  l.rect(izq, y, ancho, 28, { relleno: COLOR.cebra, radio: 4 })
  l.texto(l.recortar(`Notas: ${notas}`, ancho - PAD * 2, { size: 8.5 }), izq + PAD, y + 17, {
    size: 8.5,
    color: COLOR.gris,
  })
  return y + 28 + 18
}

/** Columnas del detalle: sin hoja de ruta, esto no es un reparto. */
const COL = { numero: 70, hora: 46, pago: 66, monto: 90 }

function dibujarDetalle(
  l: Lienzo,
  izq: number,
  der: number,
  ancho: number,
  vigentes: Venta[],
  yInicial: number,
): void {
  const xNumero = der - COL.monto - COL.pago - COL.hora - COL.numero
  const xHora = der - COL.monto - COL.pago - COL.hora
  const xPago = der - COL.monto - COL.pago
  const xMonto = der - PAD
  const finCliente = xNumero - 10

  l.texto(`Detalle de ventas (${vigentes.length})`, izq, yInicial, {
    size: 10.5,
    bold: true,
    color: COLOR.acentoOscuro,
  })

  let y = yInicial + 12
  const yTopePagina = l.alto - MARGEN - 16

  const encabezadoTabla = () => {
    l.rect(izq, y, ancho, 18, { relleno: COLOR.tinta, radio: 3 })
    const yRot = y + 12
    l.texto("CLIENTE", izq + PAD, yRot, { size: 6.5, bold: true, color: COLOR.papel, charSpace: 0.5 })
    l.texto("N°", xNumero, yRot, { size: 6.5, bold: true, color: COLOR.papel, charSpace: 0.5 })
    l.texto("HORA", xHora, yRot, { size: 6.5, bold: true, color: COLOR.papel, charSpace: 0.5 })
    l.texto("PAGO", xPago, yRot, { size: 6.5, bold: true, color: COLOR.papel, charSpace: 0.5 })
    l.texto("MONTO", xMonto, yRot, {
      size: 6.5, bold: true, color: COLOR.papel, charSpace: 0.5, align: "right",
    })
    y += 18
  }

  encabezadoTabla()

  if (vigentes.length === 0) {
    l.texto("Sin ventas en este turno", izq + PAD, y + 14, { size: 9, color: COLOR.gris })
    return
  }

  vigentes.forEach((venta, i) => {
    const ALTO_FILA = 18

    if (y + ALTO_FILA > yTopePagina) {
      l.doc.addPage()
      y = MARGEN
      encabezadoTabla()
    }

    if (i % 2 === 1) l.rect(izq, y, ancho, ALTO_FILA, { relleno: COLOR.cebra })

    const yTexto = y + 12
    l.texto(
      l.recortar(venta.clienteNombre || "Consumidor final", finCliente - izq - PAD, { size: 8.5 }),
      izq + PAD,
      yTexto,
      { size: 8.5 },
    )
    l.texto(`#${String(venta.numero).padStart(4, "0")}`, xNumero, yTexto, {
      size: 8, color: COLOR.gris,
    })
    l.texto(formatDateTime(venta.createdAt).split(" ")[1] ?? "", xHora, yTexto, {
      size: 8, color: COLOR.gris,
    })
    l.texto(etiquetaMedioPago(venta.medioPago), xPago, yTexto, { size: 8 })
    l.texto(formatCurrency(venta.total), xMonto, yTexto, { size: 8.5, bold: true, align: "right" })

    y += ALTO_FILA
    l.linea(izq, y, der, y, COLOR.lineaSuave)
  })
}

/** Resuelve el logo, genera el PDF y dispara la descarga. */
export async function descargarCajaPDF(caja: Caja, ventas: Venta[], emisor: EmisorCaja): Promise<void> {
  const logo = await cargarLogo(emisor.logoUrl)
  generarCajaPDF(caja, ventas, emisor, logo).save(nombreArchivoCaja(caja))
}
