"use client"

import { useState, type ReactNode } from "react"
import { BookOpen, ChevronDown, ExternalLink, Lightbulb, TriangleAlert } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

export interface PasoTutorial {
  /** Dónde se hace el paso: "VetPanel", "ARCA", "Mercado Pago", "Google"… Se muestra como etiqueta. */
  donde?: string
  titulo: string
  detalle: ReactNode
  /** Link directo al lugar donde se hace el paso. */
  enlace?: { href: string; texto: string }
  /** Consejo (ámbar) o advertencia (rojo) debajo del paso. */
  nota?: { tipo: "consejo" | "atencion"; texto: ReactNode }
}

interface Props {
  titulo: string
  /** Una o dos oraciones: qué se va a conseguir y cuánto lleva. */
  intro?: ReactNode
  pasos: PasoTutorial[]
  /** Qué hace falta tener antes de empezar. */
  requisitos?: ReactNode[]
  /** Abierto al cargar (para integraciones todavía no configuradas). */
  abierto?: boolean
  className?: string
}

/**
 * Guía paso a paso que acompaña a cada integración de Configuración: qué hacer
 * en VetPanel y qué hacer afuera (ARCA, Mercado Pago, Google) para conseguir
 * el certificado, el token o la clave que pide el formulario de al lado.
 *
 * Es texto plano con links: no reemplaza a la documentación oficial, la
 * ordena en el orden en que hay que hacer las cosas.
 */
export function TutorialPasos({ titulo, intro, pasos, requisitos, abierto = false, className }: Props) {
  const [open, setOpen] = useState(abierto)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("rounded-2xl border border-coral/20 bg-coral-soft/40", className)}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5"
          aria-expanded={open}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-coral text-white">
            <BookOpen className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">{titulo}</span>
            <span className="block text-xs text-ink-muted">
              {pasos.length} pasos · {open ? "tocá para cerrar" : "tocá para ver la guía"}
            </span>
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-ink-muted transition-transform duration-200", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="space-y-5 border-t border-coral/15 px-4 py-5 sm:px-5">
          {intro && <p className="text-sm leading-relaxed text-ink">{intro}</p>}

          {requisitos && requisitos.length > 0 && (
            <div className="rounded-xl border border-warm-border bg-white p-3 sm:p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">Antes de empezar, necesitás</p>
              <ul className="space-y-1.5 text-sm text-ink">
                {requisitos.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-coral" aria-hidden />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ol className="relative space-y-5 border-l-2 border-coral/20 pl-6">
            {pasos.map((paso, i) => (
              <li key={i} className="relative">
                <span
                  className="absolute -left-[31px] top-0 flex h-7 w-7 items-center justify-center rounded-full bg-coral text-xs font-bold text-white ring-4 ring-cream"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {paso.donde && (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-coral ring-1 ring-coral/20">
                      {paso.donde}
                    </span>
                  )}
                  <p className="text-sm font-semibold text-ink">{paso.titulo}</p>
                </div>
                <div className="mt-1.5 text-sm leading-relaxed text-ink-muted [&_code]:rounded [&_code]:bg-white [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:text-ink [&_strong]:text-ink">
                  {paso.detalle}
                </div>
                {paso.enlace && (
                  <a
                    href={paso.enlace.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-coral ring-1 ring-coral/25 transition-colors hover:bg-coral hover:text-white"
                  >
                    {paso.enlace.texto}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
                {paso.nota && (
                  <p
                    className={cn(
                      "mt-2 flex gap-2 rounded-lg px-3 py-2 text-xs leading-relaxed",
                      paso.nota.tipo === "consejo"
                        ? "bg-amber/15 text-ink"
                        : "bg-red-50 text-red-800",
                    )}
                  >
                    {paso.nota.tipo === "consejo"
                      ? <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      : <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
                    <span>{paso.nota.texto}</span>
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
