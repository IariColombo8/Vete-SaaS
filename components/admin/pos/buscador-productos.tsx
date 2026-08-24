"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, PawPrint, Search } from "lucide-react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getProductoPorCodigo, getProductos } from "@/lib/supabase/productos"
import { descripcionLinea } from "@/lib/ventas/carrito"
import { precioFinal, tieneOferta } from "@/lib/productos/precios"
import { formatCantidad, formatCurrency } from "@/lib/format"
import type { Producto } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  onElegir: (producto: Producto) => void
  onAbrirAlimentos: () => void
}

/** Milisegundos de espera antes de consultar mientras se tipea. */
const DEBOUNCE_MS = 250

/**
 * Buscador del mostrador. Dos formas de encontrar un producto:
 *
 *  · Lector de código de barras — el lector "tipea" el código y manda Enter. Se
 *    busca por código exacto y, si hay match, se agrega derecho al carrito sin
 *    que el vendedor toque nada.
 *  · Texto libre — nombre, marca o línea, con debounce.
 *
 * El foco vuelve al input después de cada agregado: si se pierde, el lector
 * escribe en el vacío y parece que el escáner está roto.
 */
export function BuscadorProductos({ tenantId, onElegir, onAbrirAlimentos }: Props) {
  const [busqueda, setBusqueda] = useState("")
  const [resultados, setResultados] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const termino = busqueda.trim()
    if (termino.length < 2) {
      setResultados([])
      return
    }

    let vigente = true
    setCargando(true)

    const timer = setTimeout(() => {
      getProductos(tenantId, { busqueda: termino, porPagina: 24 })
        .then(({ productos }) => {
          if (vigente) setResultados(productos)
        })
        .finally(() => {
          if (vigente) setCargando(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      vigente = false
      clearTimeout(timer)
    }
  }, [busqueda, tenantId])

  const elegir = (producto: Producto) => {
    onElegir(producto)
    setBusqueda("")
    setResultados([])
    inputRef.current?.focus()
  }

  /** Enter = el lector terminó de escribir un código, o el usuario lo tipeó. */
  const buscarPorCodigo = async () => {
    const codigo = busqueda.trim()
    if (!codigo) return

    const producto = await getProductoPorCodigo(tenantId, codigo)
    if (producto) {
      elegir(producto)
      return
    }

    // Sin match exacto no es un error: puede ser una búsqueda por texto a medias.
    if (resultados.length === 1) {
      elegir(resultados[0])
    } else if (resultados.length === 0) {
      toast.error(`No se encontró "${codigo}"`)
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={busqueda}
            autoFocus
            placeholder="Escaneá un código o buscá por nombre / marca"
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void buscarPorCodigo()
              }
            }}
            className="h-12 pl-9 text-base"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onAbrirAlimentos}
          className="h-12 shrink-0"
        >
          <PawPrint className="mr-2 h-4 w-4" /> Alimentos
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {cargando && resultados.length === 0 ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : resultados.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {busqueda.trim().length >= 2
              ? "Sin resultados"
              : "Escaneá un producto o empezá a escribir"}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {resultados.map((p) => (
              <ResultadoProducto key={p.id} producto={p} onElegir={() => elegir(p)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ResultadoProducto({
  producto,
  onElegir,
}: {
  producto: Producto
  onElegir: () => void
}) {
  const agotado = producto.controlaStock && producto.stock <= 0
  const porKg = producto.unidad === "kg"

  return (
    <button
      type="button"
      onClick={onElegir}
      disabled={agotado}
      className="flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-card dark:hover:bg-emerald-950/40"
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-medium">{descripcionLinea(producto)}</span>
        {tieneOferta(producto) && (
          <Badge className="shrink-0 bg-amber-500 hover:bg-amber-500">Oferta</Badge>
        )}
      </div>
      <div className="flex w-full items-baseline justify-between">
        <span className="font-bold text-emerald-600 dark:text-emerald-400">
          {formatCurrency(precioFinal(producto))}
          {porKg && <span className="text-xs font-normal"> / kg</span>}
        </span>
        <span className="text-xs text-muted-foreground">
          {agotado
            ? "Sin stock"
            : producto.controlaStock
              ? `${formatCantidad(producto.stock)} ${porKg ? "kg" : "u."}`
              : "Servicio"}
        </span>
      </div>
    </button>
  )
}
