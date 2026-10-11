import type { Metadata } from "next"
import Link from "next/link"
import { Check, Minus, ArrowRight } from "lucide-react"
import { PricingCards } from "@/components/pricing/pricing-cards"
import { PLAN_LIST, TRIAL_DIAS, formatPrecioPlan, type Feature } from "@/lib/plans"
import { datosEstructuradosPricing, serializarJsonLd } from "@/lib/seo/datos-estructurados"
import { APP_URL, SITIO } from "@/lib/seo/sitio"

const TITULO = "Precios y planes — VetPanel"
const DESCRIPCION = `Software de gestión para veterinarias desde ${formatPrecioPlan("basico")}/mes. Plan Pro (${formatPrecioPlan("pro")}/mes) con turnos ilimitados, WhatsApp, mostrador, factura electrónica y Mercado Pago Point. ${TRIAL_DIAS} días de prueba gratis, sin tarjeta.`

export const metadata: Metadata = {
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

/** Filas de la tabla comparativa: etiqueta legible por feature. */
const FEATURE_LABELS: { key: Feature; label: string }[] = [
  { key: "analytics", label: "Dashboard de métricas" },
  { key: "multiUsuario", label: "Varios usuarios por clínica" },
  { key: "whatsapp", label: "Notificaciones por WhatsApp" },
  { key: "pdfLibreta", label: "Libreta sanitaria en PDF" },
  { key: "qrMascota", label: "QR público por mascota" },
  { key: "recordatoriosVacunas", label: "Recordatorios de vacunas" },
  { key: "multipleProfesionales", label: "Múltiples profesionales" },
  { key: "productos", label: "Productos y control de stock" },
  { key: "ventas", label: "Mostrador, caja y remitos" },
  { key: "promosSorteos", label: "Ofertas, promos y sorteos" },
  { key: "facturacionElectronica", label: "Factura electrónica (ARCA)" },
  { key: "mercadoPagoPoint", label: "Cobro con Mercado Pago Point" },
]

const FAQS: { q: string; a: string }[] = [
  {
    q: "¿Cómo funciona la prueba gratis?",
    a: `Al registrarte tenés ${TRIAL_DIAS} días de plan Pro completo, sin tarjeta y con datos de ejemplo para probar. Cuando termina, elegís con qué plan seguir: Básico o Pro. No se cobra nada sin que lo confirmes.`,
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
    q: "¿Qué pasa si supero el límite de turnos del plan Básico?",
    a: "Cuando alcanzás los 10 turnos del mes no se pueden agendar más hasta el mes siguiente o hasta que pases a Pro. Los turnos ya agendados no se ven afectados.",
  },
  {
    q: "¿Los precios incluyen impuestos?",
    a: "Los precios están expresados en pesos argentinos. La facturación final puede incluir impuestos según tu condición fiscal.",
  },
]

function formatLimite(valor: number | null, sufijo: string): string {
  return valor === null ? "Ilimitado" : `${valor} ${sufijo}`
}

export default function PricingPage() {
  return (
    <main className="bg-slate-950 min-h-screen">
      <script
        type="application/ld+json"
        // Generado en el servidor desde datos propios, escapado en serializarJsonLd.
        dangerouslySetInnerHTML={{ __html: serializarJsonLd(datosEstructuradosPricing(FAQS)) }}
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
          <PricingCards />
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
                  {PLAN_LIST.map((plan) => (
                    <th key={plan.id} className="py-4 px-3 text-center text-white font-bold">
                      {plan.nombre}
                      <span className="block text-xs font-medium text-slate-400">{formatPrecioPlan(plan.id)}/mes</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-800/60">
                  <td className="py-3 px-3 text-slate-300">Turnos por mes</td>
                  {PLAN_LIST.map((plan) => (
                    <td key={plan.id} className="py-3 px-3 text-center text-slate-200">
                      {formatLimite(plan.limits.maxTurnosMes, "")}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-800/60">
                  <td className="py-3 px-3 text-slate-300">Usuarios</td>
                  {PLAN_LIST.map((plan) => (
                    <td key={plan.id} className="py-3 px-3 text-center text-slate-200">
                      {formatLimite(plan.limits.maxUsuarios, "")}
                    </td>
                  ))}
                </tr>
                {FEATURE_LABELS.map(({ key, label }) => (
                  <tr key={key} className="border-b border-slate-800/60">
                    <td className="py-3 px-3 text-slate-300">{label}</td>
                    {PLAN_LIST.map((plan) => (
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
