import type { Metadata } from "next"
import Link from "next/link"
import { Check, Minus, ArrowRight } from "lucide-react"
import { PricingCards } from "@/components/pricing/pricing-cards"
import { FEATURES, PLAN_RECOMENDADO, TRIAL_DIAS, formatPesos, type PlanDefinition } from "@/lib/plans"
import { cargarPlanesServidor } from "@/lib/planes-servidor"
import { datosEstructuradosPricing, serializarJsonLd } from "@/lib/seo/datos-estructurados"
import { APP_URL, SITIO } from "@/lib/seo/sitio"

const TITULO = "Precios y planes — VetPanel"

// Los precios salen de la tabla `planes` (editable desde el superadmin): la
// página se regenera cada 5 minutos.
export const revalidate = 300

function descripcion(planes: PlanDefinition[]): string {
  if (planes.length === 0) return `Software de gestión para veterinarias. ${TRIAL_DIAS} días de prueba gratis, sin tarjeta.`
  const desde = Math.min(...planes.map((p) => p.precioMensual))
  const pro = planes.find((p) => p.id === PLAN_RECOMENDADO)
  const textoPro = pro ? ` Plan ${pro.nombre} (${formatPesos(pro.precioMensual)}/mes) con turnos ilimitados, recordatorios de vacunas, mostrador, factura electrónica y Mercado Pago Point.` : ""
  return `Software de gestión para veterinarias desde ${formatPesos(desde)}/mes.${textoPro} ${TRIAL_DIAS} días de prueba gratis, sin tarjeta.`
}

async function planesVisibles(): Promise<PlanDefinition[]> {
  return (await cargarPlanesServidor()).filter((p) => p.visible)
}

export async function generateMetadata(): Promise<Metadata> {
  const DESCRIPCION = descripcion(await planesVisibles())
  return {
    title: TITULO,
    description: DESCRIPCION,
    alternates: { canonical: "/pricing" },
    openGraph: {
      type: "website",
      locale: "es_AR",
      url: `${APP_URL}/pricing`,
      siteName: SITIO.nombre,
      title: TITULO,
      description: DESCRIPCION,
      images: [{ url: SITIO.imagen, width: 1200, height: 630, alt: "VetPanel — precios y planes" }],
    },
    twitter: {
      card: "summary_large_image",
      title: TITULO,
      description: DESCRIPCION,
      images: [SITIO.imagen],
    },
  }
}

const FAQS: { q: string; a: string }[] = [
  {
    q: "¿Cómo funciona la prueba gratis?",
    a: `Al registrarte tenés ${TRIAL_DIAS} días de plan Pro completo, sin tarjeta. Cuando termina, elegís con qué plan seguir: Básico o Pro. No se cobra nada sin que lo confirmes.`,
  },
  {
    q: "¿Cómo se paga?",
    a: "Por suscripción mensual con Mercado Pago, desde tu panel. Podés pagar con tarjeta de crédito, débito o saldo en cuenta. Cancelás cuando quieras desde Configuración → Plan y no se hacen más cobros.",
  },
  {
    q: "¿Puedo cambiar de plan en cualquier momento?",
    a: "Sí. Subís de Básico a Pro, o bajás de Pro a Básico, desde tu panel. Cuando Mercado Pago confirma el pago del plan nuevo, la suscripción anterior se cancela sola y las funciones cambian de inmediato.",
  },
  {
    q: "¿Cuál es la diferencia entre Básico y Pro?",
    a: "Básico es la clínica completa: turnos ilimitados, clientes, libreta sanitaria, historia clínica y tu página pública, para hasta 2 usuarios. Pro suma el comercio (productos, stock, mostrador, caja, factura electrónica y Mercado Pago Point), recordatorios de vacunas automáticos por email, métricas y usuarios ilimitados.",
  },
  {
    q: "¿Los precios incluyen impuestos?",
    a: "Los precios están expresados en pesos argentinos. La facturación final puede incluir impuestos según tu condición fiscal.",
  },
]

function formatLimite(valor: number | null, sufijo: string): string {
  return valor === null ? "Ilimitado" : `${valor} ${sufijo}`
}

export default async function PricingPage() {
  const planes = await planesVisibles()

  return (
    <main className="bg-slate-950 min-h-screen">
      <script
        type="application/ld+json"
        // Generado en el servidor desde datos propios, escapado en serializarJsonLd.
        dangerouslySetInnerHTML={{ __html: serializarJsonLd(datosEstructuradosPricing(FAQS, planes)) }}
      />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-800 py-20 sm:py-28">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-emerald-500/10 blur-[120px]" />
        </div>
        <div className="relative z-10 container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400 mb-3">Precios</p>
          <h1 className="text-4xl sm:text-6xl font-extrabold text-white leading-tight">
            Planes simples y{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              transparentes
            </span>
          </h1>
          <p className="mt-5 text-lg text-slate-400 max-w-2xl mx-auto">
            Probá Pro {TRIAL_DIAS} días gratis, sin tarjeta. Después elegís el plan que le queda a tu clínica.
            Sin costos ocultos, cancelás cuando quieras.
          </p>
        </div>
      </section>

      {/* Tarjetas */}
      <section className="py-16 sm:py-20">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <PricingCards planes={planes} />
        </div>
      </section>

      {/* Tabla comparativa */}
      <section className="py-12 sm:py-16 border-t border-slate-800">
        <div className="container max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white text-center mb-10">
            Comparación de planes
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left py-4 px-3 text-slate-400 font-medium">Funcionalidad</th>
                  {planes.map((plan) => (
                    <th key={plan.id} className="py-4 px-3 text-center text-white font-bold">
                      {plan.nombre}
                      <span className="block text-xs font-medium text-slate-400">{formatPesos(plan.precioMensual)}/mes</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-800/60">
                  <td className="py-3 px-3 text-slate-300">Turnos por mes</td>
                  {planes.map((plan) => (
                    <td key={plan.id} className="py-3 px-3 text-center text-slate-200">
                      {formatLimite(plan.limits.maxTurnosMes, "")}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-800/60">
                  <td className="py-3 px-3 text-slate-300">Usuarios</td>
                  {planes.map((plan) => (
                    <td key={plan.id} className="py-3 px-3 text-center text-slate-200">
                      {formatLimite(plan.limits.maxUsuarios, "")}
                    </td>
                  ))}
                </tr>
                {FEATURES.map(({ key, label }) => (
                  <tr key={key} className="border-b border-slate-800/60">
                    <td className="py-3 px-3 text-slate-300">{label}</td>
                    {planes.map((plan) => (
                      <td key={plan.id} className="py-3 px-3 text-center">
                        {plan.features[key] ? (
                          <Check className="h-4 w-4 text-emerald-400 inline" aria-label="Incluido" />
                        ) : (
                          <Minus className="h-4 w-4 text-slate-600 inline" aria-label="No incluido" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-12 sm:py-16 border-t border-slate-800">
        <div className="container max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white text-center mb-10">
            Preguntas frecuentes
          </h2>
          <div className="space-y-4">
            {FAQS.map(({ q, a }) => (
              <div key={q} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
                <h3 className="text-base font-semibold text-white mb-2">{q}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="py-20 border-t border-slate-800 bg-gradient-to-br from-emerald-900/30 via-slate-950 to-teal-900/30">
        <div className="container max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-5">
            Probá VetPanel {TRIAL_DIAS} días gratis
          </h2>
          <p className="text-slate-400 mb-8">Sin tarjeta. Tu clínica online en minutos, con el plan Pro completo.</p>
          <Link href="/registro">
            <button className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 px-10 py-4 text-base font-bold text-white shadow-2xl shadow-emerald-500/30 transition-all hover:scale-105">
              Empezar la prueba
              <ArrowRight className="h-5 w-5" />
            </button>
          </Link>
        </div>
      </section>
    </main>
  )
}
