"use client"

import { useEffect, useState } from "react"
import { Percent, CheckCircle2 } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { aplicarMargen, type ResultadoMargen } from "@/lib/supabase/productos"
import { cn } from "@/lib/utils"

interface Props {
  tenantId: string
  categorias: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onAplicado: () => void
}

type Modo = "categoria" | "todos"

/**
 * Las 3 categorías del import siempre se muestran, en este orden, aunque
 * todavía no tengan ningún producto cargado (el catálogo recién importado
 * puede tener Medicamentos y Accesorios pero cero en Alimentos, por ejemplo,
 * y aun así hay que poder cargarle un % de una).
 */
const ORDEN_CATEGORIAS = ["Medicamentos", "Accesorios", "Alimentos"]

function ordenarCategorias(categorias: string[]): string[] {
  const otras = categorias
    .filter((c) => !ORDEN_CATEGORIAS.includes(c))
    .sort((a, b) => a.localeCompare(b, "es"))
  return [...ORDEN_CATEGORIAS, ...otras]
}

/**
 * El % de cada categoría se guarda por tenant: casi siempre es el mismo
 * recargo mes a mes, así que la próxima vez que se abre el diálogo aparece
 * ya cargado en vez de tener que volver a tipearlo.
 */
const claveStorage = (tenantId: string) => `vetpanel:margen-productos:${tenantId}`

function cargarPorcentajes(tenantId: string): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(claveStorage(tenantId))
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function guardarPorcentaje(tenantId: string, categoria: string, valor: string): void {
  if (typeof window === "undefined") return
  try {
    const actuales = cargarPorcentajes(tenantId)
    window.localStorage.setItem(
      claveStorage(tenantId),
      JSON.stringify({ ...actuales, [categoria]: valor }),
    )
  } catch {
    // localStorage lleno o deshabilitado: recordar el % es una comodidad,
    // no una condición para aplicar la ganancia.
  }
}

export function MargenDialog({ tenantId, categorias, open, onOpenChange, onAplicado }: Props) {
  const [modo, setModo] = useState<Modo>("categoria")
  const [porcentajesPorCategoria, setPorcentajesPorCategoria] = useState<Record<string, string>>({})
  const [aplicandoCategoria, setAplicandoCategoria] = useState<string | null>(null)
  const [resultadosPorCategoria, setResultadosPorCategoria] = useState<Record<string, ResultadoMargen>>({})
  const [erroresPorCategoria, setErroresPorCategoria] = useState<Record<string, string>>({})

  const categoriasOrdenadas = ordenarCategorias(categorias)

  // Único: para el modo "A todos".
  const [porcentajeUnico, setPorcentajeUnico] = useState("")
  const [aplicando, setAplicando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoMargen | null>(null)
  const [error, setError] = useState("")

  // Se carga cada vez que se abre, no solo al montar: el usuario puede haber
  // aplicado ganancia en una sesión anterior y volver más tarde.
  useEffect(() => {
    if (open) setPorcentajesPorCategoria(cargarPorcentajes(tenantId))
  }, [open, tenantId])

  const cerrar = (abierto: boolean) => {
    if (!abierto) {
      setModo("categoria")
      setResultadosPorCategoria({}); setErroresPorCategoria({}); setAplicandoCategoria(null)
      setPorcentajeUnico(""); setAplicando(false); setResultado(null); setError("")
    }
    onOpenChange(abierto)
  }

  const cambiarPorcentajeCategoria = (categoria: string, valor: string) => {
    setPorcentajesPorCategoria((prev) => ({ ...prev, [categoria]: valor }))
    guardarPorcentaje(tenantId, categoria, valor)
  }

  const aplicarACategoria = async (categoria: string) => {
    const porcentaje = Number(porcentajesPorCategoria[categoria])
    if (!porcentajesPorCategoria[categoria]?.trim() || !Number.isFinite(porcentaje)) return

    setAplicandoCategoria(categoria)
    setErroresPorCategoria((prev) => ({ ...prev, [categoria]: "" }))
    try {
      const r = await aplicarMargen(tenantId, porcentaje, { tipo: "categoria", categoria })
      setResultadosPorCategoria((prev) => ({ ...prev, [categoria]: r }))
      onAplicado()
    } catch (e) {
      setErroresPorCategoria((prev) => ({
        ...prev,
        [categoria]: e instanceof Error ? e.message : "No se pudo aplicar el margen",
      }))
    } finally {
      setAplicandoCategoria(null)
    }
  }

  const porcentajeUnicoNumero = Number(porcentajeUnico)
  const porcentajeUnicoValido = porcentajeUnico.trim() !== "" && Number.isFinite(porcentajeUnicoNumero)

  const confirmarUnico = async () => {
    if (!porcentajeUnicoValido) return

    setAplicando(true)
    setError("")
    try {
      const r = await aplicarMargen(tenantId, porcentajeUnicoNumero, { tipo: "todos" })
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

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setModo("categoria")}
              disabled={categoriasOrdenadas.length === 0}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                modo === "categoria" ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : "hover:bg-muted",
              )}
            >
              <p className="text-sm font-medium">Por categoría</p>
              <p className="text-xs text-muted-foreground">Un % distinto por rubro</p>
            </button>
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
          </div>

          {modo === "categoria" && (
            <div className="space-y-2">
              {categoriasOrdenadas.length === 0 && (
                <p className="text-sm text-muted-foreground">Todavía no hay categorías cargadas.</p>
              )}
              {categoriasOrdenadas.map((cat) => {
                const resultadoCat = resultadosPorCategoria[cat]
                const errorCat = erroresPorCategoria[cat]
                const valor = porcentajesPorCategoria[cat] ?? ""
                const valido = valor.trim() !== "" && Number.isFinite(Number(valor))

                return (
                  <div key={cat} className="rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{cat}</p>
                      <Input
                        type="number" step="0.01" placeholder="% ej: 35"
                        value={valor}
                        onChange={(e) => cambiarPorcentajeCategoria(cat, e.target.value)}
                        className="h-8 w-24 shrink-0 text-sm"
                      />
                      <Button
                        size="sm"
                        className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
                        disabled={!valido || aplicandoCategoria === cat}
                        onClick={() => aplicarACategoria(cat)}
                      >
                        {aplicandoCategoria === cat ? "Aplicando…" : "Aplicar"}
                      </Button>
                    </div>
                    {resultadoCat && (
                      <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {resultadoCat.actualizados} actualizados
                        {resultadoCat.omitidosSinCosto > 0 &&
                          ` · ${resultadoCat.omitidosSinCosto} omitidos sin costo`}
                      </p>
                    )}
                    {errorCat && <p className="mt-1.5 text-xs text-red-600">{errorCat}</p>}
                  </div>
                )
              })}
            </div>
          )}

          {modo === "todos" && (
            resultado ? (
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
              <div className="space-y-3">
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">% de ganancia</Label>
                  <Input
                    type="number" step="0.01" placeholder="Ej: 35"
                    value={porcentajeUnico}
                    onChange={(e) => setPorcentajeUnico(e.target.value)}
                  />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
              </div>
            )
          )}
        </div>

        <DialogFooter>
          {modo === "categoria" ? (
            <Button variant="outline" onClick={() => cerrar(false)}>Cerrar</Button>
          ) : resultado ? (
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setResultado(null)}>
              Aplicar otro %
            </Button>
          ) : (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={!porcentajeUnicoValido || aplicando}
              onClick={confirmarUnico}
            >
              {aplicando ? "Aplicando…" : "Aplicar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
