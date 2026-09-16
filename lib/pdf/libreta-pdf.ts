import { jsPDF } from "jspdf"
import type { Cliente, Historia, Mascota, Modalidad, Turno } from "@/lib/supabase/queries"
import { getRecordatoriosVacunaByMascota } from "@/lib/supabase/queries"
import { formatFechaISO } from "@/lib/format"
import { cargarLogo } from "@/lib/ventas/remito"
import { COLOR, Lienzo } from "@/lib/ventas/remito-layout"

/**
 * PDF de la libreta sanitaria de una mascota, para entregarle al dueño.
 *
 * Reusa las primitivas de `remito-layout.ts` (tarjetas con bordes
 * redondeados, tablas con cebra, logo a data URL) para no reinventar el
 * mismo dibujo de bajo nivel que ya resolvió el remito.
 *
 * Estructura (de arriba a abajo):
 *   1. Identidad de la veterinaria (logo, nombre, contacto, modalidad)
 *   2. Ficha de la mascota (datos + foto)
 *   3. Datos del responsable
 *   4. Registro de desparasitación (tabla en blanco: no hay tracking digital)
 *   5. Carnet de vacunación (a partir de `Turno.vacunas` + recordatorios)
 *   6. Historial clínico (una tarjeta por consulta)
 *   7. Pie de página
 *
 * Solo se muestran datos que existen en el sistema — no se inventan campos
 * (fecha de nacimiento, sexo, color, matrícula) que la veterinaria nunca
 * cargó: esos salen como "—".
 */

const MARGEN = 40
const PAD = 14
const FILAS_TABLA_MIN = 6
const ALTO_FILA_TABLA = 20

const MODALIDAD_LABEL: Record<Modalidad, string> = {
  local: "Atención en consultorio",
  domicilio: "Atención a domicilio",
  ambos: "Consultorio y a domicilio",
}

export interface VeterinariaLibreta {
  nombre?: string
  logoUrl?: string
  telefono?: string
  direccion?: string
  modalidad?: Modalidad
}

interface GenerarLibretaPDFParams {
  tenantId: string
  veterinaria: VeterinariaLibreta
  cliente: Pick<Cliente, "nombre" | "telefono" | "email" | "dni" | "domicilio">
  mascota: Mascota
  historias: Historia[]
  /** Turnos de esta mascota (cualquier estado): de acá se sacan las vacunas aplicadas. */
  turnos?: Turno[]
}

function nombreArchivoLibreta(nombreMascota: string): string {
  const slug = (nombreMascota || "mascota").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-")
  return `libreta-sanitaria-${slug}.pdf`
}

/**
 * Todas las vacunas/medicamentos/desparasitaciones cargadas en historias,
 * en una lista plana. Dos formas en que pueden estar guardadas:
 *  - `Historia.aplicaciones[]`: una nota combinada (varios ítems, una fecha).
 *  - `Historia.productoAplicado` + `tipoVisita`: entradas viejas, de antes de
 *    que existiera `aplicaciones` — una por historia.
 */
function extraerAplicacionesPlanas(
  historias: Historia[],
): { fecha: string; tipo: string; nombre: string; proximaInline: string | undefined }[] {
  const deAplicaciones = historias.flatMap((h) =>
    (h.aplicaciones ?? []).map((a) => ({ fecha: h.fechaAtencion, tipo: a.tipo, nombre: a.nombre, proximaInline: a.proxima }))
  )
  const deLegado = historias
    .filter((h) => !h.aplicaciones?.length && h.tipoVisita && ["vacuna", "medicamento", "desparasitacion"].includes(h.tipoVisita) && h.productoAplicado?.trim())
    .map((h) => ({ fecha: h.fechaAtencion, tipo: h.tipoVisita!, nombre: h.productoAplicado!.trim(), proximaInline: h.proximaVisita }))
  return [...deAplicaciones, ...deLegado]
}

/**
 * Filas de un registro de vacunación. Dos fuentes:
 *  - `Turno.vacunas`: lo tildado en un turno (camino histórico).
 *  - `Historia.aplicaciones` (tipo "vacuna"): lo cargado desde la Libreta
 *    (camino actual) — ya trae su propia próxima dosis, sin depender de un
 *    recordatorio aparte.
 */
async function obtenerFilasVacunacion(
  tenantId: string,
  mascotaId: string | undefined,
  turnos: Turno[],
  historias: Historia[],
): Promise<{ fecha: string; nombre: string; proxima: string }[]> {
  const deTurnos = turnos
    .filter((t) => (t.vacunas?.length ?? 0) > 0)
    .flatMap((t) => (t.vacunas ?? []).map((nombre) => ({
      fecha: t.turno?.fecha || t.fecha || "",
      nombre,
      proximaInline: undefined as string | undefined,
    })))

  const deHistorias = extraerAplicacionesPlanas(historias).filter((a) => a.tipo === "vacuna")

  const todas = [...deTurnos, ...deHistorias].sort((a, b) => b.fecha.localeCompare(a.fecha))
  if (todas.length === 0) return []

  const pendientes = mascotaId ? await getRecordatoriosVacunaByMascota(tenantId, mascotaId).catch(() => []) : []

  return todas.map(({ fecha, nombre, proximaInline }) => {
    if (proximaInline) return { fecha: formatFechaISO(fecha), nombre, proxima: formatFechaISO(proximaInline) }
    const proxima = pendientes.find(
      (p) => !p.enviado && p.vacuna.trim().toLowerCase() === nombre.toLowerCase(),
    )
    return { fecha: formatFechaISO(fecha), nombre, proxima: proxima ? formatFechaISO(proxima.fecha) : "—" }
  })
}

/** Filas del registro de desparasitación, a partir de `Historia.aplicaciones` (tipo "desparasitacion"). */
function obtenerFilasDesparasitacion(historias: Historia[]): { fecha: string; nombre: string; proxima: string }[] {
  return extraerAplicacionesPlanas(historias)
    .filter((a) => a.tipo === "desparasitacion")
    .map((a) => ({
      fecha: formatFechaISO(a.fecha),
      nombre: a.nombre,
      proxima: a.proximaInline ? formatFechaISO(a.proximaInline) : "—",
    }))
}

/** Encabezado de tabla con fondo suave, y las filas dadas + filas en blanco hasta el mínimo. */
function dibujarTabla(
  l: Lienzo,
  x: number,
  y: number,
  ancho: number,
  columnas: { titulo: string; ancho: number }[],
  filas: string[][],
): number {
  const alturaEncabezado = 22
  l.rect(x, y, ancho, alturaEncabezado, { relleno: COLOR.acentoSuave })
  let cx = x
  for (const col of columnas) {
    l.rotulo(col.titulo, cx + 8, y + 14)
    cx += col.ancho
  }
  let fy = y + alturaEncabezado

  const totalFilas = Math.max(filas.length, FILAS_TABLA_MIN)
  for (let i = 0; i < totalFilas; i++) {
    if (i % 2 === 1) l.rect(x, fy, ancho, ALTO_FILA_TABLA, { relleno: COLOR.cebra })
    const fila = filas[i]
    if (fila) {
      let cxv = x
      fila.forEach((valor, idx) => {
        l.texto(l.recortar(valor || "—", columnas[idx].ancho - 16, { size: 9 }), cxv + 8, fy + 13, { size: 9 })
        cxv += columnas[idx].ancho
      })
    }
    fy += ALTO_FILA_TABLA
  }
  l.rect(x, y, ancho, fy - y, { borde: COLOR.linea, radio: 4 })
  // Líneas divisorias entre columnas y filas, sutiles.
  let cxLinea = x
  for (const col of columnas.slice(0, -1)) {
    cxLinea += col.ancho
    l.linea(cxLinea, y, cxLinea, fy, COLOR.lineaSuave)
  }
  for (let i = 1; i < totalFilas; i++) {
    l.linea(x, y + alturaEncabezado + i * ALTO_FILA_TABLA, x + ancho, y + alturaEncabezado + i * ALTO_FILA_TABLA, COLOR.lineaSuave)
  }
  return fy
}

export async function generarLibretaPDF(params: GenerarLibretaPDFParams): Promise<void> {
  const { tenantId, veterinaria, cliente, mascota, turnos = [] } = params
  // Filtro de privacidad: una nota marcada "esPrivada" es solo para el staff.
  // Este PDF lo recibe el dueño de la mascota, así que nunca puede incluirlas.
  const historias = [...params.historias]
    .filter((h) => h.esPrivada !== true)
    .sort((a, b) => (b.fechaAtencion ?? "").localeCompare(a.fechaAtencion ?? ""))

  const [logo, foto, filasVacunacion] = await Promise.all([
    cargarLogo(veterinaria.logoUrl),
    cargarLogo(mascota.fotoUrl),
    obtenerFilasVacunacion(tenantId, mascota.id, turnos, historias),
  ])
  const filasDesparasitacion = obtenerFilasDesparasitacion(historias)

  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const l = new Lienzo(doc)
  const anchoUtil = l.ancho - MARGEN * 2
  let y = MARGEN

  const nuevaPagina = () => {
    dibujarPie(l, doc.getNumberOfPages())
    doc.addPage()
    y = MARGEN
    l.texto(`Libreta sanitaria — ${mascota.nombre || "mascota"} (continuación)`, MARGEN, y, {
      size: 8, color: COLOR.gris,
    })
    y += 18
  }

  const asegurarEspacio = (alto: number) => {
    if (y + alto > l.alto - MARGEN - 30) nuevaPagina()
  }

  // ── 1. Identidad de la veterinaria ──
  const ALTO_HEADER = 96
  l.rect(MARGEN, y, anchoUtil, ALTO_HEADER, { relleno: COLOR.acentoSuave, radio: 8 })
  let xLogo = MARGEN + PAD
  if (logo) {
    const CAJA = 52
    const escala = Math.min(CAJA / logo.ancho, CAJA / logo.alto)
    const w = logo.ancho * escala
    const h = logo.alto * escala
    doc.addImage(logo.dataUrl, xLogo + (CAJA - w) / 2, y + PAD + (CAJA - h) / 2, w, h)
    xLogo += CAJA + 14
  }
  l.texto(veterinaria.nombre || "Veterinaria", xLogo, y + 34, { size: 16, bold: true, color: COLOR.acentoOscuro })
  const datosContacto = [veterinaria.direccion, veterinaria.telefono, veterinaria.modalidad ? MODALIDAD_LABEL[veterinaria.modalidad] : undefined]
    .filter(Boolean)
    .join("  ·  ")
  if (datosContacto) l.texto(datosContacto, xLogo, y + 52, { size: 9, color: COLOR.gris })

  l.texto("LIBRETA SANITARIA", MARGEN + anchoUtil - PAD, y + 30, { size: 15, bold: true, color: COLOR.acentoOscuro, align: "right" })
  l.texto(`${mascota.nombre || ""} · ${mascota.tipo || ""}`, MARGEN + anchoUtil - PAD, y + 48, { size: 10, bold: true, align: "right" })
  l.texto(`Generada el ${formatFechaISO(new Date().toISOString())}`, MARGEN + anchoUtil - PAD, y + 64, { size: 8, color: COLOR.gris, align: "right" })
  y += ALTO_HEADER + 16

  // ── 2. Ficha de la mascota (datos + foto) ──
  const FOTO_LADO = 92
  const anchoFicha = anchoUtil - FOTO_LADO - 14
  const camposMascota: [string, string][] = [
    ["Nombre", mascota.nombre || "—"],
    ["Especie", mascota.tipo || "—"],
    ["Raza", mascota.raza || "—"],
    ["Fecha de nacimiento", "—"],
    ["Sexo", mascota.sexo === "macho" ? "Macho" : mascota.sexo === "hembra" ? "Hembra" : "—"],
    ["Color", mascota.color || "—"],
    ["N° de chip", mascota.tieneChip ? (mascota.chipNumero || "Sí, sin número") : "No tiene"],
    ["Peso", mascota.peso || "—"],
  ]
  const filasCampos = Math.ceil(camposMascota.length / 2)
  const ALTO_TITULO_FICHA = 28
  const altoFichaMascota = ALTO_TITULO_FICHA + filasCampos * 20 + PAD
  asegurarEspacio(altoFichaMascota)

  l.rect(MARGEN, y, anchoUtil, altoFichaMascota, { borde: COLOR.linea, radio: 8 })
  l.rect(MARGEN, y, 4, altoFichaMascota, { relleno: COLOR.acento, radio: 0 })
  l.rotulo("Datos de la mascota", MARGEN + PAD, y + 20)
  l.linea(MARGEN + PAD, y + 26, MARGEN + anchoFicha - PAD, y + 26, COLOR.lineaSuave)

  const colAncho = (anchoFicha - PAD * 2) / 2
  camposMascota.forEach(([label, valor], i) => {
    const fila = Math.floor(i / 2)
    const col = i % 2
    const fx = MARGEN + PAD + col * colAncho
    const fy = y + ALTO_TITULO_FICHA + 12 + fila * 20
    l.rotulo(label, fx, fy)
    l.texto(l.recortar(valor, colAncho - 8, { size: 10, bold: true }), fx, fy + 12, { size: 10, bold: true })
  })

  // Recuadro de foto, a la derecha, como en las libretas físicas.
  const fotoX = MARGEN + anchoUtil - PAD - FOTO_LADO
  const fotoY = y + (altoFichaMascota - FOTO_LADO) / 2
  if (foto) {
    const escala = Math.min(FOTO_LADO / foto.ancho, FOTO_LADO / foto.alto)
    const w = foto.ancho * escala
    const h = foto.alto * escala
    l.rect(fotoX, fotoY, FOTO_LADO, FOTO_LADO, { borde: COLOR.linea, radio: 6 })
    doc.addImage(foto.dataUrl, fotoX + (FOTO_LADO - w) / 2, fotoY + (FOTO_LADO - h) / 2, w, h)
  } else {
    doc.setLineDashPattern([3, 2], 0)
    l.rect(fotoX, fotoY, FOTO_LADO, FOTO_LADO, { borde: COLOR.linea, radio: 6 })
    doc.setLineDashPattern([], 0)
    l.texto("Foto", fotoX + FOTO_LADO / 2, fotoY + FOTO_LADO / 2 + 3, { size: 9, color: COLOR.gris, align: "center" })
  }
  y += altoFichaMascota + 14

  // ── 3. Datos del responsable ──
  const camposDueno: [string, string][] = [
    ["Nombre y apellido", cliente.nombre || "—"],
    ["Domicilio", cliente.domicilio || "—"],
    ["Teléfono", cliente.telefono || "—"],
    ["Email", cliente.email || "—"],
    ["DNI", cliente.dni || "—"],
  ]
  const filasDueno = Math.ceil(camposDueno.length / 2)
  const altoDueno = ALTO_TITULO_FICHA + filasDueno * 20 + PAD
  asegurarEspacio(altoDueno)
  l.rect(MARGEN, y, anchoUtil, altoDueno, { borde: COLOR.linea, radio: 8 })
  l.rect(MARGEN, y, 4, altoDueno, { relleno: COLOR.acento })
  l.rotulo("Datos del responsable", MARGEN + PAD, y + 20)
  l.linea(MARGEN + PAD, y + 26, MARGEN + anchoUtil - PAD, y + 26, COLOR.lineaSuave)
  const colAnchoDueno = (anchoUtil - PAD * 2) / 2
  camposDueno.forEach(([label, valor], i) => {
    const fila = Math.floor(i / 2)
    const col = i % 2
    const fx = MARGEN + PAD + col * colAnchoDueno
    const fy = y + ALTO_TITULO_FICHA + 12 + fila * 20
    l.rotulo(label, fx, fy)
    l.texto(l.recortar(valor, colAnchoDueno - 8, { size: 10, bold: true }), fx, fy + 12, { size: 10, bold: true })
  })
  y += altoDueno + 20

  // ── 4. Registro de desparasitación ──
  asegurarEspacio(30)
  l.texto("Registro de desparasitación", MARGEN, y, { size: 12, bold: true, color: COLOR.acentoOscuro })
  y += 10
  const colsDesparasitacion = [
    { titulo: "Fecha", ancho: anchoUtil * 0.28 },
    { titulo: "Antiparasitario", ancho: anchoUtil * 0.44 },
    { titulo: "Próxima aplicación", ancho: anchoUtil * 0.28 },
  ]
  const filasDesparasitacionTexto = filasDesparasitacion.map((f) => [f.fecha, f.nombre, f.proxima])
  const altoTablaDesparasitacion = 22 + Math.max(filasDesparasitacionTexto.length, FILAS_TABLA_MIN) * ALTO_FILA_TABLA
  asegurarEspacio(altoTablaDesparasitacion + 14)
  y = dibujarTabla(l, MARGEN, y + 4, anchoUtil, colsDesparasitacion, filasDesparasitacionTexto)
  y += 20

  // ── 5. Carnet de vacunación ──
  asegurarEspacio(30)
  l.texto("Carnet de vacunación", MARGEN, y, { size: 12, bold: true, color: COLOR.acentoOscuro })
  y += 10
  const colsVacunacion = [
    { titulo: "Fecha de aplicación", ancho: anchoUtil * 0.28 },
    { titulo: "Vacuna aplicada", ancho: anchoUtil * 0.44 },
    { titulo: "Próxima dosis", ancho: anchoUtil * 0.28 },
  ]
  const filasVacunacionTexto = filasVacunacion.map((f) => [f.fecha, f.nombre, f.proxima])
  const altoTablaVacunacion = 22 + Math.max(filasVacunacionTexto.length, FILAS_TABLA_MIN) * ALTO_FILA_TABLA
  asegurarEspacio(altoTablaVacunacion + 14)
  y = dibujarTabla(l, MARGEN, y + 4, anchoUtil, colsVacunacion, filasVacunacionTexto)
  y += 24

  // ── 6. Historial clínico ──
  asegurarEspacio(30)
  l.texto("Historial clínico", MARGEN, y, { size: 12, bold: true, color: COLOR.acentoOscuro })
  y += 16

  if (historias.length === 0) {
    l.texto("Sin visitas registradas.", MARGEN, y, { size: 10, color: COLOR.gris })
    y += 20
  } else {
    for (const h of historias) {
      const lineas: string[] = []
      if (h.aplicaciones?.length) {
        for (const a of h.aplicaciones) {
          lineas.push(`${a.tipo === "vacuna" ? "Vacuna" : a.tipo === "medicamento" ? "Medicamento" : "Desparasitación"}: ${a.nombre}${a.indicaciones ? ` — ${a.indicaciones}` : ""}`)
        }
      } else {
        if (h.diagnostico) lineas.push(`Diagnóstico: ${h.diagnostico}`)
        if (h.tratamiento) lineas.push(`Tratamiento: ${h.tratamiento}`)
        if (h.observaciones) lineas.push(`Observaciones: ${h.observaciones}`)
      }
      if (h.proximaVisita) lineas.push(`Próxima visita: ${formatFechaISO(h.proximaVisita)}`)

      const anchoTextoCard = anchoUtil - PAD * 2
      const lineasEnvueltas = lineas.flatMap((texto) => doc.splitTextToSize(texto, anchoTextoCard) as string[])
      const altoCard = 30 + lineasEnvueltas.length * 13 + (h.archivos?.length ? 14 : 0) + 10

      asegurarEspacio(altoCard + 8)
      l.rect(MARGEN, y, anchoUtil, altoCard, { borde: COLOR.linea, relleno: COLOR.papel, radio: 6 })
      l.texto(formatFechaISO(h.fechaAtencion), MARGEN + PAD, y + 18, { size: 10, bold: true, color: COLOR.acentoOscuro })
      l.texto(l.recortar(h.motivo || "Consulta", anchoTextoCard - 90, { size: 10, bold: true }), MARGEN + PAD + 78, y + 18, { size: 10, bold: true })

      let ly = y + 32
      for (const linea of lineasEnvueltas) {
        l.texto(linea, MARGEN + PAD, ly, { size: 9 })
        ly += 13
      }
      if (h.archivos?.length) {
        l.rect(MARGEN + PAD, ly - 2, 90, 14, { relleno: COLOR.acentoSuave, radio: 7 })
        l.texto(`${h.archivos.length} adjunto${h.archivos.length > 1 ? "s" : ""}`, MARGEN + PAD + 8, ly + 8, { size: 8, color: COLOR.acentoOscuro })
      }
      y += altoCard + 8
    }
  }

  dibujarPie(l, doc.getNumberOfPages())

  doc.save(nombreArchivoLibreta(mascota.nombre || "mascota"))
}

function dibujarPie(l: Lienzo, pagina: number) {
  const y = l.alto - 24
  l.linea(MARGEN, y - 8, l.ancho - MARGEN, y - 8, COLOR.lineaSuave)
  l.texto(`Generado el ${formatFechaISO(new Date().toISOString())} · VetPanel`, MARGEN, y, { size: 7.5, color: COLOR.gris })
  l.texto(`Página ${pagina}`, l.ancho - MARGEN, y, { size: 7.5, color: COLOR.gris, align: "right" })
}
