"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, PawPrint, ScanBarcode, Search, Stethoscope } from "lucide-react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { BarcodeScannerDialog } from "@/components/shared/barcode-scanner-dialog"
import { AsignarCodigoDialog } from "@/components/admin/pos/asignar-codigo-dialog"
import { getMarcas, getProductoPorCodigo, getProductos } from "@/lib/supabase/productos"
import { presentacionDe } from "@/lib/ventas/carrito"
import { precioFinal, tieneOferta } from "@/lib/productos/precios"
import { formatCantidad, formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Producto } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  onElegir: (producto: Producto) => void
  onAbrirAlimentos: () => void
  onAbrirAtencion: () => void
}

/** Milisegundos de espera antes de consultar mientras se tipea. */
const DEBOUNCE_MS = 250

/** Categorías fijas que usa este catálogo (ver ImportDialog). */
const CATEGORIAS = ["Alimentos", "Medicamentos", "Accesorios"] as const

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
export function BuscadorProductos({ tenantId, onElegir, onAbrirAlimentos, onAbrirAtencion }: Props) {
  const [busqueda, setBusqueda] = useState("")
  const [categoria, setCategoria] = useState<string | null>(null)
  const [marca, setMarca] = useState<string | null>(null)
  const [marcasDisponibles, setMarcasDisponibles] = useState<string[]>([])
  const [resultados, setResultados] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [codigoSinAsignar, setCodigoSinAsignar] = useState<string | null>(null)

  // Las marcas dependen de la categoría elegida: filtrar por "Alimentos" no
  // tiene sentido si el desplegable sigue ofreciendo marcas de medicamentos.
  useEffect(() => {
    setMarca(null)
    getMarcas(tenantId, categoria ?? undefined).then(setMarcasDisponibles)
  }, [tenantId, categoria])

  useEffect(() => {
    const termino = busqueda.trim()
    // Sin texto y sin ningún filtro activo no hay nada que mostrar todavía:
    // traer "todo el catálogo" de una sola sería una consulta cara e inútil
    // apenas se abre el POS.
    if (termino.length < 2 && !categoria && !marca) {
      setResultados([])
      return
    }

    let vigente = true
    setCargando(true)

    const timer = setTimeout(() => {
      getProductos(tenantId, {
        busqueda: termino.length >= 2 ? termino : undefined,
        categoriaPrefijo: categoria ?? undefined,
        marca: marca ?? undefined,
        porPagina: 10,
      })
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
  }, [busqueda, categoria, marca, tenantId])

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

  /** Código leído por cámara: no hay "búsqueda a medias" como con el texto,
   *  así que sin match exacto va derecho a pedir a qué producto asignarlo. */
  const manejarCodigoEscaneado = async (codigo: string) => {
    setScannerOpen(false)
    const producto = await getProductoPorCodigo(tenantId, codigo)
    if (producto) {
      elegir(producto)
      return
    }
    setCodigoSinAsignar(codigo)
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground sm:h-4 sm:w-4" />
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
          className="h-9 w-full pl-8 text-sm sm:h-12 sm:pl-9 sm:text-base"
        />
      </div>

      <div className="flex flex-nowrap gap-1.5 sm:gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setScannerOpen(true)}
          className="h-8 flex-1 px-2 text-xs sm:h-12 sm:px-3 sm:text-sm"
        >
          <ScanBarcode className="h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Escanear</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAbrirAlimentos}
          className="h-8 flex-1 px-2 text-xs sm:h-12 sm:px-3 sm:text-sm"
        >
          <PawPrint className="h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Alimentos</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAbrirAtencion}
          className="h-8 flex-1 px-2 text-xs sm:h-12 sm:px-3 sm:text-sm"
        >
          <Stethoscope className="h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Atención</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FiltroCategoria
          value={categoria}
          onClick={(c) => setCategoria((actual) => (actual === c ? null : c))}
        />
        <Select
          value={marca ?? "_todas"}
          onValueChange={(v) => setMarca(v === "_todas" ? null : v)}
        >
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Marca" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_todas">Todas las marcas</SelectItem>
            {marcasDisponibles.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {cargando && resultados.length === 0 ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : resultados.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {busqueda.trim().length >= 2 || categoria || marca
              ? "Sin resultados"
              : "Escaneá un producto o empezá a escribir"}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {resultados.map((p) => (
              <ResultadoProducto key={p.id} producto={p} onElegir={() => elegir(p)} />
            ))}
          </div>
        )}
      </div>

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={manejarCodigoEscaneado}
      />

      <AsignarCodigoDialog
        tenantId={tenantId}
        codigo={codigoSinAsignar}
        open={codigoSinAsignar !== null}
        onOpenChange={(o) => !o && setCodigoSinAsignar(null)}
        onAsignado={(p) => { setCodigoSinAsignar(null); elegir(p) }}
      />
    </div>
  )
}

/** Chips de categoría: tocar la ya activa la apaga (vuelve a "Todos"). */
function FiltroCategoria({
  value,
  onClick,
}: {
  value: string | null
  onClick: (categoria: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORIAS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onClick(c)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            value === c
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-border bg-card text-muted-foreground hover:border-emerald-500 hover:text-foreground",
          )}
        >
          {c}
        </button>
      ))}
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
      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-card p-3 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-card dark:hover:bg-emerald-950/40"
    >
      <div className="flex min-w-0 flex-1 basis-full items-start gap-2 sm:basis-0">
        <span className="text-sm font-medium leading-snug">{descripcionBuscador(producto)}</span>
        {tieneOferta(producto) && (
          <Badge className="mt-0.5 shrink-0 bg-amber-500 hover:bg-amber-500">Oferta</Badge>
        )}
      </div>
      {producto.controlaStock && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {agotado ? "Sin stock" : `${formatCantidad(producto.stock)} ${porKg ? "kg" : "u."}`}
        </span>
      )}
      <span className="ml-auto shrink-0 font-bold text-emerald-600 dark:text-emerald-400 sm:ml-0">
        {formatCurrency(precioFinal(producto))}
        {porKg && <span className="text-xs font-normal"> / kg</span>}
      </span>
    </button>
  )
}

/**
 * Acá el nombre va primero y la marca después ("Handler Perros Adultos ·
 * HANDLER"): en el buscador de texto libre el vendedor ya escribió lo que
 * busca, así que lo relevante es confirmar el producto exacto primero. Es al
 * revés que en el remito (`descripcionLinea`), donde la marca abre porque ahí
 * es lo primero que identifica la línea a simple vista.
 */
function descripcionBuscador(producto: Producto): string {
  const partes = [producto.nombre, producto.marca, producto.linea].filter(
    (p): p is string => Boolean(p && p.trim()),
  )
  const presentacion = presentacionDe(producto)
  const base = partes.join(" · ")
  return presentacion ? `${base} · ${presentacion}` : base
}
