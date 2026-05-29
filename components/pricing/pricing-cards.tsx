import Link from "next/link"
import { Check, Star } from "lucide-react"
import { PLAN_LIST, type PlanDefinition } from "@/lib/plans"

/** Formatea un precio mensual del catálogo a texto para mostrar. */
function formatPrecio(plan: PlanDefinition): { price: string; period: string } {
  if (plan.precioMensual <= 0) return { price: "Gratis", period: "" }
  return {
    price: `$${plan.precioMensual.toLocaleString("es-AR")}`,
    period: "/mes",
  }
}

const DESCRIPCIONES: Record<string, string> = {
  basico: "Para probar sin compromiso",
  plus: "Para clínicas en funcionamiento",
  pro: "Para clínicas que necesitan más",
}

interface PricingCardsProps {
  /** Href base del CTA (por defecto /registro). */
  ctaHref?: string
}

/**
 * Tarjetas de planes basadas en el catálogo único (`lib/plans`).
 * Se usa tanto en la landing como en la página /pricing.
 */
export function PricingCards({ ctaHref = "/registro" }: PricingCardsProps) {
  return (
    <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
      {PLAN_LIST.map((plan) => {
        const highlight = plan.id === "plus"
        const muted = plan.id === "pro"
        const { price, period } = formatPrecio(plan)
        const cta =
          plan.id === "basico" ? "Empezar gratis" : plan.id === "plus" ? "Contratar Plus" : "Contratar Pro"

        return (
          <div
            key={plan.id}
            className={`relative rounded-2xl p-8 flex flex-col ${
              highlight
                ? "border-2 border-emerald-500/50 bg-gradient-to-b from-emerald-500/10 to-slate-900 shadow-2xl shadow-emerald-500/10"
                : muted
                ? "border border-slate-700/50 bg-slate-800/30"
                : "border border-slate-700 bg-slate-800/50"
            }`}
          >
            {highlight && (
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1 text-xs font-bold text-white shadow-lg">
                  <Star className="h-3 w-3 fill-white" /> Más popular
                </span>
              </div>
            )}

            <div className="mb-6">
              <h3 className={`text-lg font-bold mb-1 ${muted ? "text-slate-400" : "text-white"}`}>{plan.nombre}</h3>
              <p className="text-slate-500 text-sm mb-4">{DESCRIPCIONES[plan.id]}</p>
              <div className="flex items-baseline gap-1">
                <span className={`text-4xl font-extrabold ${muted ? "text-slate-400" : "text-white"}`}>{price}</span>
                {period && <span className="text-slate-400 text-sm">{period}</span>}
              </div>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {plan.highlights.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-slate-300">
                  <Check
                    className={`h-4 w-4 shrink-0 ${highlight ? "text-emerald-400" : muted ? "text-slate-600" : "text-slate-500"}`}
                  />
                  {f}
                </li>
              ))}
            </ul>

            <Link href={`${ctaHref}?plan=${plan.id}`}>
              <button
                className={`w-full rounded-xl py-3 text-sm font-semibold transition-all ${
                  highlight
                    ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/20 hover:scale-[1.02]"
                    : muted
                    ? "border border-slate-700 bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-300"
                    : "border border-slate-600 bg-slate-700/50 text-slate-200 hover:bg-slate-700"
                }`}
              >
                {cta}
              </button>
            </Link>
          </div>
        )
      })}
    </div>
  )
}
