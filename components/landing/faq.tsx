"use client"

import { useState } from "react"
import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import { track } from "@vercel/analytics"
import { Plus } from "lucide-react"
import { Reveal } from "@/components/landing/motion"
import { FAQS } from "@/lib/landing/faqs"

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
