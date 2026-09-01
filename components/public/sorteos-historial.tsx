"use client"

import { useRef } from "react"
import { Trophy, Gift, ChevronLeft, ChevronRight } from "lucide-react"
import type { Sorteo } from "@/lib/supabase/types"

interface Props {
  sorteos: Sorteo[]
}

function TarjetaSorteo({ sorteo }: { sorteo: Sorteo }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        {sorteo.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sorteo.fotoUrl} alt={sorteo.nombre} className="h-12 w-12 shrink-0 rounded-xl object-cover" />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
            <Gift className="h-5 w-5 text-emerald-500" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{sorteo.nombre}</h3>
          <p className="text-xs text-slate-400">{sorteo.desde} al {sorteo.hasta}</p>
        </div>
      </div>

      <div className="space-y-2.5 border-t border-slate-100 pt-3 dark:border-slate-800">
        {sorteo.premios.map((premio) => {
          const ganador = sorteo.ganadores.find((g) => g.premioId === premio.id)
          return (
            <div key={premio.id} className="flex items-start gap-2.5 text-xs">
              {premio.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={premio.fotoUrl} alt={premio.nombre} className="h-8 w-8 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10">
                  <Gift className="h-3.5 w-3.5 text-emerald-500" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-slate-600 dark:text-slate-300">{premio.nombre}</p>
                {ganador ? (
                  <span className="mt-0.5 inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                    <Trophy className="h-3 w-3" />
                    {ganador.clienteNombre}
                  </span>
                ) : (
                  <span className="mt-0.5 block text-slate-400">Sin ganador</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Historial de sorteos ya finalizados, con sus premios y ganadores. */
export function SorteosHistorial({ sorteos }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  if (sorteos.length === 0) return null

  const desplazar = (direccion: 1 | -1) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: direccion * el.clientWidth * 0.9, behavior: "smooth" })
  }

  return (
    <section className="py-14 bg-white dark:bg-slate-950 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(16,185,129,0.06),transparent)] pointer-events-none" />
      <div className="container max-w-5xl mx-auto px-6 relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 mb-3">
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.15em]">
              Sorteos
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-2">
            Sorteos anteriores
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Así se fueron sorteando los premios en nuestras ediciones pasadas.
          </p>
        </div>

        {sorteos.length === 1 ? (
          <div className="mx-auto max-w-xs">
            <TarjetaSorteo sorteo={sorteos[0]} />
          </div>
        ) : sorteos.length === 2 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {sorteos.map((s) => <TarjetaSorteo key={s.id} sorteo={s} />)}
          </div>
        ) : (
          <div className="relative">
            <button
              type="button"
              aria-label="Anterior"
              onClick={() => desplazar(-1)}
              className="absolute left-0 top-1/2 z-10 flex h-9 w-9 -translate-x-3 -translate-y-1/2 items-center justify-center
                         rounded-full bg-white shadow-lg ring-1 ring-slate-900/5 transition-transform duration-300
                         hover:scale-110 dark:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4 text-slate-700 dark:text-slate-200" />
            </button>

            <div
              ref={scrollRef}
              className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2
                         [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {sorteos.map((s) => (
                <div key={s.id} className="w-[calc(85%-8px)] shrink-0 snap-start sm:w-[calc(50%-8px)]">
                  <TarjetaSorteo sorteo={s} />
                </div>
              ))}
            </div>

            <button
              type="button"
              aria-label="Siguiente"
              onClick={() => desplazar(1)}
              className="absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 translate-x-3 items-center justify-center
                         rounded-full bg-white shadow-lg ring-1 ring-slate-900/5 transition-transform duration-300
                         hover:scale-110 dark:bg-slate-800"
            >
              <ChevronRight className="h-4 w-4 text-slate-700 dark:text-slate-200" />
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
