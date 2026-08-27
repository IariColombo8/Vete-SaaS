"use client"

import { useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { getProductos, getProductoPorId } from "@/lib/supabase/productos"
import { formatCurrency } from "@/lib/format"
import type { Producto, Promocion } from "@/lib/supabase/types"
import type { PromocionInput } from "@/lib/supabase/promociones"

interface Props {
  tenantId: string
  promocion: Promocion | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onGuardar: (input: PromocionInput) => Promise<void>
}

interface ItemForm {
  producto: Producto
  cantidad: number
}

export function PromocionDialog({ tenantId, promocion, open, onOpenChange, onGuardar }: Props) {
  const [nombre, setNombre] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [precioFinal, setPrecioFinal] = useState("")
  const [activa, setActiva] = useState(true)
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [items, setItems] = useState<ItemForm[]>([])
  const [busqueda, setBusqueda] = useState("")
  const [resultados, setResultados] = useState<Producto[]>([])
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!open) return
    setNombre(promocion?.nombre ?? "")
    setDescripcion(promocion?.descripcion ?? "")
    setPrecioFinal(promocion ? String(promocion.precioFinal) : "")
    setActiva(promocion?.activa ?? true)
    setDesde(promocion?.desde ?? "")
    setHasta(promocion?.hasta ?? "")
    setBusqueda("")
    setResultados([])

    if (!promocion) {
      setItems([])
      return
    }

    let vigente = true
    Promise.allSettled(
      promocion.items.map(async (i) => {
        const producto = await getProductoPorId(tenantId, i.productoId)
        return producto ? { producto, cantidad: i.cantidad } : null
      }),
    ).then((resultados) => {
      if (!vigente) return
      setItems(
        resultados
          .filter((r): r is PromiseFulfilledResult<ItemForm | null> => r.status === "fulfilled")
          .map((r) => r.value)
          .filter((i): i is ItemForm => i !== null),
      )
    })
    return () => {
      vigente = false
    }
  }, [open, promocion, tenantId])

  useEffect(() => {
    const termino = busqueda.trim()
    if (termino.length < 2) {
      setResultados([])
      return
    }
    let vigente = true
    const timer = setTimeout(() => {
      getProductos(tenantId, { busqueda: termino, porPagina: 8 }).then(({ productos }) => {
        if (vigente) setResultados(productos)
      })
    }, 250)
    return () => {
      vigente = false
      clearTimeout(timer)
    }
  }, [busqueda, tenantId])

  const agregarProducto = (producto: Producto) => {
    if (items.some((i) => i.producto.id === producto.id)) return
    setItems((prev) => [...prev, { producto, cantidad: 1 }])
    setBusqueda("")
    setResultados([])
  }

  const cambiarCantidad = (productoId: string, cantidad: number) => {
    setItems((prev) => prev.map((i) => (i.producto.id === productoId ? { ...i, cantidad } : i)))
  }

  const quitarItem = (productoId: string) => {
    setItems((prev) => prev.filter((i) => i.producto.id !== productoId))
  }

  const precioListaTotal = items.reduce((acc, i) => acc + i.producto.precio * i.cantidad, 0)
  const invalido =
    !nombre.trim() || items.length === 0 || !precioFinal || Number(precioFinal) < 0 || items.some((i) => i.cantidad <= 0)

  const guardar = async () => {
    if (invalido) return
    setGuardando(true)
    try {
      await onGuardar({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        precioFinal: Number(precioFinal),
        activa,
        desde: desde || null,
        hasta: hasta || null,
        items: items.map((i) => ({ productoId: i.producto.id, cantidad: i.cantidad })),
      })
      onOpenChange(false)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{promocion ? "Editar promoción" : "Nueva promoción"}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Collar + Correa" />
          </div>

          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Descripción (opcional)</Label>
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
          </div>

          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Buscar producto para agregar</Label>
            <div className="relative">
              <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre del producto" />
              {resultados.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border bg-card shadow-lg">
                  {resultados.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => agregarProducto(p)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span>{p.nombre}</span>
                      <span className="text-muted-foreground">{formatCurrency(p.precio)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {items.length > 0 && (
            <div className="space-y-2 rounded-lg border p-3">
              {items.map((i) => (
                <div key={i.producto.id} className="flex items-center gap-2">
                  <span className="flex-1 truncate text-sm">{i.producto.nombre}</span>
                  <Input
                    type="number" min={1} className="w-16"
                    value={i.cantidad}
                    onChange={(e) => cambiarCantidad(i.producto.id, Number(e.target.value) || 1)}
                  />
                  <Button size="sm" variant="ghost" onClick={() => quitarItem(i.producto.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Precio de lista del combo: {formatCurrency(precioListaTotal)}
              </p>
            </div>
          )}

          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Precio final del combo</Label>
            <Input type="number" min={0} value={precioFinal} onChange={(e) => setPrecioFinal(e.target.value)} placeholder="Ej: 6500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Desde (opcional)</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Hasta (opcional)</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
          </div>

          <label className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <span className="text-sm font-medium">Promoción activa</span>
            <Switch checked={activa} onCheckedChange={setActiva} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={guardando || invalido} onClick={guardar}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
