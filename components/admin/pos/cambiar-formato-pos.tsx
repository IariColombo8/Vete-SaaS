"use client"

import { useEffect, useState } from "react"
import { Loader2, Scale, Search } from "lucide-react"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getProductos } from "@/lib/supabase/productos"
import { presentacionDe } from "@/lib/ventas/carrito"
import { FormatoVentaDialog } from "@/components/admin/productos/formato-venta-dialog"
import type { Producto } from "@/lib/supabase/types"

interface Props {
  tenantId: string
}

/** Milisegundos de espera antes de consultar mientras se tipea. */
const DEBOUNCE_MS = 250

/**
 * Acceso rápido desde el mostrador para corregir el formato de venta de UN
 * producto puntual (por peso / por unidad / cantidad de unidades), sin tener
 * que salir del POS e ir hasta Productos. La edición de varios a la vez vive
 * en Productos — acá alcanza con buscar y elegir uno.
 */
export function CambiarFormatoPos({ tenantId }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState("")
  const [resultados, setResultados] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(false)
  const [elegido, setElegido] = useState<Producto | null>(null)

  useEffect(() => {
    if (!abierto) return
    const termino = busqueda.trim()
    if (termino.length < 2) {
      setResultados([])
      return
    }
    let vigente = true
    setCargando(true)
    const timer = setTimeout(() => {
      getProductos(tenantId, { busqueda: termino, porPagina: 20 })
        .then(({ productos }) => { if (vigente) setResultados(productos) })
        .finally(() => { if (vigente) setCargando(false) })
    }, DEBOUNCE_MS)
    return () => {
      vigente = false
      clearTimeout(timer)
    }
  }, [abierto, busqueda, tenantId])

  const cerrarBusqueda = (v: boolean) => {
    setAbierto(v)
    if (!v) {
      setBusqueda("")
      setResultados([])
    }
  }

  return (
    <>
      <Button type="button" variant="outline" className="h-12 shrink-0" onClick={() => setAbierto(true)}>
        <Scale className="mr-2 h-4 w-4" /> Cambiar formato
      </Button>

      <Dialog open={abierto} onOpenChange={cerrarBusqueda}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar formato de venta</DialogTitle>
            <DialogDescription>Buscá el producto que querés corregir.</DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              autoFocus
              placeholder="Nombre, marca o código…"
              onChange={(e) => setBusqueda(e.target.value)}
              className="h-11 pl-9"
            />
          </div>

          <div className="max-h-80 overflow-y-auto">
            {cargando ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : resultados.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {busqueda.trim().length >= 2 ? "Sin resultados" : "Empezá a escribir para buscar"}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {resultados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setElegido(p)
                      cerrarBusqueda(false)
                    }}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2.5 text-left text-sm transition-colors hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                  >
                    <span className="truncate font-medium">{p.nombre}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {p.unidad === "kg" ? "Por peso" : presentacionDe(p) || "Por unidad"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <FormatoVentaDialog
        tenantId={tenantId}
        productos={elegido ? [elegido] : []}
        open={elegido !== null}
        onOpenChange={(v) => !v && setElegido(null)}
        onAplicado={() => setElegido(null)}
      />
    </>
  )
}
