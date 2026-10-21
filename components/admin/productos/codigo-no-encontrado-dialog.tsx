"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Loader2, Plus, Search } from "lucide-react"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { asignarCodigoBarras, createProducto, getProductos } from "@/lib/supabase/productos"
import type { Producto } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  codigo: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** El producto que quedó con el código (asignado o recién creado). */
  onAsignado: (producto: Producto) => void
  /**
   * "Agregar" con el formulario completo de producto (Productos). Sin esto,
   * se ofrece el alta rápida acá mismo (mostrador: nombre, precio y stock,
   * sin trabar la venta).
   */
  onAgregar?: (codigo: string) => void
}

/**
 * Se abre cuando se escanea un código que no está en ningún producto. El
 * código nunca se pierde: o se le pega a un producto de la lista (queda
 * guardado para el próximo escaneo), o se da de alta uno nuevo con ese código.
 */
export function CodigoNoEncontradoDialog({ tenantId, codigo, open, onOpenChange, onAsignado, onAgregar }: Props) {
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    if (!open) setCreando(false)
  }, [open])

  const agregar = () => {
    if (!codigo) return
    if (onAgregar) {
      onOpenChange(false)
      onAgregar(codigo)
    } else {
      setCreando(true)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>No se encuentra el producto</DialogTitle>
          <DialogDescription>
            El código &ldquo;{codigo}&rdquo; no está en ningún producto. Agregá uno nuevo o elegí
            de la lista a cuál pertenece: el código queda guardado para la próxima.
          </DialogDescription>
        </DialogHeader>

        {codigo && creando ? (
          <AltaRapida
            tenantId={tenantId}
            codigo={codigo}
            onCancelar={() => setCreando(false)}
            onCreado={(p) => { onAsignado(p); onOpenChange(false) }}
          />
        ) : (
          <>
            <Button onClick={agregar} className="w-full bg-emerald-600 hover:bg-emerald-700">
              <Plus className="mr-2 h-4 w-4" /> Agregar
            </Button>
            {codigo && (
              <ListaParaAsignarCodigo
                tenantId={tenantId}
                codigo={codigo}
                onAsignado={(p) => { onAsignado(p); onOpenChange(false) }}
              />
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

const DEBOUNCE_MS = 250
const POR_PAGINA = 50

/**
 * Todo el catálogo (sin tener que escribir nada) con un buscador por nombre.
 * Tocar un producto le guarda el código escaneado. Pagina de a `POR_PAGINA`
 * y trae más al llegar al final del scroll.
 */
export function ListaParaAsignarCodigo({
  tenantId, codigo, onAsignado,
}: {
  tenantId: string
  codigo: string
  onAsignado: (producto: Producto) => void
}) {
  const [busqueda, setBusqueda] = useState("")
  const [productos, setProductos] = useState<Producto[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [asignandoId, setAsignandoId] = useState<string | null>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  const cambiarBusqueda = (v: string) => {
    setBusqueda(v)
    setPagina(0)
  }

  useEffect(() => {
    let vigente = true
    setCargando(true)
    const timer = setTimeout(() => {
      getProductos(tenantId, { busqueda: busqueda.trim() || undefined, pagina, porPagina: POR_PAGINA })
        .then((res) => {
          if (!vigente) return
          setProductos((previos) => (pagina === 0 ? res.productos : [...previos, ...res.productos]))
          setTotal(res.total)
        })
        .finally(() => { if (vigente) setCargando(false) })
    }, pagina === 0 ? DEBOUNCE_MS : 0)

    return () => { vigente = false; clearTimeout(timer) }
  }, [busqueda, pagina, tenantId])

  const hayMas = productos.length < total

  const alScrollear = () => {
    const el = listaRef.current
    if (!el || cargando || !hayMas) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) setPagina((p) => p + 1)
  }

  const asignar = async (producto: Producto) => {
    setAsignandoId(producto.id)
    try {
      await asignarCodigoBarras(tenantId, producto.id, codigo)
      toast.success(`Código guardado en "${producto.nombre}"`)
      onAsignado({ ...producto, codigoBarras: codigo })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el código")
    } finally {
      setAsignandoId(null)
    }
  }

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={busqueda}
          onChange={(e) => cambiarBusqueda(e.target.value)}
          placeholder="Buscar el producto por nombre…"
          className="pl-9"
        />
      </div>

      <div ref={listaRef} onScroll={alScrollear} className="max-h-72 overflow-y-auto">
        {productos.length === 0 ? (
          cargando ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin resultados</p>
          )
        ) : (
          <ul className="flex flex-col gap-1.5">
            {productos.map((p) => (
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
                    <span className="shrink-0 text-xs text-amber-600" title={`Código actual: ${p.codigoBarras}`}>
                      ya tiene código
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
            {hayMas && (
              <li className="flex justify-center py-2">
                {cargando ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setPagina((p) => p + 1)}>
                    Ver más
                  </Button>
                )}
              </li>
            )}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {total} producto{total === 1 ? "" : "s"}
      </p>
    </>
  )
}

/** Alta mínima desde el mostrador: lo demás se completa después en Productos. */
function AltaRapida({
  tenantId, codigo, onCancelar, onCreado,
}: {
  tenantId: string
  codigo: string
  onCancelar: () => void
  onCreado: (producto: Producto) => void
}) {
  const [nombre, setNombre] = useState("")
  const [precio, setPrecio] = useState("")
  const [stock, setStock] = useState("0")
  const [guardando, setGuardando] = useState(false)

  const nombreInvalido = !nombre.trim()

  const crear = async () => {
    if (nombreInvalido) return
    setGuardando(true)
    try {
      const producto = await createProducto(tenantId, {
        nombre,
        codigoBarras: codigo,
        precio: Number(precio) || 0,
        controlaStock: true,
        unidad: "un",
        stockMinimo: 0,
        stockInicial: Number(stock) || 0,
        activo: true,
        // Se cargó al vuelo desde el mostrador: falta categoría, costo, etc.
        revisar: true,
      })
      toast.success(`"${producto.nombre}" creado`)
      onCreado(producto)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el producto")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <div>
        <Label className="mb-1 block text-xs text-muted-foreground">Nombre</Label>
        <Input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Shampoo antipulgas 500ml"
        />
        {nombreInvalido && <p className="mt-1 text-xs text-red-600">El nombre es obligatorio</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Precio de venta</Label>
          <Input type="number" inputMode="decimal" min={0} value={precio} onChange={(e) => setPrecio(e.target.value)} />
        </div>
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Stock inicial</Label>
          <Input type="number" inputMode="decimal" min={0} value={stock} onChange={(e) => setStock(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Queda marcado como &ldquo;a revisar&rdquo; para completar rubro y costo después, sin
        trabar la venta ahora.
      </p>

      <DialogFooter>
        <Button variant="outline" onClick={onCancelar} disabled={guardando}>Volver</Button>
        <Button onClick={crear} disabled={guardando || nombreInvalido} className="bg-emerald-600 hover:bg-emerald-700">
          {guardando ? "Creando…" : "Crear y agregar"}
        </Button>
      </DialogFooter>
    </>
  )
}
