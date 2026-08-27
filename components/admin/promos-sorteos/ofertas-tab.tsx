"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Search, Tag } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OfertaDialog } from "@/components/admin/productos/oferta-dialog"
import { getProductos, setOferta, type OfertaInput } from "@/lib/supabase/productos"
import { precioFinal, comboLabel } from "@/lib/productos/precios"
import { formatCurrency } from "@/lib/format"
import type { Producto } from "@/lib/supabase/types"

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
              <TableHead>Oferta</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {conOferta.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.nombre}</TableCell>
                <TableCell>
                  <Badge className="bg-amber-500 hover:bg-amber-500">
                    {comboLabel(p) ?? p.ofertaTipo}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium text-emerald-600">
                  {formatCurrency(precioFinal(p))}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.ofertaHasta ?? "Sin vencimiento"}
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => abrir(p)}>
                    <Tag className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <OfertaDialog producto={editando} open={dialogOpen} onOpenChange={setDialogOpen} onGuardar={guardar} />
    </div>
  )
}
