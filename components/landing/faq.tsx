"use client"

import { useState } from "react"
import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import { track } from "@vercel/analytics"
import { Plus } from "lucide-react"
import { Reveal } from "@/components/landing/motion"

const FAQS = [
  {
    q: "¿Puedo empezar gratis?",
    a: "Sí. El plan Básico es gratuito e incluye hasta 10 turnos por mes, tu página pública y la gestión de turnos y clientes. No pedimos tarjeta para empezar.",
  },
  {
    q: "¿Necesito instalar algo o saber de tecnología?",
    a: "No. VetPanel funciona desde el navegador, en cualquier celular o computadora. Te registrás con Google y en minutos ya tenés tu clínica online con un asistente que te guía.",
  },
  {
    q: "¿Mis clientes cómo reservan?",
    a: "Compartís tu link propio (por WhatsApp, Instagram o donde quieras). Tus clientes entran, eligen mascota, servicio y horario disponible, y listo. Vos lo ves al instante en tu panel.",
  },
  {
    q: "¿Puedo cambiar de plan cuando quiera?",
    a: "Sí. Subís o bajás de plan en cualquier momento. El cambio se refleja de inmediato en los límites y funciones disponibles.",
  },
  {
    q: "¿Mis datos y los de mis pacientes están seguros?",
    a: "Sí. La información viaja cifrada y se guarda en infraestructura de nivel empresarial, con accesos por roles para tu equipo. Cada clínica ve únicamente sus propios datos.",
  },
]

function FaqItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) track("faq_open", { question: q })
  }

  return (
    <div className="rounded-2xl border border-warm-border bg-white overflow-hidden">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <span className="font-display text-base sm:text-lg font-semibold text-ink">{q}</span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            open ? "bg-coral text-white" : "bg-coral-soft text-coral"
          }`}
        >
          <Plus className="h-4 w-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="px-6 pb-5 text-sm text-ink-muted leading-relaxed">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Faq() {
  return (
    <section className="bg-white py-24 border-t border-warm-border">
      <div className="container max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-12">
          <p className="text-sm font-semibold uppercase tracking-widest text-coral mb-3">Preguntas frecuentes</p>
          <h2 className="font-display text-4xl font-semibold text-ink">¿Te quedan dudas?</h2>
        </Reveal>
        <div className="space-y-3">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={i * 0.05}>
              <FaqItem q={f.q} a={f.a} index={i} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
