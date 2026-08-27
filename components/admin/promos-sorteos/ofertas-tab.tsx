"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Search, Tag, Pencil } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OfertaDialog } from "@/components/admin/productos/oferta-dialog"
import { ProductoDialog } from "@/components/admin/productos/producto-dialog"
import {
  getProductos, setOferta, updateProducto, ajustarStock,
  type OfertaInput, type ProductoInput,
} from "@/lib/supabase/productos"
import { precioFinal, comboLabel, margenPct } from "@/lib/productos/precios"
import { formatCurrency, formatCantidad } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { AjusteStockTipo, Producto } from "@/lib/supabase/types"

interface Props {
  tenantId: string
}

/** Milisegundos de espera antes de consultar mientras se tipea. */
const DEBOUNCE_MS = 250

export function OfertasTab({ tenantId }: Props) {
  const [conOferta, setConOferta] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState("")
  const [resultados, setResultados] = useState<Producto[]>([])
  const [editando, setEditando] = useState<Producto | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editandoProducto, setEditandoProducto] = useState<Producto | null>(null)
  const [productoOpen, setProductoOpen] = useState(false)

  const cargarConOferta = () => {
    setCargando(true)
    getProductos(tenantId, { soloOferta: true, porPagina: 100 })
      .then(({ productos }) => setConOferta(productos))
      .finally(() => setCargando(false))
  }

  useEffect(cargarConOferta, [tenantId])

  useEffect(() => {
    const termino = busqueda.trim()
    if (termino.length < 2) {
      setResultados([])
      return
    }
    let vigente = true
    const timer = setTimeout(() => {
      getProductos(tenantId, { busqueda: termino, porPagina: 10 }).then(({ productos }) => {
        if (vigente) setResultados(productos)
      })
    }, DEBOUNCE_MS)
    return () => {
      vigente = false
      clearTimeout(timer)
    }
  }, [busqueda, tenantId])

  const abrir = (p: Producto) => {
    setEditando(p)
    setDialogOpen(true)
  }

  const guardar = async (oferta: OfertaInput) => {
    if (!editando) return
    try {
      await setOferta(tenantId, editando.id, oferta)
      toast.success("Oferta guardada")
      setBusqueda("")
      setResultados([])
      cargarConOferta()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la oferta")
    }
  }

  const abrirEdicionProducto = (p: Producto) => {
    setEditandoProducto(p)
    setProductoOpen(true)
  }

  const guardarProducto = async (input: ProductoInput) => {
    if (!editandoProducto) return
    try {
      await updateProducto(tenantId, editandoProducto.id, input)
      toast.success("Producto actualizado")
      cargarConOferta()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el producto")
      throw e
    }
  }

  const moverStock = async (tipo: AjusteStockTipo, cantidad: number, referencia: string) => {
    if (!editandoProducto) return
    try {
      const res = await ajustarStock(editandoProducto.id, tipo, cantidad, referencia)
      toast.success(`Stock actualizado: ${formatCantidad(res.stockNuevo)}`)
      setEditandoProducto((p) => (p ? { ...p, stock: res.stockNuevo } : p))
      cargarConOferta()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo ajustar el stock")
    }
  }

  return (
    <div className="space-y-6 pt-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto para poner en oferta"
          className="pl-9"
        />
        {resultados.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border bg-card shadow-lg">
            {resultados.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => abrir(p)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span>{p.nombre}</span>
                <span className="text-muted-foreground">{formatCurrency(p.precio)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : conOferta.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay productos en oferta.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Precio original</TableHead>
              <TableHead className="text-right">Margen y oferta</TableHead>
              <TableHead className="text-right">Precio con %</TableHead>
              <TableHead className="text-right">Vence</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {conOferta.map((p) => {
              const combo = comboLabel(p)
              const margen = margenPct(p.precio, p.costo)
              const precioUnitOferta = combo && p.ofertaCantidad
                ? (p.ofertaValor ?? 0) / p.ofertaCantidad
                : precioFinal(p)
              const margenOferta = margenPct(precioUnitOferta, p.costo)

              return (
                <TableRow key={p.id}>
                  <TableCell>{p.nombre}</TableCell>

                  <TableCell className="text-right">
                    {formatCurrency(p.precioLista)}
                  </TableCell>

                  <TableCell className="text-right text-xs">
                    {margen === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="flex flex-col items-end leading-tight">
                        <span className="text-muted-foreground line-through">{margen.toFixed(0)}%</span>
                        <span className={cn(
                          "font-medium",
                          margenOferta !== null && margenOferta < 0 ? "text-red-600" : "text-emerald-600",
                        )}>
                          {margenOferta !== null ? `${margenOferta.toFixed(0)}%` : "—"}
                        </span>
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    {combo ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                        <Tag className="h-3 w-3" /> {combo}
                      </span>
                    ) : (
                      <span className="flex flex-col items-end leading-tight">
                        <span className="text-xs text-muted-foreground line-through">
                          {formatCurrency(p.precio)}
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                          <Tag className="h-3 w-3" /> {formatCurrency(precioFinal(p))}
                        </span>
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-right text-muted-foreground">
                    {p.ofertaHasta ?? "Sin vencimiento"}
                  </TableCell>

                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => abrir(p)} title="Editar oferta">
                        <Tag className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => abrirEdicionProducto(p)}
                        title="Editar producto"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <OfertaDialog producto={editando} open={dialogOpen} onOpenChange={setDialogOpen} onGuardar={guardar} />

      <ProductoDialog
        tenantId={tenantId}
        producto={editandoProducto}
        open={productoOpen}
        onOpenChange={setProductoOpen}
        onGuardar={guardarProducto}
        onAjustarStock={moverStock}
      />
    </div>
  )
}
