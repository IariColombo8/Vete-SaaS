"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, ChevronLeft, ChevronRight, Search, SlidersHorizontal, Sparkles } from "lucide-react"
import { getTenant, getTenantConfig } from "@/lib/supabase/queries"
import { getProductosPublicados, getProductosPublicadosPorIds } from "@/lib/supabase/productos"
import { getPromocionesPublicadas } from "@/lib/supabase/promociones"
import { getSorteoActivo } from "@/lib/supabase/sorteos"
import { SorteoTeaser } from "@/components/public/sorteo-banner"
import { precioFinal, tieneOferta } from "@/lib/productos/precios"
import { normalizePlan, PLANS } from "@/lib/plans"
import type { TenantConfig } from "@/lib/supabase/queries"
import type { Producto, Promocion, Sorteo } from "@/lib/supabase/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet"
import { ProductoTarjeta } from "@/components/public/producto-tarjeta"
import { PromocionTarjeta } from "@/components/public/promocion-tarjeta"
import { FiltrosSidebar, type FiltrosState } from "@/components/public/filtros-sidebar"
import { DetalleDialog } from "@/components/public/detalle-dialog"

const FILTROS_VACIOS: FiltrosState = {
  categorias: [], marcas: [], soloOfertas: false, orden: "relevancia", precioDesde: "", precioHasta: "",
}

const PRODUCTOS_POR_PAGINA = 16

export default function ProductosPublicosPage() {
  const params = useParams()
  const slug = params.slug as string
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<TenantConfig | null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [promociones, setPromociones] = useState<Promocion[]>([])
  const [productosDePromos, setProductosDePromos] = useState<Record<string, Producto>>({})
  const [sorteoActivo, setSorteoActivo] = useState<Sorteo | null>(null)

  const [busqueda, setBusqueda] = useState("")
  const [filtros, setFiltros] = useState<FiltrosState>(FILTROS_VACIOS)
  const [pagina, setPagina] = useState(1)
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const [productoSeleccionado, setProductoSeleccionado] = useState<Producto | null>(null)
  const [promocionSeleccionada, setPromocionSeleccionada] = useState<Promocion | null>(null)

  useEffect(() => {
    Promise.all([
      getTenant(slug), getTenantConfig(slug), getProductosPublicados(slug), getPromocionesPublicadas(slug), getSorteoActivo(slug),
    ]).then(
      async ([t, cfg, prods, promos, sorteo]) => {
        const tieneProductos = PLANS[normalizePlan(cfg?.plan)].features.productos && prods.length > 0
        const tienePromos = PLANS[normalizePlan(cfg?.plan)].features.promosSorteos && promos.length > 0
        if (!t || (!tieneProductos && !tienePromos)) {
          router.replace(`/${slug}`)
          return
        }
        setConfig(cfg)
        setProductos(prods)
        setPromociones(promos)
        setSorteoActivo(sorteo)
        setLoading(false)

        const ids = Array.from(new Set(promos.flatMap((p) => p.items.map((i) => i.productoId))))
        const productosPromo = await getProductosPublicadosPorIds(slug, ids)
        setProductosDePromos(Object.fromEntries(productosPromo.map((p) => [p.id, p])))
      },
    )
  }, [slug, router])

  const productosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    const desde = filtros.precioDesde ? Number(filtros.precioDesde) : null
    const hasta = filtros.precioHasta ? Number(filtros.precioHasta) : null

    const filtrados = productos.filter((p) => {
      const cat = p.categoria || "Otros"
      const mar = p.marca || "Sin marca"
      const precio = precioFinal(p)
      if (filtros.categorias.length > 0 && !filtros.categorias.includes(cat)) return false
      if (filtros.marcas.length > 0 && !filtros.marcas.includes(mar)) return false
      if (filtros.soloOfertas && !tieneOferta(p)) return false
      if (desde !== null && precio < desde) return false
      if (hasta !== null && precio > hasta) return false
      if (termino && !p.nombre.toLowerCase().includes(termino)) return false
      return true
    })

    if (filtros.orden === "precioAsc") return filtrados.sort((a, b) => precioFinal(a) - precioFinal(b))
    if (filtros.orden === "precioDesc") return filtrados.sort((a, b) => precioFinal(b) - precioFinal(a))
    return filtrados
  }, [productos, busqueda, filtros])

  // Al cambiar filtros/búsqueda, siempre se vuelve a la primera página —
  // si no, se puede quedar en una página vacía con la lista ya filtrada.
  useEffect(() => { setPagina(1) }, [busqueda, filtros])

  const totalPaginas = Math.max(1, Math.ceil(productosFiltrados.length / PRODUCTOS_POR_PAGINA))
  const productosPagina = productosFiltrados.slice(
    (pagina - 1) * PRODUCTOS_POR_PAGINA,
    pagina * PRODUCTOS_POR_PAGINA,
  )

  const promocionesFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    if (!termino) return promociones
    return promociones.filter((p) => p.nombre.toLowerCase().includes(termino))
  }, [promociones, busqueda])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="h-14 w-14 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin" />
          <span className="text-sm text-slate-500 font-medium animate-pulse">Cargando catálogo...</span>
        </div>
      </div>
    )
  }

  const hayPromos = promocionesFiltradas.length > 0
  const hayProductos = productos.length > 0
  const hayFiltrosActivos = filtros.categorias.length > 0 || filtros.marcas.length > 0 || filtros.soloOfertas
    || filtros.orden !== "relevancia" || filtros.precioDesde !== "" || filtros.precioHasta !== ""
  const mostrarSidebar = hayProductos && (productos.length > 8 || hayFiltrosActivos)
  const nombre = config?.nombre || slug

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ╔══════════════════════════════════════════════════╗
          ║                    HEADER                        ║
          ╚══════════════════════════════════════════════════╝ */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-emerald-950 to-teal-950">
        <div className="vet-blob vet-blob-1" />
        <div className="vet-blob vet-blob-2" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)",
            backgroundSize: "36px 36px",
          }}
        />

        <div className="container relative max-w-6xl mx-auto px-6 pt-10 pb-16">
          <Button
            variant="ghost"
            className="mb-8 -ml-3 text-white/60 hover:text-white hover:bg-white/10"
            onClick={() => router.push(`/${slug}`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a {nombre}
          </Button>

          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/15 backdrop-blur-xl px-4 py-1.5 mb-5">
            <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
            <span className="text-xs font-bold text-emerald-300 tracking-[0.15em] uppercase">
              Catálogo
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight">
            Productos y{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">
              promociones
            </span>
          </h1>
        </div>
      </div>

      <div className="container max-w-6xl mx-auto px-6 py-10">

        {/* ╔══════════════════════════════════════════════════╗
            ║              PROMOCIONES DESTACADAS              ║
            ╚══════════════════════════════════════════════════╝ */}
        {hayPromos && (
          <section className="mb-14">
            <h2 className="mb-5 text-lg font-bold text-slate-900 dark:text-white">Promociones destacadas</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {promocionesFiltradas.map((p) => (
                <PromocionTarjeta
                  key={p.id} promocion={p} productos={productosDePromos} logo={config?.logo}
                  onClick={() => setPromocionSeleccionada(p)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ╔══════════════════════════════════════════════════╗
            ║              SIDEBAR + PRODUCTOS                 ║
            ╚══════════════════════════════════════════════════╝ */}
        {hayProductos && (
          <section>
            <div className="mb-5 flex items-baseline justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Productos</h2>
              <span className="text-sm text-slate-400">{productosFiltrados.length} resultados</span>
            </div>

            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              {mostrarSidebar && (
                <div className="lg:w-64 lg:shrink-0">
                  <div className="hidden lg:block lg:sticky lg:top-8">
                    <FiltrosSidebar productos={productos} filtros={filtros} onChange={setFiltros} busqueda={busqueda} onBusquedaChange={setBusqueda} />
                  </div>

                  {/* Trigger de filtros mobile */}
                  <div className="lg:hidden flex justify-end">
                    <Sheet open={filtrosAbiertos} onOpenChange={setFiltrosAbiertos}>
                      <SheetTrigger asChild>
                        <Button variant="outline" className="rounded-full gap-2">
                          <SlidersHorizontal className="h-4 w-4" />
                          Filtros
                          {hayFiltrosActivos && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                        </Button>
                      </SheetTrigger>
                      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
                        <SheetHeader>
                          <SheetTitle>Filtros</SheetTitle>
                        </SheetHeader>
                        <div className="px-4 pb-6">
                          <FiltrosSidebar productos={productos} filtros={filtros} onChange={setFiltros} busqueda={busqueda} onBusquedaChange={setBusqueda} />
                        </div>
                      </SheetContent>
                    </Sheet>
                  </div>
                </div>
              )}

              <div className="flex-1 min-w-0">
                {productosFiltrados.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                      {productosPagina.map((p) => (
                        <ProductoTarjeta
                          key={p.id} producto={p} logo={config?.logo}
                          onClick={() => setProductoSeleccionado(p)}
                        />
                      ))}
                    </div>

                    {totalPaginas > 1 && (
                      <div className="mt-8 flex items-center justify-center gap-3">
                        <Button
                          variant="outline" size="icon" className="rounded-full"
                          disabled={pagina === 1}
                          onClick={() => setPagina((p) => Math.max(1, p - 1))}
                          aria-label="Página anterior"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>

                        <span className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                          Página
                          <Input
                            type="number"
                            min={1}
                            max={totalPaginas}
                            value={pagina}
                            onChange={(e) => {
                              const n = Number(e.target.value)
                              if (Number.isFinite(n)) setPagina(Math.min(totalPaginas, Math.max(1, n)))
                            }}
                            className="h-9 w-16 text-center"
                          />
                          de {totalPaginas}
                        </span>

                        <Button
                          variant="outline" size="icon" className="rounded-full"
                          disabled={pagina === totalPaginas}
                          onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                          aria-label="Página siguiente"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <EstadoVacio
                    texto="No hay productos que coincidan con la búsqueda."
                    onLimpiar={hayFiltrosActivos ? () => setFiltros(FILTROS_VACIOS) : undefined}
                  />
                )}
              </div>
            </div>
          </section>
        )}

        {!hayPromos && !hayProductos && (
          <EstadoVacio texto="No hay productos ni promociones que coincidan con la búsqueda." />
        )}
      </div>

      <DetalleDialog
        producto={productoSeleccionado}
        promocion={promocionSeleccionada}
        productosDePromos={productosDePromos}
        logo={config?.logo}
        onOpenChange={(open) => {
          if (!open) { setProductoSeleccionado(null); setPromocionSeleccionada(null) }
        }}
      />

      {sorteoActivo && <SorteoTeaser tenantId={slug} sorteo={sorteoActivo} />}
    </main>
  )
}

function EstadoVacio({ texto, onLimpiar }: { texto: string; onLimpiar?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-slate-200
                    dark:border-slate-800 py-20 text-center">
      <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
        <Search className="h-6 w-6 text-slate-300 dark:text-slate-700" />
      </div>
      <p className="text-slate-400 dark:text-slate-600 max-w-xs">{texto}</p>
      {onLimpiar && (
        <button
          onClick={onLimpiar}
          className="text-sm font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  )
}
