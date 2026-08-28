"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Search, AlertTriangle, ChevronLeft, ChevronRight, Tag, Upload, Pencil,
  Package, PackageX, ClipboardList, Layers, Plus, CalendarClock, Trash2,
  FileDown, Loader2, Percent, Scale, X, Eye, EyeOff, Boxes, FolderInput, ScanBarcode, ListChecks,
  Image as ImageIcon, SlidersHorizontal,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BarcodeScannerDialog } from "@/components/shared/barcode-scanner-dialog"
import { ProductoDialog } from "@/components/admin/productos/producto-dialog"
import { ImportDialog } from "@/components/admin/productos/import-dialog"
import { MargenDialog } from "@/components/admin/productos/margen-dialog"
import { FormatoVentaDialog } from "@/components/admin/productos/formato-venta-dialog"
import { CategoriaMasivaDialog } from "@/components/admin/productos/categoria-masiva-dialog"
import { StockMasivoDialog } from "@/components/admin/productos/stock-masivo-dialog"
import { EscanearDialog } from "@/components/admin/productos/escanear-dialog"
import { AgregarImagenDialog } from "@/components/admin/productos/agregar-imagen-dialog"
import { RubroCelda } from "@/components/admin/productos/rubro-celda"
import {
  getProductos, getCategorias, getStockStats, getVencimientosProximos,
  getTodosLosProductosParaExportar,
  createProducto, updateProducto, desactivarProducto, ajustarStock,
  setPublicadoEnLanding, setPublicadoEnLandingMasivo, setControlaStock, asignarCodigoBarras,
  type ProductoInput, type StockStats,
} from "@/lib/supabase/productos"
import { getTenantConfig } from "@/lib/supabase/queries"
import { descargarStockPDF } from "@/lib/productos/stock-pdf"
import type { AjusteStockTipo, Producto } from "@/lib/supabase/types"
import {
  precioFinal, tieneOferta, comboLabel, margenPct, estadoStock, diasHastaVencimiento,
} from "@/lib/productos/precios"
import { ordenarCategorias } from "@/lib/productos/categorias"
import { formatCurrency, formatCantidad } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useReadOnly } from "@/lib/auth/read-only-context"

const POR_PAGINA = 10
// Tope razonable para "seleccionar todos": ningún catálogo real tiene más
// filas que esto, y evita pedirle a la base una página sin límite.
const TODOS_LOS_PRODUCTOS = 5000
// PostgREST no devuelve más de ~1000 filas por consulta aunque se pida más
// en `.range()`, así que "seleccionar todos" trae el catálogo en tandas.
const TAMANO_TANDA = 1000

/**
 * El filtro de rubro necesita distinguir "sin elegir nada" (no filtrar) de
 * "elegí Sin rubro" (filtrar por categoría vacía) — los dos se ven como ""
 * en el estado de React, así que el segundo caso usa este sentinel en el
 * <select> y se traduce acá antes de pegarle a `getProductos`.
 */
const SIN_RUBRO = "__sin_rubro__"

function categoriaParaFiltro(categoria: string): string | undefined {
  if (categoria === "") return undefined
  if (categoria === SIN_RUBRO) return ""
  return categoria
}

type FiltroRapido = "todos" | "stockBajo" | "agotados" | "revisar" | "oferta"

interface Props {
  tenantId: string
}

export function ProductosManagement({ tenantId }: Props) {
  const [busqueda, setBusqueda] = useState("")
  const [busquedaDebounced, setBusquedaDebounced] = useState("")
  const [filtro, setFiltro] = useState<FiltroRapido>("todos")
  const [categoria, setCategoria] = useState("")
  const [categorias, setCategorias] = useState<string[]>([])
  const [incluirInactivos, setIncluirInactivos] = useState(false)
  const [publicadoFiltro, setPublicadoFiltro] = useState<"todos" | "publicados" | "no_publicados">("todos")

  const [productos, setProductos] = useState<Producto[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(0)
  const [cargando, setCargando] = useState(true)

  const [stats, setStats] = useState<StockStats | null>(null)
  const [vencimientos, setVencimientos] = useState<Producto[]>([])

  const [editando, setEditando] = useState<Producto | null>(null)
  const [productoOpen, setProductoOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [aDarDeBaja, setADarDeBaja] = useState<Producto | null>(null)
  const [exportando, setExportando] = useState(false)
  const [margenOpen, setMargenOpen] = useState(false)
  // Mapa (no un Set de ids) porque las acciones masivas necesitan el
  // producto completo, no solo el id — y "seleccionar todos" puede
  // seleccionar productos que no están en la página que se ve.
  const [seleccionadosMap, setSeleccionadosMap] = useState<Map<string, Producto>>(new Map())
  const [seleccionandoTodos, setSeleccionandoTodos] = useState(false)
  const [formatoVentaOpen, setFormatoVentaOpen] = useState(false)
  const [categoriaMasivaOpen, setCategoriaMasivaOpen] = useState(false)
  const [stockMasivoOpen, setStockMasivoOpen] = useState(false)
  const [escanearOpen, setEscanearOpen] = useState(false)
  // Los checkboxes de selección solo se muestran si el usuario los pidió:
  // por defecto molestan más de lo que ayudan en una tabla que se usa para
  // mirar stock, no para elegir productos.
  const [modoSeleccion, setModoSeleccion] = useState(false)
  const [codigoBarrasNuevo, setCodigoBarrasNuevo] = useState<string | undefined>(undefined)
  const readOnly = useReadOnly()

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda), 300)
    return () => clearTimeout(t)
  }, [busqueda])

  // Cualquier cambio de filtro invalida la página actual.
  useEffect(() => {
    setPagina(0)
  }, [busquedaDebounced, filtro, categoria, incluirInactivos, publicadoFiltro])

  const cargarLista = useCallback(async () => {
    setCargando(true)
    try {
      const res = await getProductos(tenantId, {
        busqueda: busquedaDebounced,
        categoria: categoriaParaFiltro(categoria),
        soloStockBajo: filtro === "stockBajo",
        soloAgotados: filtro === "agotados",
        soloRevisar: filtro === "revisar",
        soloOferta: filtro === "oferta",
        publicado: publicadoFiltro === "todos" ? undefined : publicadoFiltro === "publicados",
        incluirInactivos,
        pagina,
        porPagina: POR_PAGINA,
      })
      setProductos(res.productos)
      setTotal(res.total)
    } catch {
      toast.error("No se pudieron cargar los productos")
    } finally {
      setCargando(false)
    }
  }, [tenantId, busquedaDebounced, categoria, filtro, publicadoFiltro, incluirInactivos, pagina])

  // Contadores, rubros y vencimientos: si fallan no se rompe la tabla.
  const cargarAuxiliares = useCallback(async () => {
    const [s, c, v] = await Promise.all([
      getStockStats(tenantId).catch(() => null),
      getCategorias(tenantId).catch(() => [] as string[]),
      getVencimientosProximos(tenantId, 30).catch(() => [] as Producto[]),
    ])
    if (s) setStats(s)
    setCategorias(c)
    setVencimientos(v)
  }, [tenantId])

  useEffect(() => { cargarLista() }, [cargarLista])
  useEffect(() => { cargarAuxiliares() }, [cargarAuxiliares])

  // Una selección que sobrevive a un cambio de filtro/página termina
  // aplicando el formato a productos que ya no se están viendo — más
  // confuso que útil, así que se limpia apenas cambia lo que se lista.
  useEffect(() => { setSeleccionadosMap(new Map()) }, [busquedaDebounced, categoria, filtro, publicadoFiltro, incluirInactivos, pagina])

  const recargarTodo = useCallback(async () => {
    await Promise.all([cargarLista(), cargarAuxiliares()])
  }, [cargarLista, cargarAuxiliares])

  const seleccionados = useMemo(() => new Set(seleccionadosMap.keys()), [seleccionadosMap])

  const toggleSeleccionado = (p: Producto) => {
    setSeleccionadosMap((actual) => {
      const nuevo = new Map(actual)
      if (nuevo.has(p.id)) nuevo.delete(p.id)
      else nuevo.set(p.id, p)
      return nuevo
    })
  }

  const todosSeleccionadosEnPagina = productos.length > 0 && productos.every((p) => seleccionados.has(p.id))

  const toggleTodosEnPagina = () => {
    setSeleccionadosMap((actual) => {
      const nuevo = new Map(actual)
      if (todosSeleccionadosEnPagina) {
        productos.forEach((p) => nuevo.delete(p.id))
      } else {
        productos.forEach((p) => nuevo.set(p.id, p))
      }
      return nuevo
    })
  }

  /**
   * "Seleccionar todos": no solo tilda la página que se ve, trae del
   * servidor todos los productos que matchean el filtro actual (con el
   * mismo criterio que la lista) y los deja seleccionados de una — sin
   * mostrarlos en la tabla, que sigue paginada como siempre.
   */
  const seleccionarTodosCoincidentes = async () => {
    setSeleccionandoTodos(true)
    try {
      const filtroActual = {
        busqueda: busquedaDebounced,
        categoria: categoriaParaFiltro(categoria),
        soloStockBajo: filtro === "stockBajo",
        soloAgotados: filtro === "agotados",
        soloRevisar: filtro === "revisar",
        soloOferta: filtro === "oferta",
        publicado: publicadoFiltro === "todos" ? undefined : publicadoFiltro === "publicados",
        incluirInactivos,
      }

      // PostgREST corta cada consulta en ~1000 filas aunque se pida más
      // (`.range`), así que hay que traer el catálogo entero en tandas.
      const todos: Producto[] = []
      for (let pag = 0; todos.length < TODOS_LOS_PRODUCTOS; pag++) {
        const res = await getProductos(tenantId, {
          ...filtroActual,
          pagina: pag,
          porPagina: TAMANO_TANDA,
        })
        todos.push(...res.productos)
        if (res.productos.length < TAMANO_TANDA || todos.length >= res.total) break
      }

      setSeleccionadosMap(new Map(todos.map((p) => [p.id, p])))
    } catch {
      toast.error("No se pudieron seleccionar todos los productos")
    } finally {
      setSeleccionandoTodos(false)
    }
  }

  const productosSeleccionados = Array.from(seleccionadosMap.values())

  const [tabProductoDialog, setTabProductoDialog] = useState<"descripcion" | "stock">("descripcion")

  const abrirNuevo = () => {
    setEditando(null); setCodigoBarrasNuevo(undefined); setTabProductoDialog("descripcion")
    setProductoOpen(true)
  }
  const abrirEdicion = (p: Producto) => {
    setEditando(p); setTabProductoDialog("descripcion")
    setProductoOpen(true)
  }
  // "Agregar" en la columna de stock: va directo a cargar stock en vez de
  // obligar a pasar primero por la pestaña de Descripción. Si el producto
  // quedó marcado como servicio por error (por eso aparecía "Agotado" sin
  // poder cargarle nada), primero hay que prenderle el control de stock en
  // la base — si no, la pestaña Stock ni el bloque de movimientos aparecen.
  const abrirEdicionEnStock = async (p: Producto) => {
    let producto = p
    if (!p.controlaStock) {
      try {
        await setControlaStock(tenantId, p.id, true)
        producto = { ...p, controlaStock: true }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo activar el control de stock")
        return
      }
    }
    setEditando(producto); setTabProductoDialog("stock")
    setProductoOpen(true)
  }

  const [escaneandoParaProducto, setEscaneandoParaProducto] = useState<Producto | null>(null)
  const [agregandoImagenA, setAgregandoImagenA] = useState<Producto | null>(null)

  const asignarCodigoEscaneado = async (codigo: string) => {
    const producto = escaneandoParaProducto
    setEscaneandoParaProducto(null)
    if (!producto) return
    try {
      await asignarCodigoBarras(tenantId, producto.id, codigo)
      toast.success(`Código asignado a "${producto.nombre}"`)
      await cargarLista()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo asignar el código")
    }
  }

  // Desde "Escanear": el código no matcheó a nadie y el usuario prefirió dar
  // de alta un producto nuevo en vez de asignárselo a uno existente.
  const abrirNuevoConCodigo = (codigo: string) => {
    setEditando(null)
    setCodigoBarrasNuevo(codigo)
    setProductoOpen(true)
  }

  const guardarProducto = async (input: ProductoInput) => {
    try {
      if (editando) {
        await updateProducto(tenantId, editando.id, input)
        toast.success("Producto actualizado")
      } else {
        await createProducto(tenantId, input)
        toast.success("Producto creado")
      }
      await recargarTodo()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el producto")
      throw e
    }
  }

  const [publicando, setPublicando] = useState<string | null>(null)

  const togglePublicado = async (p: Producto) => {
    setPublicando(p.id)
    try {
      await setPublicadoEnLanding(tenantId, p.id, !p.publicadoEnLanding)
      await cargarLista()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar la publicación")
    } finally {
      setPublicando(null)
    }
  }

  const [publicandoMasivo, setPublicandoMasivo] = useState(false)

  const publicarMasivo = async (publicado: boolean) => {
    setPublicandoMasivo(true)
    try {
      const actualizados = await setPublicadoEnLandingMasivo(tenantId, productosSeleccionados, publicado)
      toast.success(
        `${actualizados} producto${actualizados === 1 ? "" : "s"} ` +
        `${publicado ? "publicado" : "despublicado"}${actualizados === 1 ? "" : "s"}`,
      )
      setSeleccionadosMap(new Map())
      await cargarLista()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar la publicación")
    } finally {
      setPublicandoMasivo(false)
    }
  }

  const moverStock = async (tipo: AjusteStockTipo, cantidad: number, referencia: string) => {
    if (!editando) return
    try {
      const res = await ajustarStock(editando.id, tipo, cantidad, referencia)
      toast.success(`Stock actualizado: ${formatCantidad(res.stockNuevo)}`)
      // El diálogo sigue abierto: se refleja el stock nuevo sin cerrarlo.
      setEditando((p) => (p ? { ...p, stock: res.stockNuevo } : p))
      await recargarTodo()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo ajustar el stock")
    }
  }

  const darDeBaja = async () => {
    if (!aDarDeBaja) return
    try {
      await desactivarProducto(tenantId, aDarDeBaja.id)
      toast.success("Producto dado de baja")
      await recargarTodo()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo dar de baja")
    } finally {
      setADarDeBaja(null)
    }
  }

  /**
   * Único lugar donde se trae el catálogo entero, y solo porque el usuario lo
   * pidió explícitamente: la tabla de la pantalla nunca deja de paginar.
   */
  const exportarStockPDF = async () => {
    setExportando(true)
    try {
      const [productosExportar, config] = await Promise.all([
        getTodosLosProductosParaExportar(tenantId, { categoria: categoriaParaFiltro(categoria) }),
        getTenantConfig(tenantId),
      ])
      if (productosExportar.length === 0) {
        toast.error("No hay productos para exportar")
        return
      }
      descargarStockPDF(productosExportar, config?.nombre || "VetPanel")
    } catch {
      toast.error("No se pudo generar el PDF del stock")
    } finally {
      setExportando(false)
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  const tarjetas = useMemo(
    () => [
      { key: "todos" as const, label: "Productos", valor: stats?.total, icon: Layers, color: "text-foreground" },
      { key: "stockBajo" as const, label: "Stock bajo", valor: stats?.stockBajo, icon: Package, color: "text-amber-600" },
      { key: "agotados" as const, label: "Agotados", valor: stats?.agotados, icon: PackageX, color: "text-red-600" },
      { key: "revisar" as const, label: "A revisar", valor: stats?.revisar, icon: ClipboardList, color: "text-amber-600" },
    ],
    [stats],
  )

  const vencidos = vencimientos.filter((p) => (diasHastaVencimiento(p.fechaVencimiento) ?? 1) < 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Productos</h1>
          <p className="text-sm text-muted-foreground">
            Mercadería, medicamentos y servicios de la veterinaria.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportarStockPDF} disabled={exportando}>
            {exportando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="mr-2 h-4 w-4" />
            )}
            Stock en PDF
          </Button>
          <Button variant="outline" onClick={() => setMargenOpen(true)}>
            <Percent className="mr-2 h-4 w-4" /> Aplicar ganancia
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> Importar
          </Button>
          <Button variant="outline" onClick={() => setEscanearOpen(true)} disabled={readOnly}>
            <ScanBarcode className="mr-2 h-4 w-4" /> Escanear
          </Button>
          <Button
            variant={modoSeleccion ? "secondary" : "outline"}
            onClick={() => {
              setModoSeleccion((v) => !v)
              setSeleccionadosMap(new Map())
            }}
          >
            <ListChecks className="mr-2 h-4 w-4" /> {modoSeleccion ? "Ocultar selección" : "Seleccionar"}
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={abrirNuevo}
            disabled={readOnly}
            title={readOnly ? "Reactivá tu cuenta para editar" : undefined}
          >
            <Plus className="mr-2 h-4 w-4" /> Nuevo producto
          </Button>
        </div>
      </div>

      {/* Tarjetas: además de informar, funcionan como filtro rápido */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tarjetas.map((t) => (
          <button
            key={t.key}
            onClick={() => setFiltro((f) => (f === t.key ? "todos" : t.key))}
            className={cn(
              "rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/50",
              filtro === t.key && "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
            )}
          >
            <t.icon className={cn("mb-2 h-4 w-4", t.color)} />
            <p className={cn("text-2xl font-bold", t.color)}>{t.valor ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{t.label}</p>
          </button>
        ))}
      </div>

      {vencimientos.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {vencidos.length > 0 && (
              <><strong>{vencidos.length}</strong> ya {vencidos.length === 1 ? "venció" : "vencieron"}
                {vencimientos.length > vencidos.length && " y "}</>
            )}
            {vencimientos.length > vencidos.length && (
              <><strong>{vencimientos.length - vencidos.length}</strong> vencen en los próximos 30 días</>
            )}
            : {vencimientos.slice(0, 3).map((p) => p.nombre).join(", ")}
            {vencimientos.length > 3 && ` y ${vencimientos.length - 3} más`}
          </span>
        </div>
      )}

      {seleccionados.size > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-emerald-800 dark:text-emerald-400">
              {seleccionados.size} producto{seleccionados.size === 1 ? "" : "s"} seleccionado{seleccionados.size === 1 ? "" : "s"}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setFormatoVentaOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
                <Scale className="mr-2 h-3.5 w-3.5" /> Cambiar formato de venta
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCategoriaMasivaOpen(true)}>
                <FolderInput className="mr-2 h-3.5 w-3.5" /> Cambiar rubro
              </Button>
              <Button size="sm" variant="outline" onClick={() => setStockMasivoOpen(true)}>
                <Boxes className="mr-2 h-3.5 w-3.5" /> Mover stock
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={() => publicarMasivo(true)}
                disabled={publicandoMasivo}
              >
                <Eye className="mr-2 h-3.5 w-3.5" /> Publicar en la página
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={() => publicarMasivo(false)}
                disabled={publicandoMasivo}
              >
                <EyeOff className="mr-2 h-3.5 w-3.5" /> Despublicar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSeleccionadosMap(new Map())}>
                <X className="mr-2 h-3.5 w-3.5" /> Cancelar
              </Button>
            </div>
          </div>

          {/* Tildaste todo lo que se ve, pero hay más páginas: capaz quería
              decir "todo el catálogo", no solo esta página. */}
          {todosSeleccionadosEnPagina && seleccionados.size < total && (
            <button
              type="button"
              onClick={seleccionarTodosCoincidentes}
              disabled={seleccionandoTodos}
              className="self-start text-xs font-medium text-emerald-700 underline underline-offset-2 disabled:opacity-60 dark:text-emerald-400"
            >
              {seleccionandoTodos ? "Seleccionando…" : `Seleccionar los ${total} productos`}
            </button>
          )}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o código…"
          className="pl-10"
        />
      </div>

      {/* Desktop: los filtros van todos en fila. En celular se amontonan y
          rompen el layout, así que se esconden atrás de un botón. */}
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        <FiltrosProductos
          categoria={categoria} setCategoria={setCategoria}
          categorias={categorias}
          filtro={filtro} setFiltro={setFiltro}
          publicadoFiltro={publicadoFiltro} setPublicadoFiltro={setPublicadoFiltro}
          incluirInactivos={incluirInactivos} setIncluirInactivos={setIncluirInactivos}
        />
      </div>

      <div className="sm:hidden">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <SlidersHorizontal className="mr-2 h-3.5 w-3.5" /> Filtros
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="flex w-72 flex-col gap-2">
            <FiltrosProductos
              categoria={categoria} setCategoria={setCategoria}
              categorias={categorias}
              filtro={filtro} setFiltro={setFiltro}
              publicadoFiltro={publicadoFiltro} setPublicadoFiltro={setPublicadoFiltro}
              incluirInactivos={incluirInactivos} setIncluirInactivos={setIncluirInactivos}
              apilado
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="rounded-xl border bg-card">
        {cargando ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : productos.length === 0 ? (
          <div className="py-14 text-center">
            <Package className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {busquedaDebounced || filtro !== "todos" || categoria
                ? "No hay productos que coincidan con el filtro"
                : "Todavía no cargaste productos"}
            </p>
            {!busquedaDebounced && filtro === "todos" && !categoria && (
              <Button
                className="mt-4 bg-emerald-600 hover:bg-emerald-700"
                onClick={abrirNuevo}
                disabled={readOnly}
                title={readOnly ? "Reactivá tu cuenta para editar" : undefined}
              >
                <Plus className="mr-2 h-4 w-4" /> Cargar el primero
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {modoSeleccion && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={todosSeleccionadosEnPagina}
                        onCheckedChange={toggleTodosEnPagina}
                        aria-label="Seleccionar todos"
                      />
                    </TableHead>
                  )}
                  <TableHead>Producto</TableHead>
                  <TableHead className="hidden md:table-cell">Rubro</TableHead>
                  <TableHead className="text-right">Precio original</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Margen</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Precio con %</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productos.map((p) => {
                  const estado = estadoStock(p)
                  const margen = margenPct(p.precio, p.costo)
                  const enOferta = tieneOferta(p)
                  const combo = comboLabel(p)
                  // Precio efectivo por unidad con la oferta puesta: en combo no hay
                  // precio unitario fijo, se aproxima con el precio del combo repartido
                  // entre las unidades que incluye.
                  const precioUnitOferta = enOferta
                    ? combo && p.ofertaCantidad
                      ? (p.ofertaValor ?? 0) / p.ofertaCantidad
                      : precioFinal(p)
                    : null
                  const margenOferta = precioUnitOferta !== null ? margenPct(precioUnitOferta, p.costo) : null

                  return (
                    <TableRow key={p.id} className={cn(!p.activo && "opacity-50")}>
                      {modoSeleccion && (
                        <TableCell>
                          <Checkbox
                            checked={seleccionados.has(p.id)}
                            onCheckedChange={() => toggleSeleccionado(p)}
                            aria-label={`Seleccionar ${p.nombre}`}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          {/* Las miniaturas quedan ocultas a propósito por ahora,
                              aunque el producto tenga imagenUrl cargada. */}
                          <div className="min-w-0">
                        <p className="line-clamp-1 font-medium">{p.nombre}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {(p.codigoBarras || p.codigo) && (
                            <span className="text-xs text-muted-foreground">
                              {p.codigoBarras || p.codigo}
                            </span>
                          )}
                          {!p.activo && <Badge variant="outline">Dado de baja</Badge>}
                          {p.revisar && (
                            <Badge variant="outline" className="border-amber-500 text-amber-600">
                              <AlertTriangle className="mr-1 h-3 w-3" /> A revisar
                            </Badge>
                          )}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="hidden md:table-cell">
                        <RubroCelda
                          tenantId={tenantId}
                          producto={p}
                          categoriasExistentes={categorias}
                          onCambiado={recargarTodo}
                          onAbrirEdicion={abrirEdicion}
                        />
                      </TableCell>

                      <TableCell className="text-right">
                        {formatCurrency(p.precioLista)}
                      </TableCell>

                      <TableCell className="hidden text-right text-xs lg:table-cell">
                        {margen === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : enOferta ? (
                          <span className="flex flex-col items-end leading-tight">
                            <span className="text-muted-foreground line-through">{margen.toFixed(0)}%</span>
                            <span className={cn(
                              "font-medium",
                              margenOferta !== null && margenOferta < 0 ? "text-red-600" : "text-emerald-600",
                            )}>
                              {margenOferta !== null ? `${margenOferta.toFixed(0)}%` : "—"}
                            </span>
                          </span>
                        ) : (
                          <span className={margen < 0 ? "font-medium text-red-600" : "text-muted-foreground"}>
                            {margen.toFixed(0)}%
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="hidden text-right lg:table-cell">
                        {combo ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                            <Tag className="h-3 w-3" /> {combo}
                          </span>
                        ) : enOferta ? (
                          <span className="flex flex-col items-end leading-tight">
                            <span className="text-xs text-muted-foreground line-through">
                              {formatCurrency(p.precio)}
                            </span>
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                              <Tag className="h-3 w-3" /> {formatCurrency(precioFinal(p))}
                            </span>
                          </span>
                        ) : (
                          formatCurrency(p.precio)
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        {estado === "servicio" ? (
                          <span className="text-xs text-muted-foreground">Servicio</span>
                        ) : (
                          <span className="flex items-center justify-end gap-1.5">
                            <span className={cn(
                              "font-semibold",
                              estado === "agotado" && "text-red-600",
                              estado === "bajo" && "text-amber-600",
                            )}>
                              {formatCantidad(p.stock)}
                            </span>
                            <span className="text-xs text-muted-foreground">{p.unidad}</span>
                            {estado === "agotado" ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    disabled={readOnly}
                                    title="Cargar stock"
                                    className="rounded-full border border-emerald-500 px-2 py-0.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-60 dark:hover:bg-emerald-950/40"
                                  >
                                    Agregar
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => abrirEdicionEnStock(p)}>
                                    <Boxes className="mr-2 h-3.5 w-3.5" /> Sumar stock
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setEscaneandoParaProducto(p)}>
                                    <ScanBarcode className="mr-2 h-3.5 w-3.5" /> Asignar código de barras
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setAgregandoImagenA(p)}>
                                    <ImageIcon className="mr-2 h-3.5 w-3.5" /> Agregar imagen
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : estado === "bajo" && (
                              <Badge variant="outline" className="border-amber-500 text-amber-600">
                                Bajo
                              </Badge>
                            )}
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm" variant="ghost"
                            className={cn("h-8 px-2", p.publicadoEnLanding && "text-emerald-600")}
                            onClick={() => togglePublicado(p)}
                            disabled={publicando === p.id || readOnly}
                            title={p.publicadoEnLanding ? "Publicado en tu página" : "No publicado"}
                          >
                            {p.publicadoEnLanding
                              ? <Eye className="h-3.5 w-3.5" />
                              : <EyeOff className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            size="sm" variant="ghost" className="h-8 px-2"
                            onClick={() => abrirEdicion(p)}
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {p.activo && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-8 px-2 text-muted-foreground hover:text-red-600"
                              onClick={() => setADarDeBaja(p)}
                              title="Dar de baja"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {total > POR_PAGINA && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline" size="icon"
            disabled={pagina === 0}
            onClick={() => setPagina((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {pagina + 1} de {totalPaginas} · {total} productos
          </span>
          <Button
            variant="outline" size="icon"
            disabled={pagina + 1 >= totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <ProductoDialog
        tenantId={tenantId}
        producto={editando}
        categoriasExistentes={categorias}
        codigoBarrasInicial={codigoBarrasNuevo}
        tabInicial={tabProductoDialog}
        open={productoOpen}
        onOpenChange={setProductoOpen}
        onGuardar={guardarProducto}
        onAjustarStock={moverStock}
      />

      <EscanearDialog
        tenantId={tenantId}
        open={escanearOpen}
        onOpenChange={setEscanearOpen}
        onCambio={recargarTodo}
        onCrearNuevo={abrirNuevoConCodigo}
      />

      <BarcodeScannerDialog
        open={escaneandoParaProducto !== null}
        onOpenChange={(o) => !o && setEscaneandoParaProducto(null)}
        onDetected={asignarCodigoEscaneado}
      />

      <AgregarImagenDialog
        tenantId={tenantId}
        producto={agregandoImagenA}
        open={agregandoImagenA !== null}
        onOpenChange={(o) => !o && setAgregandoImagenA(null)}
        onActualizado={cargarLista}
      />

      <ImportDialog
        tenantId={tenantId}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportado={recargarTodo}
      />

      <MargenDialog
        tenantId={tenantId}
        categorias={categorias}
        open={margenOpen}
        onOpenChange={setMargenOpen}
        onAplicado={recargarTodo}
      />

      <FormatoVentaDialog
        tenantId={tenantId}
        productos={productosSeleccionados}
        open={formatoVentaOpen}
        onOpenChange={setFormatoVentaOpen}
        onAplicado={() => {
          setSeleccionadosMap(new Map())
          recargarTodo()
        }}
      />

      <CategoriaMasivaDialog
        tenantId={tenantId}
        productos={productosSeleccionados}
        categoriasExistentes={categorias}
        open={categoriaMasivaOpen}
        onOpenChange={setCategoriaMasivaOpen}
        onAplicado={() => {
          setSeleccionadosMap(new Map())
          recargarTodo()
        }}
      />

      <StockMasivoDialog
        productos={productosSeleccionados}
        open={stockMasivoOpen}
        onOpenChange={setStockMasivoOpen}
        onAplicado={() => {
          setSeleccionadosMap(new Map())
          recargarTodo()
        }}
      />

      <AlertDialog open={aDarDeBaja !== null} onOpenChange={(o) => !o && setADarDeBaja(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Dar de baja &ldquo;{aDarDeBaja?.nombre}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Deja de aparecer en el listado, pero no se borra: los movimientos de stock y el
              historial de precios se conservan. Podés volver a activarlo desde
              &ldquo;Ver dados de baja&rdquo;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={darDeBaja}>Dar de baja</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface FiltrosProductosProps {
  categoria: string
  setCategoria: (v: string) => void
  categorias: string[]
  filtro: FiltroRapido
  setFiltro: (v: FiltroRapido) => void
  publicadoFiltro: "todos" | "publicados" | "no_publicados"
  setPublicadoFiltro: (v: "todos" | "publicados" | "no_publicados") => void
  incluirInactivos: boolean
  setIncluirInactivos: (v: (actual: boolean) => boolean) => void
  /** Modo popover de celular: los controles ocupan todo el ancho, uno debajo del otro. */
  apilado?: boolean
}

/** Los 4 controles de filtro, compartidos entre la fila de escritorio y el popover de celular. */
function FiltrosProductos({
  categoria, setCategoria, categorias, filtro, setFiltro,
  publicadoFiltro, setPublicadoFiltro, incluirInactivos, setIncluirInactivos, apilado,
}: FiltrosProductosProps) {
  const anchoSelect = apilado ? "w-full" : ""
  const claseSelect = cn(
    "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30",
    anchoSelect,
  )

  return (
    <>
      <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={claseSelect}>
        <option value="">Todos los rubros</option>
        <option value={SIN_RUBRO}>Sin rubro</option>
        {ordenarCategorias(categorias).map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      <select
        value={filtro === "oferta" ? "oferta" : "todos"}
        onChange={(e) => setFiltro(e.target.value === "oferta" ? "oferta" : "todos")}
        className={claseSelect}
      >
        <option value="todos">Todas las ofertas</option>
        <option value="oferta">En oferta</option>
      </select>

      <select
        value={publicadoFiltro}
        onChange={(e) => setPublicadoFiltro(e.target.value as typeof publicadoFiltro)}
        className={claseSelect}
      >
        <option value="todos">Publicados y no publicados</option>
        <option value="publicados">Publicados</option>
        <option value="no_publicados">No publicados</option>
      </select>

      <Button
        variant={incluirInactivos ? "secondary" : "ghost"}
        size="sm"
        className={anchoSelect}
        onClick={() => setIncluirInactivos((v) => !v)}
      >
        {incluirInactivos ? "Ocultar dados de baja" : "Ver dados de baja"}
      </Button>
    </>
  )
}
