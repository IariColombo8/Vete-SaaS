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

type PricingVariant = "dark" | "light"

interface PricingCardsProps {
  /** Href base del CTA (por defecto /registro). */
  ctaHref?: string
  /** Tema visual: `dark` (página /pricing) o `light` (landing cálido). */
  variant?: PricingVariant
}

/** Clases por variante, evita ternarios anidados en el JSX. */
function styles(variant: PricingVariant) {
  if (variant === "light") {
    return {
      highlightCard: "border-2 border-coral/40 bg-white shadow-[0_24px_50px_-24px_rgba(255,107,92,0.45)]",
      mutedCard: "border border-warm-border bg-white/60",
      baseCard: "border border-warm-border bg-white",
      badge: "bg-coral text-white",
      title: "text-ink",
      titleMuted: "text-ink-muted",
      desc: "text-ink-muted",
      price: "text-ink",
      priceMuted: "text-ink-muted",
      period: "text-ink-muted",
      feat: "text-ink",
      checkHi: "text-coral",
      checkBase: "text-teal",
      checkMuted: "text-ink-muted/50",
      ctaHi: "bg-coral hover:bg-coral-ink text-white shadow-lg shadow-coral/25 hover:scale-[1.02]",
      ctaMuted: "border border-warm-border bg-cream text-ink-muted hover:text-ink hover:border-coral/30",
      ctaBase: "border border-warm-border bg-cream text-ink hover:border-coral/40",
    }
  }
  return {
    highlightCard: "border-2 border-emerald-500/50 bg-gradient-to-b from-emerald-500/10 to-slate-900 shadow-2xl shadow-emerald-500/10",
    mutedCard: "border border-slate-700/50 bg-slate-800/30",
    baseCard: "border border-slate-700 bg-slate-800/50",
    badge: "bg-gradient-to-r from-emerald-500 to-teal-500 text-white",
    title: "text-white",
    titleMuted: "text-slate-400",
    desc: "text-slate-500",
    price: "text-white",
    priceMuted: "text-slate-400",
    period: "text-slate-400",
    feat: "text-slate-300",
    checkHi: "text-emerald-400",
    checkBase: "text-slate-500",
    checkMuted: "text-slate-600",
    ctaHi: "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/20 hover:scale-[1.02]",
    ctaMuted: "border border-slate-700 bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-300",
    ctaBase: "border border-slate-600 bg-slate-700/50 text-slate-200 hover:bg-slate-700",
  }
}

/**
 * Tarjetas de planes basadas en el catálogo único (`lib/plans`).
 * Se usa tanto en la landing (variant="light") como en /pricing (dark).
 */
export function PricingCards({ ctaHref = "/registro", variant = "dark" }: PricingCardsProps) {
  const s = styles(variant)

  return (
    <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
      {PLAN_LIST.map((plan) => {
        const highlight = plan.id === "plus"
        const muted = plan.id === "pro"
        const { price, period } = formatPrecio(plan)
        const cta =
          plan.id === "basico" ? "Empezar gratis" : plan.id === "plus" ? "Contratar Plus" : "Contratar Pro"

        const cardTone = highlight ? s.highlightCard : muted ? s.mutedCard : s.baseCard
        const titleTone = muted ? s.titleMuted : s.title
        const priceTone = muted ? s.priceMuted : s.price
        const checkTone = highlight ? s.checkHi : muted ? s.checkMuted : s.checkBase
        const ctaTone = highlight ? s.ctaHi : muted ? s.ctaMuted : s.ctaBase

        return (
          <div
            key={plan.id}
            className={`relative rounded-2xl p-8 flex flex-col transition-transform ${highlight ? "md:-translate-y-2" : ""} ${cardTone}`}
          >
            {highlight && (
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold shadow-lg ${s.badge}`}>
                  <Star className="h-3 w-3 fill-current" /> Más popular
                </span>
              </div>
            )}

            <div className="mb-6">
              <h3 className={`font-display text-xl font-semibold mb-1 ${titleTone}`}>{plan.nombre}</h3>
              <p className={`text-sm mb-4 ${s.desc}`}>{DESCRIPCIONES[plan.id]}</p>
              <div className="flex items-baseline gap-1">
                <span className={`font-display text-4xl font-semibold ${priceTone}`}>{price}</span>
                {period && <span className={`text-sm ${s.period}`}>{period}</span>}
              </div>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {plan.highlights.map((f) => (
                <li key={f} className={`flex items-center gap-2.5 text-sm ${s.feat}`}>
                  <Check className={`h-4 w-4 shrink-0 ${checkTone}`} />
                  {f}
                </li>
              ))}
            </ul>

            <Link href={`${ctaHref}?plan=${plan.id}`}>
              <button className={`w-full rounded-xl py-3 text-sm font-semibold transition-all ${ctaTone}`}>
                {cta}
              </button>
            </Link>
          </div>
        )
      })}
    </div>
  )
}
