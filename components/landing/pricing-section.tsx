"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { track } from "@vercel/analytics"
import { Check, Star } from "lucide-react"
import { PLAN_LIST, type PlanDefinition } from "@/lib/plans"
import { Reveal } from "@/components/landing/motion"

type Period = "mensual" | "anual"

const DESCRIPCIONES: Record<string, string> = {
  basico: "Para empezar sin compromiso",
  plus: "Para clínicas en funcionamiento",
  pro: "Para clínicas que vuelan",
}

/** Precio a mostrar según periodo. Anual = 10 meses (2 gratis). */
function priceFor(plan: PlanDefinition, period: Period): { big: string; sub: string } {
  if (plan.precioMensual <= 0) return { big: "Gratis", sub: "para siempre" }
  if (period === "mensual") {
    return { big: `$${plan.precioMensual.toLocaleString("es-AR")}`, sub: "/mes" }
  }
  const mesEquivalente = Math.round((plan.precioMensual * 10) / 12)
  const totalAnual = plan.precioMensual * 10
  return {
    big: `$${mesEquivalente.toLocaleString("es-AR")}`,
    sub: `/mes · $${totalAnual.toLocaleString("es-AR")} al año`,
  }
}

function PeriodToggle({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-warm-border bg-white p-1">
      {(["mensual", "anual"] as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className="relative rounded-full px-5 py-2 text-sm font-semibold capitalize transition-colors"
        >
          {period === p && (
            <motion.span
              layoutId="period-pill"
              className="absolute inset-0 rounded-full bg-coral"
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
            />
          )}
          <span className={`relative z-10 ${period === p ? "text-white" : "text-ink-muted"}`}>{p}</span>
          {p === "anual" && (
            <span className="relative z-10 ml-1.5 rounded-full bg-teal-soft px-1.5 py-0.5 text-[10px] font-bold text-teal">
              2 meses gratis
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

export function PricingSection() {
  const [period, setPeriod] = useState<Period>("mensual")

  return (
    <section id="precios" className="bg-cream py-24">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-10">
          <p className="text-sm font-semibold uppercase tracking-widest text-coral mb-3">Precios</p>
          <h2 className="font-display text-4xl sm:text-5xl font-semibold text-ink">Simple y transparente</h2>
          <p className="mt-4 text-ink-muted">Empezá gratis. Subís de plan cuando tu clínica crezca.</p>
          <div className="mt-7 flex justify-center">
            <PeriodToggle period={period} onChange={setPeriod} />
          </div>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-stretch">
          {PLAN_LIST.map((plan, i) => {
            const highlight = plan.id === "plus"
            const muted = plan.id === "pro"
            const { big, sub } = priceFor(plan, period)
            const cta =
              plan.id === "basico" ? "Empezar gratis" : `Contratar ${plan.nombre}`

            return (
              <Reveal key={plan.id} delay={i * 0.08}>
                <div
                  className={`relative flex h-full flex-col rounded-3xl p-8 transition-transform ${
                    highlight
                      ? "border-2 border-coral/40 bg-white shadow-[0_24px_50px_-24px_rgba(255,107,92,0.45)] md:-translate-y-2"
                      : muted
                      ? "border border-warm-border bg-white/60"
                      : "border border-warm-border bg-white"
                  }`}
                >
                  {highlight && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-coral px-3 py-1 text-xs font-bold text-white shadow-lg">
                        <Star className="h-3 w-3 fill-current" /> Más popular
                      </span>
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className={`font-display text-xl font-semibold mb-1 ${muted ? "text-ink-muted" : "text-ink"}`}>
                      {plan.nombre}
                    </h3>
                    <p className="text-sm text-ink-muted mb-4">{DESCRIPCIONES[plan.id]}</p>
                    <div className="flex items-baseline gap-1.5">
                      <span className={`font-display text-4xl font-semibold ${muted ? "text-ink-muted" : "text-ink"}`}>
                        {big}
                      </span>
                      <span className="text-sm text-ink-muted">{sub}</span>
                    </div>
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.highlights.map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-sm text-ink">
                        <Check className={`h-4 w-4 shrink-0 ${highlight ? "text-coral" : "text-teal"}`} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={`/registro?plan=${plan.id}`}
                    onClick={() => track("plan_select", { plan: plan.id, period })}
                  >
                    <button
                      className={`w-full rounded-xl py-3 text-sm font-semibold transition-all ${
                        highlight
                          ? "bg-coral hover:bg-coral-ink text-white shadow-lg shadow-coral/25 hover:scale-[1.02]"
                          : muted
                          ? "border border-warm-border bg-cream text-ink-muted hover:text-ink hover:border-coral/30"
                          : "border border-warm-border bg-cream text-ink hover:border-coral/40"
                      }`}
                    >
                      {cta}
                    </button>
                  </Link>
                </div>
              </Reveal>
            )
          })}
        </div>

        <p className="mt-8 text-center text-xs text-ink-muted">
          Sin costos ocultos · Cancelás cuando quieras · Precios en pesos argentinos
        </p>
      </div>
    </section>
  )
}
