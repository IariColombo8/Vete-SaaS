# Import de productos por categoría fija + margen de ganancia — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplificar el wizard de import de productos a 3 categorías fijas con columnas fijas (código/descripción/marca/costo), y agregar una herramienta separada para aplicar % de ganancia sobre el costo (a todos, por categoría, o a una selección de productos).

**Architecture:** Se reescribe `lib/productos/importar.ts` para parsear columnas fijas en vez de un mapeo configurable, y se simplifica `import-dialog.tsx` agregando un paso de selección de categoría. Se agrega una función pura `calcularPrecioConMargen` en `lib/productos/precios.ts`, una función de datos `aplicarMargen` en `lib/supabase/productos.ts` que actualiza `productos.precio` por lotes, un nuevo diálogo `margen-dialog.tsx`, y checkboxes de selección múltiple en `productos-management.tsx`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (postgres-js client), xlsx-js-style, Vitest.

---

## Task 1: Reescribir el parseo de `lib/productos/importar.ts`

**Files:**
- Modify: `lib/productos/importar.ts`
- Test: `lib/productos/importar.test.ts` (nuevo archivo)

Spec: sección "Parseo (`lib/productos/importar.ts`)" del design doc
(`docs/superpowers/specs/2026-08-25-import-productos-margen-design.md`).

Columnas fijas del Excel: A=código (índice 0), B=descripción (índice 1),
C=marca (índice 2), D=costo (índice 3). No hay código de barras ni
rubro/subrubro/stock/bulto en estos archivos.

- [ ] **Step 1: Escribir el test que falla primero**

Crear `lib/productos/importar.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx-js-style"
import { parsearFilas } from "./importar"

function workbookDeFilas(filas: (string | number)[][]): XLSX.WorkBook {
  const hoja = XLSX.utils.aoa_to_sheet(filas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, hoja, "Hoja1")
  return wb
}

describe("parsearFilas", () => {
  it("mapea código, descripción, marca y costo por columna fija", () => {
    const wb = workbookDeFilas([
      ["Encabezado A", "Encabezado B", "Encabezado C", "Encabezado D"],
      ["A001", "Amoxidal 500mg", "Bagó", "1250.50"],
    ])

    const filas = parsearFilas(wb, "Medicamentos", 2)

    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      numeroFila: 2,
      codigo: "A001",
      descripcion: "Amoxidal 500mg",
      marca: "Bagó",
      categoria: "Medicamentos",
      costo: 1250.5,
      precio: 1250.5,
      barra: "",
      stock: 0,
      revisar: false,
      advertencias: [],
    })
  })

  it("descarta una fila sin descripción y sin código", () => {
    const wb = workbookDeFilas([
      ["header"],
      ["", "", "", ""],
      ["", "", "", "1000"],
    ])

    const filas = parsearFilas(wb, "Alimentos", 2)

    expect(filas).toHaveLength(0)
  })

  it("marca advertencia cuando el costo es cero, pero no descarta la fila", () => {
    const wb = workbookDeFilas([
      ["header"],
      ["A002", "Correa de cuero", "", "0"],
    ])

    const filas = parsearFilas(wb, "Accesorios", 2)

    expect(filas).toHaveLength(1)
    expect(filas[0].advertencias).toContain("precio en cero")
  })

  it("marca advertencia cuando falta el código, pero no cuando falta la marca", () => {
    const wb = workbookDeFilas([
      ["header"],
      ["", "Pelota de goma", "", "500"],
    ])

    const filas = parsearFilas(wb, "Accesorios", 2)

    expect(filas).toHaveLength(1)
    expect(filas[0].advertencias).toEqual(["sin código"])
    expect(filas[0].marca).toBe("")
  })

  it("respeta la fila de inicio", () => {
    const wb = workbookDeFilas([
      ["Logo del proveedor"],
      ["Encabezado A", "Encabezado B", "Encabezado C", "Encabezado D"],
      ["A003", "Shampoo antipulgas", "Vetnil", "800"],
    ])

    const filas = parsearFilas(wb, "Accesorios", 3)

    expect(filas).toHaveLength(1)
    expect(filas[0].numeroFila).toBe(3)
    expect(filas[0].codigo).toBe("A003")
  })

  it("interpreta el separador de miles y coma decimal en el costo", () => {
    const wb = workbookDeFilas([
      ["header"],
      ["A004", "Alimento 15kg", "Royal Canin", "$ 45.990,50"],
    ])

    const filas = parsearFilas(wb, "Alimentos", 2)

    expect(filas[0].costo).toBeCloseTo(45990.5)
    expect(filas[0].precio).toBeCloseTo(45990.5)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/productos/importar.test.ts`
Expected: FAIL — `parsearFilas` todavía tiene la firma vieja
`(workbook, mapeo, filaInicio)`, así que `parsearFilas(wb, "Medicamentos", 2)`
no compila/no da los campos esperados.

- [ ] **Step 3: Reescribir `lib/productos/importar.ts`**

Reemplazar el contenido completo del archivo:

```typescript
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
  // Si hay coma, es el separador decimal y los puntos son de miles.
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

    // Sin nombre ni código no hay producto: suele ser una fila de subtotal o
    // un separador visual de la planilla.
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
      marca: marca || undefined,
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
```

Nota: `FilaImportacion` (en `lib/supabase/productos.ts`) no tiene hoy un campo
`marca` ni `categoria` — se agregan en el Task 2 antes de que esto compile.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/productos/importar.test.ts`
Expected: sigue en FAIL hasta terminar el Task 2 (faltan `marca` y `categoria`
en `FilaImportacion`). Anotar el error de tipo y continuar — se corrige en el
siguiente task antes del commit final de este archivo.

- [ ] **Step 5: No hacer commit todavía** — este task queda a medio terminar
hasta el Task 2 porque `FilaImportacion` vive en otro archivo. Continuar
directo al Task 2 sin commitear.

---

## Task 2: Agregar `marca` y `categoria` a `FilaImportacion` en `lib/supabase/productos.ts`

**Files:**
- Modify: `lib/supabase/productos.ts:547-558`

- [ ] **Step 1: Editar la interfaz `FilaImportacion`**

En `lib/supabase/productos.ts`, reemplazar:

```typescript
/** Una fila de la lista de precios, ya parseada y lista para mandar a la RPC. */
export interface FilaImportacion {
  barra: string
  codigo: string
  descripcion: string
  precio: number
  costo?: number
  rubro: string
  subrubro: string
  stock: number
  bulto?: number
  revisar: boolean
}
```

por:

```typescript
/** Una fila de la lista de precios, ya parseada y lista para mandar a la RPC. */
export interface FilaImportacion {
  barra: string
  codigo: string
  descripcion: string
  marca?: string
  categoria: string
  precio: number
  costo?: number
  rubro: string
  subrubro: string
  stock: number
  bulto?: number
  revisar: boolean
}
```

- [ ] **Step 2: Correr el test del Task 1 para verificar que ahora pasa**

Run: `npx vitest run lib/productos/importar.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 3: Verificar que el resto del proyecto sigue compilando**

Run: `npx tsc --noEmit`
Expected: van a aparecer errores en `components/admin/productos/import-dialog.tsx`
(todavía usa la firma vieja de `parsearFilas` y el mapeo de columnas) — eso es
esperado, se arregla en el Task 4. Confirmar que no hay OTROS errores nuevos
fuera de ese archivo.

- [ ] **Step 4: Commit**

```bash
git add lib/productos/importar.ts lib/productos/importar.test.ts lib/supabase/productos.ts
git commit -m "feat: parseo de import de productos por columnas fijas y categoria"
```

---

## Task 3: Verificar que la RPC `importar_productos` acepta `marca` y `categoria`

**Files:**
- Read only: `supabase/004_productos.sql`

Antes de tocar el diálogo, confirmar que la función de Postgres
`importar_productos` ya soporta los campos `marca` y `categoria` en el JSON de
filas que le llega (el resto del sistema ya guarda productos con `marca` y
`categoria` desde `createProducto`/`updateProducto`, así que es muy probable
que la RPC ya los acepte, pero hay que confirmarlo antes de asumirlo).

- [ ] **Step 1: Buscar la definición de la función**

Run: `grep -n "marca\|categoria" supabase/004_productos.sql`

- [ ] **Step 2: Leer el cuerpo de `importar_productos`**

Leer el archivo `supabase/004_productos.sql` completo (o al menos la función
`importar_productos`) para confirmar que el `jsonb` de cada fila que arma
`p_filas` mapea `marca` y `categoria` a las columnas `productos.marca` y
`productos.categoria`.

- [ ] **Step 3: Si falta el soporte, agregarlo**

Si la función no lee `marca` o `categoria` del JSON de la fila, agregar un
nuevo archivo de migración `supabase/007_import_marca_categoria.sql` que haga
`CREATE OR REPLACE FUNCTION importar_productos(...)` con esas dos columnas
incluidas en el `INSERT`/`UPDATE` de cada fila, preservando toda la lógica
existente (validación, `on conflict`, conteo de creados/actualizados/
omitidos/con advertencias/errores). Este paso solo aplica si el Step 2
confirma que falta soporte — si ya lo soporta, saltar directo al Step 4 sin
crear ningún archivo.

- [ ] **Step 4: Commit (solo si hubo cambios)**

```bash
git add supabase/007_import_marca_categoria.sql
git commit -m "fix: importar_productos guarda marca y categoria de cada fila"
```

Si no hubo cambios en este task, no hay nada que commitear — seguir directo al
Task 4.

---

## Task 4: Reescribir `import-dialog.tsx` con paso de categoría fija

**Files:**
- Modify: `components/admin/productos/import-dialog.tsx`

- [ ] **Step 1: Reemplazar el archivo completo**

```tsx
"use client"

import { useMemo, useState } from "react"
import {
  Upload, AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, FileSpreadsheet,
  Pill, Bone, PawPrint,
} from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  leerArchivo, parsearFilas,
  type FilaParseada,
} from "@/lib/productos/importar"
import { importarProductos, type EstrategiaStock, type ResumenImportacion } from "@/lib/supabase/productos"
import { cn } from "@/lib/utils"
import type * as XLSX from "xlsx-js-style"

interface Props {
  tenantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportado: () => void
}

type Paso = "categoria" | "archivo" | "revision" | "progreso" | "resultado"
type Categoria = "Medicamentos" | "Alimentos" | "Accesorios"

const CATEGORIAS: { value: Categoria; icon: typeof Pill; descripcion: string }[] = [
  { value: "Medicamentos", icon: Pill, descripcion: "Fármacos y productos veterinarios" },
  { value: "Alimentos", icon: Bone, descripcion: "Balanceados, snacks y suplementos" },
  { value: "Accesorios", icon: PawPrint, descripcion: "Correas, juguetes, higiene y demás" },
]

const ESTRATEGIAS: { value: EstrategiaStock; label: string; ayuda: string }[] = [
  { value: "no_tocar", label: "No tocar el stock", ayuda: "Solo actualiza precio, nombre y rubro" },
  { value: "reemplazar", label: "Reemplazar el stock", ayuda: "El stock pasa a ser el del Excel" },
  { value: "sumar", label: "Sumar al stock", ayuda: "El valor del Excel se suma al actual" },
  { value: "solo_nuevos", label: "Solo agregar nuevos", ayuda: "No modifica los productos existentes" },
]

/** Las filas se mandan de a tandas: cada una es una transacción en la base. */
const TAMANIO_LOTE = 200

export function ImportDialog({ tenantId, open, onOpenChange, onImportado }: Props) {
  const [paso, setPaso] = useState<Paso>("categoria")
  const [categoria, setCategoria] = useState<Categoria | null>(null)
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [totalFilasArchivo, setTotalFilasArchivo] = useState(0)
  const [filaInicio, setFilaInicio] = useState(2)
  const [filas, setFilas] = useState<FilaParseada[]>([])
  const [estrategia, setEstrategia] = useState<EstrategiaStock>("no_tocar")
  const [incluirConAdvertencias, setIncluirConAdvertencias] = useState(true)
  const [progreso, setProgreso] = useState({ hechas: 0, total: 0 })
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null)
  const [error, setError] = useState("")
  const [leyendo, setLeyendo] = useState(false)

  const reiniciar = () => {
    setPaso("categoria"); setCategoria(null); setWorkbook(null); setTotalFilasArchivo(0)
    setFilaInicio(2); setFilas([]); setEstrategia("no_tocar")
    setIncluirConAdvertencias(true); setProgreso({ hechas: 0, total: 0 })
    setResumen(null); setError("")
  }

  const cerrar = (abierto: boolean) => {
    if (!abierto) reiniciar()
    onOpenChange(abierto)
  }

  const elegirArchivo = async (file: File) => {
    setError("")
    setLeyendo(true)
    try {
      const { workbook: wb, vistaPrevia } = await leerArchivo(file)
      setWorkbook(wb)
      setTotalFilasArchivo(vistaPrevia.totalFilas)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo")
    } finally {
      setLeyendo(false)
    }
  }

  const irARevision = () => {
    if (!workbook || !categoria) return
    setFilas(parsearFilas(workbook, categoria, filaInicio))
    setPaso("revision")
  }

  const stats = useMemo(() => {
    const conAdvertencias = filas.filter((f) => f.advertencias.length > 0).length
    return { total: filas.length, conAdvertencias, ok: filas.length - conAdvertencias }
  }, [filas])

  const importar = async () => {
    const usables = incluirConAdvertencias
      ? filas
      : filas.filter((f) => f.advertencias.length === 0)
    const omitidasLocalmente = filas.length - usables.length

    setPaso("progreso")
    setProgreso({ hechas: 0, total: usables.length })
    setError("")

    const total: ResumenImportacion = {
      creados: 0, actualizados: 0, omitidos: omitidasLocalmente, conAdvertencias: 0, errores: 0,
    }

    try {
      for (let i = 0; i < usables.length; i += TAMANIO_LOTE) {
        const lote = usables.slice(i, i + TAMANIO_LOTE).map(
          ({ numeroFila: _n, advertencias: _a, ...fila }) => fila,
        )
        const r = await importarProductos(tenantId, lote, estrategia)
        total.creados += r.creados
        total.actualizados += r.actualizados
        total.omitidos += r.omitidos
        total.conAdvertencias += r.conAdvertencias
        total.errores += r.errores
        total.primerError ??= r.primerError
        setProgreso({ hechas: Math.min(i + TAMANIO_LOTE, usables.length), total: usables.length })
      }
      setResumen(total)
      onImportado()
    } catch (e) {
      // Las tandas ya confirmadas quedaron: se informa para que no se
      // reimporte todo a ciegas.
      setError(
        `${e instanceof Error ? e.message : "Error durante la importación"}. ` +
        `Se alcanzaron a procesar ${total.creados + total.actualizados} productos.`,
      )
      onImportado()
    } finally {
      setPaso("resultado")
    }
  }

  const porcentaje = progreso.total ? (progreso.hechas / progreso.total) * 100 : 0

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Importar lista de precios
          </DialogTitle>
          <DialogDescription>
            El Excel del proveedor trae código, descripción, marca y precio en ese orden.
          </DialogDescription>
        </DialogHeader>

        {paso === "categoria" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              ¿Qué lista de precios vas a importar?
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {CATEGORIAS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategoria(c.value)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors",
                    categoria === c.value
                      ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40"
                      : "hover:bg-muted",
                  )}
                >
                  <c.icon className="h-5 w-5" />
                  <span className="text-sm font-medium">{c.value}</span>
                  <span className="text-xs text-muted-foreground">{c.descripcion}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {paso === "archivo" && (
          <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors hover:bg-muted/50">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium">
                {workbook ? "Archivo cargado — elegí otro si querés cambiarlo" : "Elegí el archivo (.xlsx o .xls)"}
              </span>
              <input
                type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => e.target.files?.[0] && elegirArchivo(e.target.files[0])}
              />
            </label>

            {leyendo && <p className="text-center text-sm text-muted-foreground">Leyendo archivo…</p>}
            {error && <p className="text-center text-sm text-red-600">{error}</p>}

            {workbook && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {totalFilasArchivo} fila{totalFilasArchivo === 1 ? "" : "s"} leídas del archivo.
                  Categoría: <strong className="text-foreground">{categoria}</strong>.
                </p>
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">
                    Fila donde empiezan los datos
                  </Label>
                  <Input
                    type="number" min={1} value={filaInicio}
                    onChange={(e) => setFilaInicio(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {paso === "revision" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/60 p-3">
                <p className="text-lg font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Filas leídas</p>
              </div>
              <div className="rounded-lg bg-muted/60 p-3">
                <p className="text-lg font-bold text-emerald-600">{stats.ok}</p>
                <p className="text-xs text-muted-foreground">Sin problemas</p>
              </div>
              <div className="rounded-lg bg-muted/60 p-3">
                <p className="text-lg font-bold text-amber-600">{stats.conAdvertencias}</p>
                <p className="text-xs text-muted-foreground">Con advertencias</p>
              </div>
            </div>

            {stats.total === 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                No se leyó ninguna fila. Revisá la fila de inicio.
              </p>
            )}

            {stats.conAdvertencias > 0 && (
              <>
                <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    Incluir las filas con advertencias (quedan marcadas &ldquo;a revisar&rdquo;)
                  </span>
                  <Switch checked={incluirConAdvertencias} onCheckedChange={setIncluirConAdvertencias} />
                </label>

                <div className="max-h-32 overflow-y-auto rounded-lg border p-2 text-xs text-muted-foreground">
                  {filas
                    .filter((f) => f.advertencias.length > 0)
                    .slice(0, 20)
                    .map((f) => (
                      <p key={f.numeroFila} className="truncate">
                        Fila {f.numeroFila}: {f.descripcion || "(sin nombre)"} — {f.advertencias.join(", ")}
                      </p>
                    ))}
                </div>
              </>
            )}

            <div>
              <Label className="mb-2 block">Si el producto ya existe</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ESTRATEGIAS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setEstrategia(s.value)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      estrategia === s.value
                        ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40"
                        : "hover:bg-muted",
                    )}
                  >
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.ayuda}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {paso === "progreso" && (
          <div className="space-y-3 py-8">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all duration-200"
                style={{ width: `${porcentaje}%` }}
              />
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Procesando {progreso.hechas} de {progreso.total}…
            </p>
          </div>
        )}

        {paso === "resultado" && (
          <div className="space-y-3">
            {error && <p className="text-sm text-red-600">{error}</p>}
            {resumen && (
              <>
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Importación completada</span>
                </div>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>Creados: <strong className="text-foreground">{resumen.creados}</strong></li>
                  <li>Actualizados: <strong className="text-foreground">{resumen.actualizados}</strong></li>
                  <li>Omitidos: <strong className="text-foreground">{resumen.omitidos}</strong></li>
                  <li>Marcados a revisar: <strong className="text-foreground">{resumen.conAdvertencias}</strong></li>
                </ul>
                {resumen.errores > 0 && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                    {resumen.errores} fila{resumen.errores > 1 ? "s" : ""} no se pudo importar
                    {resumen.primerError && <> — la primera falló por: {resumen.primerError}</>}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {paso === "categoria" && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={!categoria}
              onClick={() => setPaso("archivo")}
            >
              Continuar <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          )}
          {paso === "archivo" && (
            <>
              <Button variant="outline" onClick={() => setPaso("categoria")}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Volver
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={!workbook}
                onClick={irARevision}
              >
                Continuar <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </>
          )}
          {paso === "revision" && (
            <>
              <Button variant="outline" onClick={() => setPaso("archivo")}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Volver
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={stats.total === 0}
                onClick={importar}
              >
                Confirmar importación
              </Button>
            </>
          )}
          {paso === "resultado" && (
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => cerrar(false)}>
              Cerrar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores relacionados a `import-dialog.tsx` ni a `importar.ts`.

- [ ] **Step 3: Correr toda la suite de tests**

Run: `npm run test`
Expected: PASS — incluye los 6 tests nuevos de `importar.test.ts` más todos
los existentes (`precios.test.ts`, `carrito.test.ts`, `remito.test.ts`, etc.).

- [ ] **Step 4: Probar manualmente en el navegador**

Run: `npm run dev`, entrar a `/[slug]/productos` con un tenant de prueba,
abrir "Importar", elegir "Medicamentos", subir un Excel de prueba con 2-3
filas (código, descripción, marca, precio en A-D), confirmar que la revisión
muestra las filas correctas y que al importar los productos quedan con
`categoria = "Medicamentos"` y `precio = costo`.

- [ ] **Step 5: Commit**

```bash
git add components/admin/productos/import-dialog.tsx
git commit -m "feat: wizard de import con categoria fija en vez de mapeo de columnas"
```

---

## Task 5: Función pura `calcularPrecioConMargen` en `lib/productos/precios.ts`

**Files:**
- Modify: `lib/productos/precios.ts`
- Modify: `lib/productos/precios.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `lib/productos/precios.test.ts`:

```typescript
import { calcularPrecioConMargen } from "./precios"

describe("calcularPrecioConMargen", () => {
  it("aplica el porcentaje sobre el costo", () => {
    expect(calcularPrecioConMargen(1000, 35)).toBe(1350)
  })

  it("redondea a 2 decimales", () => {
    expect(calcularPrecioConMargen(999.99, 33)).toBe(1329.99)
  })

  it("con 0% devuelve el mismo costo", () => {
    expect(calcularPrecioConMargen(500, 0)).toBe(500)
  })

  it("nunca devuelve negativo aunque el porcentaje sea negativo", () => {
    expect(calcularPrecioConMargen(500, -200)).toBe(0)
  })
})
```

(Nota: agregar el import `calcularPrecioConMargen` al bloque de imports
existente en la línea 1-11 del archivo, junto a los demás.)

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/productos/precios.test.ts`
Expected: FAIL — `calcularPrecioConMargen` no existe todavía.

- [ ] **Step 3: Implementar la función**

En `lib/productos/precios.ts`, agregar después de `margenPct` (línea 94):

```typescript
/**
 * Precio de venta a partir del costo y un % de ganancia.
 * `precio = costo × (1 + porcentaje / 100)`, siempre partiendo del costo
 * guardado — no es acumulativo sobre el precio de venta actual.
 */
export function calcularPrecioConMargen(costo: number, porcentaje: number): number {
  return round2(costo * (1 + porcentaje / 100))
}
```

`round2` ya existe en el archivo (línea 21-24) y ya trunca negativos a 0, así
que el caso de porcentaje negativo queda cubierto sin código extra.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/productos/precios.test.ts`
Expected: PASS — todos los tests del archivo, incluidos los 4 nuevos.

- [ ] **Step 5: Commit**

```bash
git add lib/productos/precios.ts lib/productos/precios.test.ts
git commit -m "feat: calculo puro de precio de venta a partir de costo y margen"
```

---

## Task 6: Función de datos `aplicarMargen` en `lib/supabase/productos.ts`

**Files:**
- Modify: `lib/supabase/productos.ts`

**Files:** este task no tiene test unitario propio porque hace queries
directas a Supabase (mismo patrón que `importarProductos`, `ajustarStock`,
etc., que tampoco tienen test unitario en este archivo — se validan
manualmente contra la base). El cálculo puro que usa ya está testeado en el
Task 5.

- [ ] **Step 1: Agregar el tipo de alcance y la función**

En `lib/supabase/productos.ts`, agregar al final del archivo (después de
`agruparPorMarca`, línea 660):

```typescript
// ── Margen de ganancia ──

import { calcularPrecioConMargen } from "@/lib/productos/precios"

export type AlcanceMargen =
  | { tipo: "todos" }
  | { tipo: "categoria"; categoria: string }
  | { tipo: "seleccion"; ids: string[] }

export interface ResultadoMargen {
  actualizados: number
  omitidosSinCosto: number
}

const TAMANIO_LOTE_MARGEN = 200

/**
 * Aplica `precio = costo × (1 + porcentaje / 100)` a los productos activos
 * del alcance elegido. Los que no tienen costo cargado (null o 0) se dejan
 * afuera y se cuentan aparte — no hay de dónde calcular su precio.
 */
export async function aplicarMargen(
  tenantId: string,
  porcentaje: number,
  alcance: AlcanceMargen,
): Promise<ResultadoMargen> {
  let q = supabase
    .from("productos")
    .select("id, costo")
    .eq("tenant_id", tenantId)
    .eq("activo", true)

  if (alcance.tipo === "categoria") {
    q = q.eq("categoria", alcance.categoria)
  } else if (alcance.tipo === "seleccion") {
    q = q.in("id", alcance.ids)
  }

  const { data, error } = await q
  if (error) throw mensajeError(error, "No se pudo leer el catálogo para aplicar el margen")

  const filas = (data ?? []) as { id: string; costo: number | null }[]
  const conCosto = filas.filter((f) => f.costo != null && f.costo > 0)
  const omitidosSinCosto = filas.length - conCosto.length

  for (let i = 0; i < conCosto.length; i += TAMANIO_LOTE_MARGEN) {
    const lote = conCosto.slice(i, i + TAMANIO_LOTE_MARGEN)
    await Promise.all(
      lote.map((f) =>
        supabase
          .from("productos")
          .update({ precio: calcularPrecioConMargen(f.costo as number, porcentaje) })
          .eq("tenant_id", tenantId)
          .eq("id", f.id),
      ),
    )
  }

  return { actualizados: conCosto.length, omitidosSinCosto }
}
```

- [ ] **Step 2: Mover el import al encabezado del archivo**

El `import { calcularPrecioConMargen } ...` del Step 1 no puede quedar en
medio del archivo — TypeScript lo permite pero rompe la convención del
proyecto de imports arriba. Cortarlo del punto donde se escribió y pegarlo
junto a los imports existentes en la línea 1-9 de
`lib/supabase/productos.ts`:

```typescript
import { supabase } from "./config"
import { calcularPrecioConMargen } from "@/lib/productos/precios"
import type {
  AjusteStockTipo,
  CambioPrecio,
  MovimientoStock,
  OfertaTipo,
  Producto,
  ProductoUnidad,
} from "./types"
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/productos.ts
git commit -m "feat: funcion aplicarMargen para actualizar precio a partir del costo"
```

---

## Task 7: Diálogo `margen-dialog.tsx`

**Files:**
- Create: `components/admin/productos/margen-dialog.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
"use client"

import { useState } from "react"
import { Percent, CheckCircle2 } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { aplicarMargen, type AlcanceMargen, type ResultadoMargen } from "@/lib/supabase/productos"
import { cn } from "@/lib/utils"

interface Props {
  tenantId: string
  categorias: string[]
  /** Ids de los productos tildados en el listado, si hay alguno. */
  seleccionIds: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onAplicado: () => void
}

type Modo = "todos" | "categoria" | "seleccion"

export function MargenDialog({
  tenantId, categorias, seleccionIds, open, onOpenChange, onAplicado,
}: Props) {
  const [modo, setModo] = useState<Modo>(seleccionIds.length > 0 ? "seleccion" : "todos")
  const [categoria, setCategoria] = useState(categorias[0] ?? "")
  const [porcentaje, setPorcentaje] = useState("")
  const [aplicando, setAplicando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoMargen | null>(null)
  const [error, setError] = useState("")

  const reiniciar = () => {
    setModo(seleccionIds.length > 0 ? "seleccion" : "todos")
    setPorcentaje(""); setAplicando(false); setResultado(null); setError("")
  }

  const cerrar = (abierto: boolean) => {
    if (!abierto) reiniciar()
    onOpenChange(abierto)
  }

  const porcentajeNumero = Number(porcentaje)
  const porcentajeValido = porcentaje.trim() !== "" && Number.isFinite(porcentajeNumero)
  const modoValido = modo !== "seleccion" || seleccionIds.length > 0

  const confirmar = async () => {
    if (!porcentajeValido || !modoValido) return

    const alcance: AlcanceMargen =
      modo === "todos"
        ? { tipo: "todos" }
        : modo === "categoria"
          ? { tipo: "categoria", categoria }
          : { tipo: "seleccion", ids: seleccionIds }

    setAplicando(true)
    setError("")
    try {
      const r = await aplicarMargen(tenantId, porcentajeNumero, alcance)
      setResultado(r)
      onAplicado()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar el margen")
    } finally {
      setAplicando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Percent className="h-4 w-4 text-emerald-600" /> Aplicar ganancia
          </DialogTitle>
          <DialogDescription>
            Calcula el precio de venta como costo × (1 + %), sobre el costo cargado de cada producto.
          </DialogDescription>
        </DialogHeader>

        {resultado ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Margen aplicado</span>
            </div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Actualizados: <strong className="text-foreground">{resultado.actualizados}</strong></li>
              <li>Omitidos sin costo: <strong className="text-foreground">{resultado.omitidosSinCosto}</strong></li>
            </ul>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setModo("todos")}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  modo === "todos" ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : "hover:bg-muted",
                )}
              >
                <p className="text-sm font-medium">A todos</p>
                <p className="text-xs text-muted-foreground">Todo el catálogo activo</p>
              </button>
              <button
                type="button"
                onClick={() => setModo("categoria")}
                disabled={categorias.length === 0}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  modo === "categoria" ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : "hover:bg-muted",
                )}
              >
                <p className="text-sm font-medium">Por categoría</p>
                <p className="text-xs text-muted-foreground">Un rubro puntual</p>
              </button>
              <button
                type="button"
                onClick={() => setModo("seleccion")}
                disabled={seleccionIds.length === 0}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  modo === "seleccion" ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : "hover:bg-muted",
                )}
              >
                <p className="text-sm font-medium">A selección</p>
                <p className="text-xs text-muted-foreground">
                  {seleccionIds.length > 0 ? `${seleccionIds.length} tildados` : "Tildá productos en la lista"}
                </p>
              </button>
            </div>

            {modo === "categoria" && (
              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">Categoría</Label>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                >
                  {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">% de ganancia</Label>
              <Input
                type="number" step="0.01" placeholder="Ej: 35"
                value={porcentaje}
                onChange={(e) => setPorcentaje(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        <DialogFooter>
          {resultado ? (
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => cerrar(false)}>
              Cerrar
            </Button>
          ) : (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={!porcentajeValido || !modoValido || aplicando}
              onClick={confirmar}
            >
              {aplicando ? "Aplicando…" : "Aplicar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores (fallará hasta que `productos-management.tsx` lo
importe correctamente en el Task 8, pero el archivo en sí mismo no debe tener
errores de tipos).

- [ ] **Step 3: Commit**

```bash
git add components/admin/productos/margen-dialog.tsx
git commit -m "feat: dialogo para aplicar porcentaje de ganancia"
```

---

## Task 8: Selección múltiple y botón "Aplicar ganancia" en `productos-management.tsx`

**Files:**
- Modify: `components/admin/productos-management.tsx`

- [ ] **Step 1: Agregar el import del nuevo diálogo y del ícono**

En la línea 9, agregar `Percent` a la lista de íconos importados de
`lucide-react`:

```typescript
import {
  Search, AlertTriangle, ChevronLeft, ChevronRight, Tag, Upload, Pencil,
  Package, PackageX, ClipboardList, Layers, Plus, CalendarClock, Trash2,
  FileDown, Loader2, Percent,
} from "lucide-react"
```

Después de la línea 23 (`import { ImportDialog } ...`), agregar:

```typescript
import { MargenDialog } from "@/components/admin/productos/margen-dialog"
```

- [ ] **Step 2: Agregar el estado de selección y del diálogo de margen**

Después de la línea 69 (`const [exportando, setExportando] = useState(false)`),
agregar:

```typescript
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [margenOpen, setMargenOpen] = useState(false)
```

- [ ] **Step 3: Limpiar la selección cuando cambia el filtro de categoría**

En el `useEffect` existente que resetea la página al cambiar filtros (línea
76-79):

```typescript
  // Cualquier cambio de filtro invalida la página actual.
  useEffect(() => {
    setPagina(0)
  }, [busquedaDebounced, filtro, categoria, incluirInactivos])
```

reemplazar por:

```typescript
  // Cualquier cambio de filtro invalida la página actual y la selección
  // (evita aplicar ganancia a productos que ya no se están viendo).
  useEffect(() => {
    setPagina(0)
    setSeleccionados(new Set())
  }, [busquedaDebounced, filtro, categoria, incluirInactivos])
```

- [ ] **Step 4: Agregar los handlers de selección**

Después de `abrirOferta` (línea 124), agregar:

```typescript
  const alternarSeleccion = (id: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const alternarSeleccionTodos = () => {
    setSeleccionados((prev) =>
      prev.size === productos.length ? new Set() : new Set(productos.map((p) => p.id)),
    )
  }
```

- [ ] **Step 5: Agregar el botón "Aplicar ganancia" a la barra de acciones**

En la línea 226-241 (barra de botones del header), agregar un botón antes de
"Importar":

```tsx
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportarStockPDF} disabled={exportando}>
            {exportando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="mr-2 h-4 w-4" />
            )}
            Stock en PDF
          </Button>
          <Button variant="outline" onClick={() => setMargenOpen(true)}>
            <Percent className="mr-2 h-4 w-4" /> Aplicar ganancia
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> Importar
          </Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={abrirNuevo}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo producto
          </Button>
        </div>
```

- [ ] **Step 6: Agregar la columna de checkbox a la tabla**

En el `TableHeader` (línea 332-341), agregar una primera columna:

```tsx
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <input
                      type="checkbox"
                      checked={productos.length > 0 && seleccionados.size === productos.length}
                      onChange={alternarSeleccionTodos}
                      aria-label="Seleccionar todos los productos de la página"
                    />
                  </TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="hidden md:table-cell">Rubro</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Margen</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Vence</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
```

En cada `TableRow` del `TableBody` (empieza en la línea 352
`<TableRow key={p.id} className={cn(!p.activo && "opacity-50")}>`), agregar la
celda de checkbox como primer hijo, inmediatamente después de abrir la fila:

```tsx
                    <TableRow key={p.id} className={cn(!p.activo && "opacity-50")}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={seleccionados.has(p.id)}
                          onChange={() => alternarSeleccion(p.id)}
                          aria-label={`Seleccionar ${p.nombre}`}
                        />
                      </TableCell>
                      <TableCell>
```

(La segunda `<TableCell>` que sigue es la que ya existía con el nombre del
producto — no se toca su contenido, solo se antepone la nueva celda de
checkbox.)

- [ ] **Step 7: Renderizar el diálogo y limpiar selección al aplicar**

Después del bloque `<ImportDialog ... />` (línea 528-533), agregar:

```tsx
      <MargenDialog
        tenantId={tenantId}
        categorias={categorias}
        seleccionIds={[...seleccionados]}
        open={margenOpen}
        onOpenChange={setMargenOpen}
        onAplicado={() => {
          setSeleccionados(new Set())
          recargarTodo()
        }}
      />
```

- [ ] **Step 8: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 9: Correr toda la suite de tests**

Run: `npm run test`
Expected: PASS — no se tocó lógica pura en este task, solo UI, así que la
suite completa debe seguir en verde.

- [ ] **Step 10: Probar manualmente en el navegador**

Run: `npm run dev`. En `/[slug]/productos`:
1. Tildar 2-3 productos con costo cargado, click en "Aplicar ganancia" →
   confirmar que el modo "A selección" queda preseleccionado con el conteo
   correcto.
2. Poner un % (ej. 40), confirmar, verificar que el precio de esos productos
   cambió a `costo × 1.4` en la tabla.
3. Repetir con modo "Por categoría" sobre una categoría con productos con
   costo, y con "A todos".
4. Verificar que un producto sin costo cargado no cambia de precio y se cuenta
   en "Omitidos sin costo".
5. Cambiar el filtro de rubro y confirmar que la selección de checkboxes se
   limpia.

- [ ] **Step 11: Commit**

```bash
git add components/admin/productos-management.tsx
git commit -m "feat: seleccion multiple de productos y boton aplicar ganancia"
```

---

## Task 9: Verificación final de la suite completa

**Files:** ninguno — solo verificación.

- [ ] **Step 1: Type-check completo**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errores (warnings preexistentes no relacionados a estos archivos
son aceptables, pero no debe haber ninguno nuevo en los archivos tocados).

- [ ] **Step 3: Suite de tests completa**

Run: `npm run test`
Expected: PASS, todos los archivos `*.test.ts` en verde, incluyendo los 6 de
`importar.test.ts` y los 4 nuevos de `precios.test.ts`.

- [ ] **Step 4: Build de producción**

Run: `npm run build`
Expected: build exitoso sin errores de TypeScript ni de Next.js.

No hay commit en este task — es solo verificación de que todo lo anterior
quedó coherente en conjunto.

---

## Self-review notes

- **Cobertura del spec:** Parte 1 (import por categoría fija) cubierta en
  Tasks 1-4. Parte 2 (margen de ganancia) cubierta en Tasks 5-8. Testing
  cubierto en Tasks 1, 5 y verificación manual en 4 y 8. "Fuera de alcance"
  del spec no se tocó en ningún task (no se migra data existente, no se
  persiste % por producto, no se toca RLS).
- **Consistencia de tipos:** `FilaImportacion` (Task 2) tiene `marca?` y
  `categoria: string`; `parsearFilas` (Task 1) los produce con esos mismos
  nombres; `import-dialog.tsx` (Task 4) los consume sin transformarlos.
  `AlcanceMargen`/`ResultadoMargen` (Task 6) se importan sin cambios de nombre
  en `margen-dialog.tsx` (Task 7). `calcularPrecioConMargen` (Task 5) se
  importa con ese nombre exacto en `productos.ts` (Task 6).
- **Riesgo identificado:** la RPC `importar_productos` podría no soportar
  `marca`/`categoria` en el payload actual — el Task 3 lo verifica antes de
  seguir, con una migración condicional si hace falta.
