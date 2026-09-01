"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Loader2, Minus, PawPrint, Plus, ScanBarcode, Search, Stethoscope } from "lucide-react"
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
import { presentacionDe, type LineaCarrito } from "@/lib/ventas/carrito"
import { precioFinal, tieneOferta } from "@/lib/productos/precios"
import { formatCantidad, formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Producto } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  carrito: LineaCarrito[]
  onElegir: (producto: Producto, cantidad?: number) => void
  onQuitarUno: (producto: Producto) => void
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
export function BuscadorProductos({ tenantId, carrito, onElegir, onQuitarUno, onAbrirAlimentos, onAbrirAtencion }: Props) {
  const [busqueda, setBusqueda] = useState("")
  const [categoria, setCategoria] = useState<string | null>(null)
  const [marca, setMarca] = useState<string | null>(null)
  const [marcasDisponibles, setMarcasDisponibles] = useState<string[]>([])
  const [resultados, setResultados] = useState<Producto[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(0)
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

  const cambiarBusqueda = (v: string) => {
    setBusqueda(v)
    setPagina(0)
  }
  const cambiarCategoria = (c: string) => {
    setCategoria((actual) => (actual === c ? null : c))
    setPagina(0)
  }
  const cambiarMarca = (m: string | null) => {
    setMarca(m)
    setPagina(0)
  }

  useEffect(() => {
    const termino = busqueda.trim()
    // Sin texto y sin ningún filtro activo no hay nada que mostrar todavía:
    // traer "todo el catálogo" de una sola sería una consulta cara e inútil
    // apenas se abre el POS.
    if (termino.length < 2 && !categoria && !marca) {
      setResultados([])
      setTotal(0)
      return
    }

    let vigente = true
    setCargando(true)

    const timer = setTimeout(() => {
      getProductos(tenantId, {
        busqueda: termino.length >= 2 ? termino : undefined,
        categoriaPrefijo: categoria ?? undefined,
        marca: marca ?? undefined,
        pagina,
        porPagina: 10,
      })
        .then(({ productos, total }) => {
          if (vigente) { setResultados(productos); setTotal(total) }
        })
        .finally(() => {
          if (vigente) setCargando(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      vigente = false
      clearTimeout(timer)
    }
  }, [busqueda, categoria, marca, pagina, tenantId])

  const totalPaginas = Math.max(1, Math.ceil(total / 10))

  const elegir = (producto: Producto, cantidad?: number) => {
    onElegir(producto, cantidad)
    setBusqueda("")
    // Con un filtro de categoría/marca activo, la lista se deja tal cual:
    // el vendedor suele agregar varios productos seguidos del mismo rubro y
    // que la lista se vacíe de golpe lo obligaba a elegir el filtro de nuevo.
    if (!categoria && !marca) setResultados([])
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
          onChange={(e) => cambiarBusqueda(e.target.value)}
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
          onClick={cambiarCategoria}
        />
        <Select
          value={marca ?? "_todas"}
          onValueChange={(v) => cambiarMarca(v === "_todas" ? null : v)}
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
              <ResultadoProducto
                key={p.id}
                producto={p}
                cantidadEnCarrito={carrito.find((l) => l.id === p.id)?.cantidad ?? 0}
                onSumar={() => elegir(p, 1)}
                onRestar={() => onQuitarUno(p)}
              />
            ))}
          </div>
        )}
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-2 border-t pt-2">
          <Button
            type="button" variant="ghost" size="icon" className="h-7 w-7"
            disabled={pagina === 0}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {pagina + 1} de {totalPaginas}
          </span>
          <Button
            type="button" variant="ghost" size="icon" className="h-7 w-7"
            disabled={pagina + 1 >= totalPaginas}
            onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
            aria-label="Página siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

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

export function ResultadoProducto({
  producto,
  cantidadEnCarrito,
  onSumar,
  onRestar,
}: {
  producto: Producto
  cantidadEnCarrito: number
  onSumar: () => void
  onRestar: () => void
}) {
  const agotado = producto.controlaStock && producto.stock <= 0
  const porKg = producto.unidad === "kg"
  // Los fraccionados (por kg, bolsa con peso, paquete divisible) tienen su
  // propio diálogo con atajos y monto — acá alcanza con sumar de a 1 y que se
  // abra ese diálogo, sin duplicar un stepper que ahí no tiene sentido.
  const fraccionable =
    producto.unidad === "kg" ||
    (producto.unidad === "un" && ((producto.pesoKg ?? 0) > 0 || (producto.unidadesPorBulto ?? 0) > 0))

  const sumar = () => {
    if (agotado) {
      toast.error(`No hay stock de "${producto.nombre}"`)
      return
    }
    onSumar()
  }

  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-card p-3 transition-colors hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40",
        agotado && "opacity-50 hover:border-border hover:bg-card",
      )}
    >
      <button type="button" onClick={sumar} className="flex min-w-0 flex-1 basis-full items-start gap-2 text-left sm:basis-0">
        <span className="text-sm font-medium leading-snug">{descripcionBuscador(producto)}</span>
        {tieneOferta(producto) && (
          <Badge className="mt-0.5 shrink-0 bg-amber-500 hover:bg-amber-500">Oferta</Badge>
        )}
      </button>
      {producto.controlaStock && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {agotado ? "Sin stock" : `${formatCantidad(producto.stock)} ${porKg ? "kg" : "u."}`}
        </span>
      )}
      {!fraccionable && (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button" variant="outline" size="icon" className="h-7 w-7"
            aria-label="Sacar una unidad del carrito"
            disabled={cantidadEnCarrito === 0}
            onClick={onRestar}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-6 text-center text-sm font-semibold tabular-nums">{cantidadEnCarrito}</span>
          <Button
            type="button" variant="outline" size="icon" className="h-7 w-7"
            aria-label="Agregar una unidad al carrito"
            disabled={agotado}
            onClick={sumar}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      <span className="ml-auto shrink-0 font-bold text-emerald-600 dark:text-emerald-400 sm:ml-0">
        {formatCurrency(precioFinal(producto))}
        {porKg && <span className="text-xs font-normal"> / kg</span>}
      </span>
    </div>
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
