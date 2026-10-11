"use client"

import Link from "next/link"
import { track } from "@vercel/analytics"
import { Check, Star } from "lucide-react"
import { PLAN_LIST, TRIAL_DIAS, formatPrecioPlan } from "@/lib/plans"
import { Reveal } from "@/components/landing/motion"

const DESCRIPCIONES: Record<string, string> = {
  basico: "Para empezar sin compromiso",
  pro: "Para clínicas en funcionamiento",
}

/**
 * Sección de precios de la landing. Lee el catálogo único (`lib/plans`): los
 * precios que ve el visitante son los mismos que cobra el checkout.
 *
 * Solo precio mensual: el checkout crea suscripciones mensuales. Un plan
 * anual con descuento está en el backlog (`planautomatizacion.md`); hasta que
 * exista no se promete.
 */
export function PricingSection() {
  return (
    <section id="precios" className="bg-cream py-24">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-10">
          <p className="text-sm font-semibold uppercase tracking-widest text-coral mb-3">Precios</p>
          <h2 className="font-display text-4xl sm:text-5xl font-semibold text-ink">Simple y transparente</h2>
          <p className="mt-4 text-ink-muted">
            {TRIAL_DIAS} días de prueba gratis con Pro, sin tarjeta. Después, el plan que le quede a tu clínica.
          </p>
        </Reveal>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto items-stretch">
          {PLAN_LIST.map((plan, i) => {
            const highlight = plan.id === "pro"
            const cta = plan.id === "pro" ? `Probar Pro ${TRIAL_DIAS} días gratis` : `Contratar ${plan.nombre}`

            return (
              <Reveal key={plan.id} delay={i * 0.08}>
                <div
                  className={`relative flex h-full flex-col rounded-3xl p-8 transition-transform ${
                    highlight
                      ? "border-2 border-coral/40 bg-white shadow-[0_24px_50px_-24px_rgba(255,107,92,0.45)] md:-translate-y-2"
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
                    <h3 className="font-display text-xl font-semibold mb-1 text-ink">{plan.nombre}</h3>
                    <p className="text-sm text-ink-muted mb-4">{DESCRIPCIONES[plan.id]}</p>
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-display text-4xl font-semibold text-ink">{formatPrecioPlan(plan.id)}</span>
                      <span className="text-sm text-ink-muted">/mes</span>
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

                  <Link href={`/registro?plan=${plan.id}`} onClick={() => track("plan_select", { plan: plan.id })}>
                    <button
                      className={`w-full rounded-xl py-3 text-sm font-semibold transition-all ${
                        highlight
                          ? "bg-coral hover:bg-coral-ink text-white shadow-lg shadow-coral/25 hover:scale-[1.02]"
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
