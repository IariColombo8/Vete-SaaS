"use client"

import { useMemo, useState } from "react"
import {
  Upload, AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, FileSpreadsheet,
  Pill, Bone, PawPrint, ClipboardList, ChevronDown, ChevronUp,
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

/**
 * Estas listas no traen stock, así que la única estrategia que tiene sentido
 * es no tocarlo: actualiza precio/nombre/marca de lo que ya existe y da de
 * alta lo que venga con un código nuevo.
 */
const ESTRATEGIA_FIJA: EstrategiaStock = "no_tocar"

/** Las filas se mandan de a tandas: cada una es una transacción en la base. */
const TAMANIO_LOTE = 200

export function ImportDialog({ tenantId, open, onOpenChange, onImportado }: Props) {
  const [paso, setPaso] = useState<Paso>("categoria")
  const [categoria, setCategoria] = useState<Categoria | null>(null)
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [totalFilasArchivo, setTotalFilasArchivo] = useState(0)
  const [filaInicio, setFilaInicio] = useState(2)
  const [filas, setFilas] = useState<FilaParseada[]>([])
  const [incluirConAdvertencias, setIncluirConAdvertencias] = useState(true)
  const [revisarAbierto, setRevisarAbierto] = useState(true)
  const [progreso, setProgreso] = useState({ hechas: 0, total: 0 })
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null)
  const [error, setError] = useState("")
  const [leyendo, setLeyendo] = useState(false)

  const reiniciar = () => {
    setPaso("categoria"); setCategoria(null); setWorkbook(null); setTotalFilasArchivo(0)
    setFilaInicio(2); setFilas([])
    setIncluirConAdvertencias(true); setRevisarAbierto(true); setProgreso({ hechas: 0, total: 0 })
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

  /**
   * El Excel puede traer un precio que no se pudo leer (celda con un formato
   * raro, fórmula, etc.). En vez de obligar a corregir el archivo y volver a
   * subirlo, se puede tipear el precio a mano acá mismo y sacarle la
   * advertencia a esa fila puntual.
   */
  const corregirPrecio = (numeroFila: number, texto: string) => {
    const precio = Number(texto)
    setFilas((prev) =>
      prev.map((f) => {
        if (f.numeroFila !== numeroFila) return f
        const advertencias = f.advertencias.filter((a) => a !== "precio en cero")
        if (!Number.isFinite(precio) || precio <= 0) advertencias.push("precio en cero")
        return { ...f, costo: precio, precio, advertencias, revisar: advertencias.length > 0 }
      }),
    )
  }

  /**
   * Un producto sin código en el Excel se puede completar acá a mano. Si
   * queda sin código igual, el import lo matchea por nombre + categoría la
   * próxima vez (ver `importar_productos` en la base) — no es obligatorio
   * completarlo para que no se duplique en el siguiente archivo.
   */
  const corregirCodigo = (numeroFila: number, texto: string) => {
    const codigo = texto.trim()
    setFilas((prev) =>
      prev.map((f) => {
        if (f.numeroFila !== numeroFila) return f
        const advertencias = f.advertencias.filter((a) => a !== "sin código")
        if (!codigo) advertencias.push("sin código")
        return { ...f, codigo, advertencias, revisar: advertencias.length > 0 }
      }),
    )
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
        const r = await importarProductos(tenantId, lote, ESTRATEGIA_FIJA)
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
            {stats.conAdvertencias > 0 && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-900">
                <button
                  type="button"
                  onClick={() => setRevisarAbierto((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-left text-sm font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
                >
                  <span className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 shrink-0" />
                    Productos a revisar ({stats.conAdvertencias})
                  </span>
                  {revisarAbierto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {revisarAbierto && (
                  <div className="max-h-64 overflow-y-auto p-2 text-xs text-muted-foreground">
                    {filas
                      .filter((f) => f.advertencias.length > 0)
                      .map((f) => (
                        <div
                          key={f.numeroFila}
                          className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed py-1.5 last:border-0"
                        >
                          <p className="min-w-0 flex-1 truncate">
                            Fila {f.numeroFila}: {f.descripcion || "(sin nombre)"} — {f.advertencias.join(", ")}
                          </p>
                          <div className="flex shrink-0 gap-1.5">
                            {f.advertencias.includes("sin código") && (
                              <Input
                                type="text" placeholder="Código"
                                defaultValue={f.codigo}
                                onBlur={(e) => corregirCodigo(f.numeroFila, e.target.value)}
                                className="h-7 w-24 text-xs"
                              />
                            )}
                            {f.advertencias.includes("precio en cero") && (
                              <Input
                                type="number" min={0} step="0.01" placeholder="Precio"
                                defaultValue={f.costo || ""}
                                onBlur={(e) => corregirPrecio(f.numeroFila, e.target.value)}
                                className="h-7 w-24 text-xs"
                              />
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

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
              <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  Incluir las filas con advertencias (quedan marcadas &ldquo;a revisar&rdquo;)
                </span>
                <Switch checked={incluirConAdvertencias} onCheckedChange={setIncluirConAdvertencias} />
              </label>
            )}

            <p className="text-xs text-muted-foreground">
              Los productos con código ya existente se actualizan (precio, nombre, marca).
              Los códigos nuevos se dan de alta. El stock no se toca. Un producto sin código se
              sigue reconociendo por nombre y categoría en la próxima importación.
            </p>
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
