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
