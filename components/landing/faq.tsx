"use client"

import { useState } from "react"
import { track } from "@vercel/analytics"
import { Plus } from "lucide-react"
import { Reveal } from "@/components/landing/reveal"
import { FAQS } from "@/lib/landing/faqs"

// Acordeón con CSS puro (grid-template-rows 0fr → 1fr) en vez de Motion:
// misma animación de altura, sin librería en el JS inicial de la landing.
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)

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
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-[transform,background-color,color] duration-200 ${
            open ? "rotate-45 bg-coral text-white" : "bg-coral-soft text-coral"
          }`}
        >
          <Plus className="h-4 w-4" />
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(.16,1,.3,1)]"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
        aria-hidden={!open}
      >
        <div className="overflow-hidden">
          <p className="px-6 pb-5 text-sm text-ink-muted leading-relaxed">{a}</p>
        </div>
      </div>
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
              <FaqItem q={f.q} a={f.a} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
