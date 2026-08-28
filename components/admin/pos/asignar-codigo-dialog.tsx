"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Search } from "lucide-react"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { asignarCodigoBarras, createProducto, getProductos } from "@/lib/supabase/productos"
import type { Producto } from "@/lib/supabase/types"
import { cn } from "@/lib/utils"

interface Props {
  tenantId: string
  codigo: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** El producto listo (asignado o recién creado), para agregarlo al carrito de una. */
  onAsignado: (producto: Producto) => void
}

const DEBOUNCE_MS = 250

type Modo = "buscar" | "crear"

/**
 * Se abre cuando se escanea un código que no coincide con ningún producto.
 * Dos caminos: pegarle el código a un producto que ya está cargado (lo más
 * común mientras el catálogo no tiene códigos asignados todavía), o dar de
 * alta uno nuevo directamente con ese código.
 */
export function AsignarCodigoDialog({ tenantId, codigo, open, onOpenChange, onAsignado }: Props) {
  const [modo, setModo] = useState<Modo>("buscar")

  const [busqueda, setBusqueda] = useState("")
  const [resultados, setResultados] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(false)
  const [asignandoId, setAsignandoId] = useState<string | null>(null)

  const [nombreNuevo, setNombreNuevo] = useState("")
  const [precioNuevo, setPrecioNuevo] = useState("")
  const [stockNuevo, setStockNuevo] = useState("0")
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    if (!open) {
      setModo("buscar")
      setBusqueda(""); setResultados([])
      setNombreNuevo(""); setPrecioNuevo(""); setStockNuevo("0")
    }
  }, [open])

  useEffect(() => {
    const termino = busqueda.trim()
    if (termino.length < 2) { setResultados([]); return }

    let vigente = true
    setCargando(true)
    const timer = setTimeout(() => {
      getProductos(tenantId, { busqueda: termino, porPagina: 10 })
        .then(({ productos }) => { if (vigente) setResultados(productos) })
        .finally(() => { if (vigente) setCargando(false) })
    }, DEBOUNCE_MS)

    return () => { vigente = false; clearTimeout(timer) }
  }, [busqueda, tenantId])

  const asignar = async (producto: Producto) => {
    if (!codigo) return
    setAsignandoId(producto.id)
    try {
      await asignarCodigoBarras(tenantId, producto.id, codigo)
      toast.success(`Código asignado a "${producto.nombre}"`)
      onAsignado({ ...producto, codigoBarras: codigo })
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo asignar el código")
    } finally {
      setAsignandoId(null)
    }
  }

  const nombreInvalido = !nombreNuevo.trim()

  const crear = async () => {
    if (!codigo || nombreInvalido) return
    setCreando(true)
    try {
      const producto = await createProducto(tenantId, {
        nombre: nombreNuevo,
        codigoBarras: codigo,
        precio: Number(precioNuevo) || 0,
        controlaStock: true,
        unidad: "un",
        stockMinimo: 0,
        stockInicial: Number(stockNuevo) || 0,
        activo: true,
        // Se cargó al vuelo desde el mostrador: falta categoría, costo, etc.
        revisar: true,
      })
      toast.success(`"${producto.nombre}" creado`)
      onAsignado(producto)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el producto")
    } finally {
      setCreando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Código sin asignar</DialogTitle>
          <DialogDescription>
            &ldquo;{codigo}&rdquo; no está en ningún producto.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b">
          <button
            type="button"
            onClick={() => setModo("buscar")}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              modo === "buscar"
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            Asignar a uno existente
          </button>
          <button
            type="button"
            onClick={() => setModo("crear")}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              modo === "crear"
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            Crear producto nuevo
          </button>
        </div>

        {modo === "buscar" ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, marca…"
                className="pl-9"
              />
            </div>

            <div className="max-h-72 overflow-y-auto">
              {cargando ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : resultados.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {busqueda.trim().length >= 2 ? "Sin resultados" : "Escribí al menos 2 letras"}
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {resultados.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={asignandoId !== null}
                        onClick={() => asignar(p)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-60 dark:hover:bg-emerald-950/40"
                      >
                        <span className="min-w-0 truncate">
                          {p.nombre}
                          {p.marca && <span className="text-muted-foreground"> · {p.marca}</span>}
                        </span>
                        {asignandoId === p.id ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                        ) : p.codigoBarras ? (
                          <span className="shrink-0 text-xs text-amber-600">ya tiene código</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Nombre</Label>
              <Input
                autoFocus
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                placeholder="Ej: Shampoo antipulgas 500ml"
              />
              {nombreInvalido && <p className="mt-1 text-xs text-red-600">El nombre es obligatorio</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">Precio de venta</Label>
                <Input type="number" inputMode="decimal" min={0} value={precioNuevo} onChange={(e) => setPrecioNuevo(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">Stock inicial</Label>
                <Input type="number" inputMode="decimal" min={0} value={stockNuevo} onChange={(e) => setStockNuevo(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Queda marcado como &ldquo;a revisar&rdquo; para completar rubro y costo después, sin
              trabar la venta ahora.
            </p>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creando}>
                Cancelar
              </Button>
              <Button onClick={crear} disabled={creando || nombreInvalido} className="bg-emerald-600 hover:bg-emerald-700">
                {creando ? "Creando…" : "Crear y agregar"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
