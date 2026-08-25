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
 * "$ 1.234,56" → 1234.56. Los proveedores exportan con separador de miles y
 * coma decimal; parsear eso con `Number()` directo da NaN o un número 100x.
 */
function aNumero(texto: string): number {
  const limpio = texto.replace(/[^\d,.-]/g, "")
  if (!limpio) return 0
  const normalizado = limpio.includes(",")
    ? limpio.replace(/\./g, "").replace(",", ".")
    : limpio
  const n = Number(normalizado)
  return Number.isFinite(n) ? n : 0
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
    const marca = leer(2)
    const costo = aNumero(leer(3))

    if (!descripcion && !codigo) return

    const advertencias: string[] = []
    if (!descripcion) advertencias.push("sin descripción")
    if (costo <= 0) advertencias.push("precio en cero")
    if (!codigo) advertencias.push("sin código")

    resultado.push({
      numeroFila: filaInicio + i,
      barra: "",
      codigo,
      descripcion,
      marca,
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
