"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Plus, Trash2, Pencil, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PromocionDialog } from "@/components/admin/promos-sorteos/promocion-dialog"
import {
  getPromociones, createPromocion, updatePromocion, eliminarPromocion, type PromocionInput,
} from "@/lib/supabase/promociones"
import { getProductoPorId } from "@/lib/supabase/productos"
import { margenPct } from "@/lib/productos/precios"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Producto, Promocion } from "@/lib/supabase/types"

interface Props {
  tenantId: string
}

/** Lo mínimo del producto que necesita la fila para calcular precio y margen. */
type ProductosPorId = Record<string, Producto>

export function PromocionesTab({ tenantId }: Props) {
  const [promociones, setPromociones] = useState<Promocion[]>([])
  const [productos, setProductos] = useState<ProductosPorId>({})
  const [cargando, setCargando] = useState(true)
  const [editando, setEditando] = useState<Promocion | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const cargar = () => {
    setCargando(true)
    getPromociones(tenantId)
      .then(async (lista) => {
        setPromociones(lista)

        const ids = Array.from(new Set(lista.flatMap((p) => p.items.map((i) => i.productoId))))
        const faltantes = ids.filter((id) => !(id in productos))
        if (faltantes.length === 0) return

        const traidos = await Promise.all(faltantes.map((id) => getProductoPorId(tenantId, id)))
        setProductos((prev) => {
          const nuevo = { ...prev }
          traidos.forEach((p, i) => {
            if (p) nuevo[faltantes[i]] = p
          })
          return nuevo
        })
      })
      .finally(() => setCargando(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(cargar, [tenantId])

  const abrirNueva = () => {
    setEditando(null)
    setDialogOpen(true)
  }

  const abrirEdicion = (p: Promocion) => {
    setEditando(p)
    setDialogOpen(true)
  }

  const guardar = async (input: PromocionInput) => {
    try {
      if (editando) {
        await updatePromocion(tenantId, editando.id, input)
      } else {
        await createPromocion(tenantId, input)
      }
      toast.success("Promoción guardada")
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la promoción")
    }
  }

  const eliminar = async (p: Promocion) => {
    if (!confirm(`¿Eliminar la promoción "${p.nombre}"?`)) return
    try {
      await eliminarPromocion(tenantId, p.id)
      toast.success("Promoción eliminada")
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar la promoción")
    }
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">
        <Button onClick={abrirNueva} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="mr-2 h-4 w-4" /> Nueva promoción
        </Button>
      </div>

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : promociones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay promociones.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Productos</TableHead>
              <TableHead className="text-right">Precio original</TableHead>
              <TableHead className="text-right">Margen y oferta</TableHead>
              <TableHead className="text-right">Precio con %</TableHead>
              <TableHead className="text-right">Vence</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {promociones.map((p) => {
              const items = p.items.map((i) => ({ item: i, producto: productos[i.productoId] }))
              const cargandoItems = items.some((i) => !i.producto)

              const precioListaTotal = cargandoItems
                ? null
                : items.reduce((acc, i) => acc + i.producto!.precioLista * i.item.cantidad, 0)
              const costoTotal = cargandoItems
                ? null
                : items.reduce((acc, i) => acc + (i.producto!.costo ?? 0) * i.item.cantidad, 0)
              const margen = precioListaTotal !== null && costoTotal !== null
                ? margenPct(precioListaTotal, costoTotal)
                : null
              const margenOferta = costoTotal !== null ? margenPct(p.precioFinal, costoTotal) : null

              return (
                <TableRow key={p.id}>
                  <TableCell className="align-top">
                    <div className="flex items-start gap-2.5">
                      {p.imagenUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imagenUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg border object-cover" />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                          <Tag className="h-4 w-4" />
                        </div>
                      )}
                      <span className="font-medium leading-tight">{p.nombre}</span>
                    </div>
                  </TableCell>

                  <TableCell className="align-top">
                    <ul className="space-y-0.5 text-sm text-muted-foreground">
                      {items.map(({ item, producto }) => (
                        <li key={item.productoId}>
                          {producto ? producto.nombre : "…"}
                          {" "}
                          <span className="text-xs">
                            × {item.cantidad}{producto?.unidad === "kg" ? " kg" : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </TableCell>

                  <TableCell className="text-right align-top">
                    {precioListaTotal !== null ? formatCurrency(precioListaTotal) : "—"}
                  </TableCell>

                  <TableCell className="text-right align-top text-xs">
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

                  <TableCell className="text-right align-top">
                    <span className="flex flex-col items-end leading-tight">
                      {precioListaTotal !== null && (
                        <span className="text-xs text-muted-foreground line-through">
                          {formatCurrency(precioListaTotal)}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                        <Tag className="h-3 w-3" /> {formatCurrency(p.precioFinal)}
                      </span>
                    </span>
                  </TableCell>

                  <TableCell className="text-right align-top text-muted-foreground">
                    {p.hasta ?? "Sin vencimiento"}
                  </TableCell>

                  <TableCell className="align-top">
                    <Badge variant={p.activa ? "default" : "secondary"}>{p.activa ? "Activa" : "Inactiva"}</Badge>
                  </TableCell>

                  <TableCell className="align-top">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => abrirEdicion(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => eliminar(p)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <PromocionDialog
        tenantId={tenantId}
        promocion={editando}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onGuardar={guardar}
      />
    </div>
  )
}
