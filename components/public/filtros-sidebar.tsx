"use client"

import { Search } from "lucide-react"
import type { Producto } from "@/lib/supabase/types"

export type OrdenPrecio = "relevancia" | "precioAsc" | "precioDesc"

export interface FiltrosState {
  categorias: string[]
  marcas: string[]
  soloOfertas: boolean
  orden: OrdenPrecio
  precioDesde: string
  precioHasta: string
}

interface FiltrosSidebarProps {
  productos: Producto[]
  filtros: FiltrosState
  onChange: (filtros: FiltrosState) => void
  busqueda: string
  onBusquedaChange: (busqueda: string) => void
}

// Devuelve el mapa categoria -> marcas (con conteo) a partir de los productos.
function agruparCategorias(productos: Producto[]) {
  const mapa = new Map<string, Map<string, number>>()
  for (const p of productos) {
    const cat = p.categoria ?? "Otros"
    const marca = p.marca ?? "Sin marca"
    if (!mapa.has(cat)) mapa.set(cat, new Map())
    const marcas = mapa.get(cat)!
    marcas.set(marca, (marcas.get(marca) ?? 0) + 1)
  }
  return mapa
}

const FILTROS_VACIOS: FiltrosState = {
  categorias: [], marcas: [], soloOfertas: false, orden: "relevancia", precioDesde: "", precioHasta: "",
}

export function FiltrosSidebar({ productos, filtros, onChange, busqueda, onBusquedaChange }: FiltrosSidebarProps) {
  const categorias = agruparCategorias(productos)
  const hayFiltros = filtros.categorias.length > 0 || filtros.marcas.length > 0 || filtros.soloOfertas
    || filtros.orden !== "relevancia" || filtros.precioDesde !== "" || filtros.precioHasta !== ""

  const toggle = (lista: string[], valor: string) =>
    lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]

  const toggleCategoria = (cat: string) =>
    onChange({ ...filtros, categorias: toggle(filtros.categorias, cat) })

  const toggleMarca = (marca: string) =>
    onChange({ ...filtros, marcas: toggle(filtros.marcas, marca) })

  return (
    <aside className="w-full lg:w-64 lg:shrink-0">
      <div className="lg:sticky lg:top-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 dark:text-emerald-400" aria-hidden="true">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Filtros
          </h3>
          {hayFiltros && (
            <button
              type="button"
              onClick={() => onChange(FILTROS_VACIOS)}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline dark:text-emerald-400"
            >
              Limpiar
            </button>
          )}
        </div>

        {/* Buscador */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => onBusquedaChange(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900
                       placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2
                       focus:ring-emerald-400/20 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
          />
        </div>

        {/* Solo ofertas */}
        <label className="mb-5 flex cursor-pointer items-center gap-2.5 rounded-lg bg-amber-50 px-3 py-2.5 dark:bg-amber-500/10">
          <input
            type="checkbox"
            checked={filtros.soloOfertas}
            onChange={() => onChange({ ...filtros, soloOfertas: !filtros.soloOfertas })}
            className="h-4 w-4 rounded border-slate-300 text-amber-500 accent-amber-500"
          />
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Solo ofertas</span>
        </label>

        {/* Categorías y marcas */}
        <div className="space-y-5">
          {Array.from(categorias.entries()).map(([categoria, marcas]) => {
            const catActiva = filtros.categorias.includes(categoria)
            return (
              <div key={categoria}>
                <button
                  type="button"
                  onClick={() => toggleCategoria(categoria)}
                  className={`mb-2 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm font-bold transition-colors ${
                    catActiva
                      ? "bg-emerald-600 text-white"
                      : "text-slate-900 hover:bg-slate-100 dark:text-white dark:hover:bg-slate-800"
                  }`}
                >
                  <span>{categoria}</span>
                  <span className={`text-xs font-medium ${catActiva ? "text-emerald-100" : "text-slate-400"}`}>
                    {Array.from(marcas.values()).reduce((a, b) => a + b, 0)}
                  </span>
                </button>
                <ul className="ml-2 space-y-1 border-l border-slate-200 pl-3 dark:border-slate-800">
                  {Array.from(marcas.entries()).map(([marca, cantidad]) => (
                    <li key={marca}>
                      <label className="flex cursor-pointer items-center gap-2.5 py-1 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
                        <input
                          type="checkbox"
                          checked={filtros.marcas.includes(marca)}
                          onChange={() => toggleMarca(marca)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 accent-emerald-600"
                        />
                        <span className="flex-1">{marca}</span>
                        <span className="text-xs text-slate-400">{cantidad}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        {/* Precio: orden y rango */}
        <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
          <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-slate-400">Precio</h4>

          <div className="mb-3 flex flex-col gap-1.5">
            {([
              ["relevancia", "Relevancia"],
              ["precioAsc", "Menor a mayor"],
              ["precioDesc", "Mayor a menor"],
            ] as const).map(([valor, etiqueta]) => (
              <label key={valor} className="flex cursor-pointer items-center gap-2.5 py-0.5 text-sm text-slate-600 dark:text-slate-400">
                <input
                  type="radio"
                  name="orden-precio"
                  checked={filtros.orden === valor}
                  onChange={() => onChange({ ...filtros, orden: valor })}
                  className="h-4 w-4 border-slate-300 text-emerald-600 accent-emerald-600"
                />
                {etiqueta}
              </label>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={filtros.precioDesde}
              onChange={(e) => onChange({ ...filtros, precioDesde: e.target.value })}
              placeholder="Desde"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900
                         placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2
                         focus:ring-emerald-400/20 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
            />
            <span className="text-slate-300 dark:text-slate-600">—</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={filtros.precioHasta}
              onChange={(e) => onChange({ ...filtros, precioHasta: e.target.value })}
              placeholder="Hasta"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900
                         placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2
                         focus:ring-emerald-400/20 dark:border-slate-800 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </div>
      </div>
    </aside>
  )
}
