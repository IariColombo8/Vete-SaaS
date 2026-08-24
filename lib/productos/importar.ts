import * as XLSX from "xlsx-js-style"
import type { FilaImportacion } from "@/lib/supabase/productos"

/**
 * Lectura y mapeo de una lista de precios en Excel.
 *
 * Corre entero en el navegador: solo las filas ya parseadas viajan al servidor
 * (RPC `importar_productos`), nunca el archivo.
 *
 * El mapeo se hace por letra de columna (A, B, C…) y no por el texto del
 * encabezado, porque las listas de precios de los proveedores casi nunca traen
 * encabezados reales: vienen con el logo en la fila 1, títulos combinados, o
 * directamente sin nada.
 */

export type CampoImport =
  | "barra"
  | "codigo"
  | "descripcion"
  | "precio"
  | "costo"
  | "rubro"
  | "subrubro"
  | "stock"
  | "bulto"

export const ETIQUETAS_CAMPO: Record<CampoImport, string> = {
  barra: "Código de barras",
  codigo: "Código interno",
  descripcion: "Descripción / Nombre",
  precio: "Precio de venta",
  costo: "Costo (opcional, para el margen)",
  rubro: "Rubro",
  subrubro: "Subrubro",
  stock: "Stock",
  bulto: "Unidades por bulto",
}

/** Campo → letra de columna de Excel. */
export type MapeoColumnas = Partial<Record<CampoImport, string>>

export interface VistaPreviaHoja {
  columnas: string[]
  filasMuestra: string[][]
}

function indiceALetra(i: number): string {
  let n = i
  let s = ""
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

function letraAIndice(letra?: string): number {
  if (!letra) return -1
  let n = 0
  for (const ch of letra.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function filasCrudas(workbook: XLSX.WorkBook): string[][] {
  const hoja = workbook.Sheets[workbook.SheetNames[0]]
  if (!hoja) return []
  return XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: "" }) as string[][]
}

export function leerArchivo(
  file: File,
): Promise<{ workbook: XLSX.WorkBook; vistaPrevia: VistaPreviaHoja }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"))
    reader.onload = () => {
      try {
        const workbook = XLSX.read(new Uint8Array(reader.result as ArrayBuffer), { type: "array" })
        const filas = filasCrudas(workbook)
        if (filas.length === 0) {
          reject(new Error("La primera hoja del archivo está vacía"))
          return
        }
        const anchoMaximo = filas.reduce((max, f) => Math.max(max, f.length), 0)
        resolve({
          workbook,
          vistaPrevia: {
            columnas: Array.from({ length: anchoMaximo }, (_, i) => indiceALetra(i)),
            filasMuestra: filas.slice(0, 6).map((f) => f.map((c) => String(c ?? ""))),
          },
        })
      } catch {
        reject(new Error("El archivo no parece ser un Excel válido"))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

const PATRONES: Record<CampoImport, RegExp> = {
  barra: /barra|c[oó]d.*barra|ean/i,
  codigo: /^c[oó]digo$|^cod\.?$|sku|art[ií]culo/i,
  descripcion: /descrip|nombre|producto|detalle/i,
  precio: /precio|venta|p\.?v\.?p|cons\.?\s*final|p[uú]blico/i,
  costo: /costo|compra|neto/i,
  rubro: /rubro|categor|familia/i,
  subrubro: /subrubro|sub.?categor|sub.?familia/i,
  stock: /stock|cantidad|existencia/i,
  bulto: /bulto|paquete|lote|unid.*x|x.*caja/i,
}

/** Adivina el mapeo mirando una fila, por si el archivo sí trae encabezados. */
export function adivinarMapeo(filaEncabezado: string[]): MapeoColumnas {
  const mapeo: MapeoColumnas = {}
  for (const campo of Object.keys(PATRONES) as CampoImport[]) {
    const idx = filaEncabezado.findIndex((h) => PATRONES[campo].test(String(h ?? "")))
    if (idx >= 0) mapeo[campo] = indiceALetra(idx)
  }
  return mapeo
}

// El mapeo se guarda por tenant: cada veterinaria trabaja con su proveedor y su
// formato de lista, y el archivo del mes que viene va a venir igual que el de hoy.
const claveStorage = (tenantId: string) => `vetpanel:import-productos:${tenantId}`

export interface ConfigImport {
  mapeo: MapeoColumnas
  filaInicio: number
}

export function cargarMapeoGuardado(tenantId: string): ConfigImport | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(claveStorage(tenantId))
    return raw ? (JSON.parse(raw) as ConfigImport) : null
  } catch {
    return null
  }
}

export function guardarMapeo(tenantId: string, config: ConfigImport): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(claveStorage(tenantId), JSON.stringify(config))
  } catch {
    // localStorage lleno o deshabilitado: recordar el mapeo es una comodidad,
    // no una condición para importar.
  }
}

export interface FilaParseada extends FilaImportacion {
  numeroFila: number
  advertencias: string[]
}

/**
 * "$ 1.234,56" → 1234.56. Los proveedores exportan con separador de miles y
 * coma decimal; parsear eso con `Number()` directo da NaN o un número 100x.
 */
function aNumero(texto: string): number {
  const limpio = texto.replace(/[^\d,.-]/g, "")
  if (!limpio) return 0
  // Si hay coma, es el separador decimal y los puntos son de miles.
  const normalizado = limpio.includes(",")
    ? limpio.replace(/\./g, "").replace(",", ".")
    : limpio
  const n = Number(normalizado)
  return Number.isFinite(n) ? n : 0
}

export function parsearFilas(
  workbook: XLSX.WorkBook,
  mapeo: MapeoColumnas,
  filaInicio: number,
): FilaParseada[] {
  const filas = filasCrudas(workbook)
  const idx = Object.fromEntries(
    (Object.keys(ETIQUETAS_CAMPO) as CampoImport[]).map((c) => [c, letraAIndice(mapeo[c])]),
  ) as Record<CampoImport, number>

  const resultado: FilaParseada[] = []

  filas.slice(filaInicio - 1).forEach((fila, i) => {
    if (fila.every((c) => String(c ?? "").trim() === "")) return

    const leer = (j: number) => (j >= 0 ? String(fila[j] ?? "").trim() : "")

    const barra = leer(idx.barra)
    const codigo = leer(idx.codigo)
    const descripcion = leer(idx.descripcion)
    const precio = aNumero(leer(idx.precio))
    const costoTexto = leer(idx.costo)
    const costo = costoTexto ? aNumero(costoTexto) : undefined
    const rubro = leer(idx.rubro)
    const subrubro = leer(idx.subrubro)
    const stock = aNumero(leer(idx.stock))
    const bultoTexto = leer(idx.bulto).replace(/[^\d]/g, "")
    const bulto = bultoTexto ? Number(bultoTexto) : undefined

    // Sin nombre ni código no hay producto: suele ser una fila de subtotal o
    // un separador visual de la planilla.
    if (!descripcion && !barra && !codigo) return

    const advertencias: string[] = []
    if (!descripcion) advertencias.push("sin descripción")
    if (precio <= 0) advertencias.push("precio en cero")
    if (!barra && !codigo) advertencias.push("sin código")
    if (!rubro) advertencias.push("sin rubro")

    resultado.push({
      numeroFila: filaInicio + i,
      barra,
      codigo,
      descripcion,
      precio,
      costo,
      rubro,
      subrubro,
      stock,
      bulto,
      revisar: advertencias.length > 0,
      advertencias,
    })
  })

  return resultado
}
