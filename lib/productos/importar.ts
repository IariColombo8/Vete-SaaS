import * as XLSX from "xlsx-js-style"
import type { FilaImportacion } from "@/lib/supabase/productos"

/**
 * Lectura y mapeo de una lista de precios en Excel.
 *
 * Corre entero en el navegador: solo las filas ya parseadas viajan al servidor
 * (RPC `importar_productos`), nunca el archivo.
 *
 * El proveedor entrega tres listas separadas (Medicamentos, Alimentos,
 * Accesorios) siempre con el mismo formato de columnas: A=código,
 * B=descripción, C=marca, D=precio (que en realidad es el costo, no el
 * precio de venta). No hay mapeo configurable: la categoría se elige antes de
 * subir el archivo y se aplica a todas las filas.
 */

export interface VistaPreviaHoja {
  columnas: string[]
  filasMuestra: string[][]
  totalFilas: number
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
        resolve({
          workbook,
          vistaPrevia: {
            columnas: ["Código", "Descripción", "Marca", "Precio"],
            filasMuestra: filas.slice(0, 6).map((f) => f.map((c) => String(c ?? ""))),
            totalFilas: filas.length,
          },
        })
      } catch {
        reject(new Error("El archivo no parece ser un Excel válido"))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

export interface FilaParseada extends FilaImportacion {
  numeroFila: number
  advertencias: string[]
}

/**
 * Convierte cualquier formato de precio que suelta un Excel a número:
 * "$ 1.234,56" (AR), "1,234.56" (US), "1.234" o "1234" (General/Number sin
 * separador de miles claro), con o sin símbolo de moneda.
 *
 * No alcanza con "si hay coma es decimal": un proveedor que exporta en
 * formato "General" o con configuración regional en inglés manda el punto
 * como decimal y la coma como separador de miles, o directamente un entero
 * con puntos de miles y sin parte decimal ("$ 1.080.000"). Tratar ese último
 * caso como si el punto fuera decimal da `Number("1.080.000")` → `NaN` → se
 * reporta como "precio en cero" aunque el precio real sea mucho mayor a cero.
 *
 * Regla: si aparecen los dos separadores, el que aparece último (más a la
 * derecha) es el decimal y el otro son miles. Si aparece uno solo, es decimal
 * únicamente cuando queda exactamente una vez y con 1 o 2 dígitos después
 * (el patrón de un precio con centavos); en cualquier otro caso —incluida más
 * de una aparición— se trata como separador de miles y se descarta.
 */
function aNumero(texto: string): number {
  const limpio = texto.replace(/[^\d,.-]/g, "").trim()
  if (!limpio) return 0

  const tieneComa = limpio.includes(",")
  const tienePunto = limpio.includes(".")
  let normalizado = limpio

  if (tieneComa && tienePunto) {
    normalizado =
      limpio.lastIndexOf(",") > limpio.lastIndexOf(".")
        ? limpio.replace(/\./g, "").replace(",", ".")
        : limpio.replace(/,/g, "")
  } else if (tieneComa) {
    const partes = limpio.split(",")
    normalizado =
      partes.length === 2 && partes[1].length <= 2
        ? limpio.replace(",", ".")
        : limpio.replace(/,/g, "")
  } else if (tienePunto) {
    const partes = limpio.split(".")
    normalizado = partes.length === 2 && partes[1].length <= 2 ? limpio : limpio.replace(/\./g, "")
  }

  const n = Number(normalizado)
  return Number.isFinite(n) ? n : 0
}

/**
 * El Excel del proveedor trae la marca/distribuidor con un asterisco colgado
 * al final ("APM FOOD *", "GARAY S.R.L *"): es un artefacto de cómo exportan
 * la lista, no parte del nombre.
 */
export function limpiarMarca(texto: string): string {
  return texto.trim().replace(/\s*\*\s*$/, "").trim()
}

/**
 * Casi toda descripción de alimento trae el peso de la bolsa como
 * "X 10 KG" o "X 500 GRS" (a veces con punto: "X 100 GR."). Cuando la marca
 * se repite al final de la descripción puede aparecer más de una vez el
 * patrón "X ... KG" — se toma la última, que es la que describe la
 * presentación real (la primera repetición suele ser ruido del nombre).
 *
 * Devuelve el peso siempre en kilos (los gramos se dividen por 1000), o
 * `undefined` si la descripción no trae ningún patrón reconocible.
 */
export function detectarPesoKg(descripcion: string): number | undefined {
  // La "X" es opcional: "VITALFUN ARENA ... 6 KG VITALFUN" no la trae, a
  // diferencia de "HANDLER ... X 10 KG HANDLER". El "(x 12 u)" que traen los
  // packs de sobres no interfiere porque su unidad ("u") no está en la lista.
  const coincidencias = [...descripcion.matchAll(/(?:X\s*)?([\d.,]+)\s*(KGS?|GRS?|G)\.?\b/gi)]
  if (coincidencias.length === 0) return undefined

  const [, numero, unidad] = coincidencias[coincidencias.length - 1]
  const esGramos = /^(GRS?|G)$/i.test(unidad)
  // En gramos el punto es separador de miles (nadie vende "120,5 gramos");
  // en kilos, el punto es decimal como en el resto del archivo.
  const normalizado = esGramos ? numero.replace(/\./g, "").replace(",", ".") : numero.replace(",", ".")
  const valor = Number(normalizado)
  if (!Number.isFinite(valor) || valor <= 0) return undefined

  const enKg = esGramos ? valor / 1000 : valor
  return Math.round(enKg * 1000) / 1000
}

/**
 * Columnas fijas: A=código, B=descripción, C=marca, D=costo. El precio de
 * venta se inicializa igual al costo — se corrige después con la herramienta
 * de margen de ganancia, no acá.
 */
export function parsearFilas(
  workbook: XLSX.WorkBook,
  categoria: string,
  filaInicio: number,
): FilaParseada[] {
  const filas = filasCrudas(workbook)
  const resultado: FilaParseada[] = []

  filas.slice(filaInicio - 1).forEach((fila, i) => {
    if (fila.every((c) => String(c ?? "").trim() === "")) return

    const leer = (j: number) => String(fila[j] ?? "").trim()

    const codigo = leer(0)
    const descripcion = leer(1)
    const marca = limpiarMarca(leer(2))
    const costo = aNumero(leer(3))

    if (!descripcion && !codigo) return

    const pesoKg = detectarPesoKg(descripcion)

    const advertencias: string[] = []
    if (!descripcion) advertencias.push("sin descripción")
    if (costo <= 0) advertencias.push("precio en cero")
    if (!codigo) advertencias.push("sin código")
    // No todos los alimentos tienen un peso real (cajas de regalo, combos):
    // no detectarlo no es un error de la fila, se completa a mano si hace falta.

    resultado.push({
      numeroFila: filaInicio + i,
      barra: "",
      codigo,
      descripcion,
      marca,
      unidad: "un",
      pesoKg,
      categoria,
      precio: costo,
      costo,
      rubro: "",
      subrubro: "",
      stock: 0,
      revisar: advertencias.length > 0,
      advertencias,
    })
  })

  return resultado
}
