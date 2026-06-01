"use client"

import { useRef } from "react"
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react"
import { ShieldCheck, Zap, Globe, Star } from "lucide-react"
import { HeroCta } from "@/components/hero-cta"
import { ProductMock } from "@/components/landing/product-mock"
import { Paw, Bone, CatFace, Vaccine } from "@/components/landing/pet-art"

export function Hero() {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  })
  const yMock = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, -70])

  return (
    <section ref={ref} className="relative overflow-hidden bg-cream">
      {/* Blobs cálidos */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="warm-blob h-[460px] w-[460px] -top-32 -right-24 opacity-60"
          style={{ background: "radial-gradient(circle, rgba(255,107,92,0.30), transparent 70%)", animation: "warmFloat1 20s ease-in-out infinite alternate" }}
        />
        <div
          className="warm-blob h-[420px] w-[420px] top-40 -left-28 opacity-50"
          style={{ background: "radial-gradient(circle, rgba(20,184,166,0.28), transparent 70%)", animation: "warmFloat2 24s ease-in-out infinite alternate" }}
        />
      </div>
      <div className="paw-pattern pointer-events-none absolute inset-0 opacity-[0.04]" />

      <div className="relative z-10 container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Columna texto — HTML estático, visible al instante (above-the-fold).
              Sin parallax sobre el LCP: evita un layer que difiera su paint. */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-coral/20 bg-coral-soft px-4 py-1.5 mb-7">
              <Paw className="h-3.5 w-3.5 text-coral" />
              <span className="text-xs font-semibold text-coral tracking-wide uppercase">
                Software de gestión veterinaria
              </span>
            </div>

            <h1 className="font-display text-5xl sm:text-6xl lg:text-[4.25rem] font-semibold text-ink leading-[1.04] tracking-tight mb-6">
              Menos papeleo.{" "}
              <span className="relative whitespace-nowrap text-coral">
                Más patitas
                <svg className="absolute -bottom-2 left-0 w-full text-amber/70" viewBox="0 0 320 14" fill="none" aria-hidden>
                  <path d="M3 9C90 3 230 3 317 7" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>{" "}
              felices.
            </h1>

            <p className="text-lg sm:text-xl text-ink-muted leading-relaxed mb-9 max-w-xl">
              Turnos online, historias clínicas y recordatorios automáticos.
              Tu veterinaria con su propio link, lista en minutos — y vos
              volvés a casa a horario.
            </p>

            <HeroCta />

            {/* Trust badges */}
            <div className="mt-11 flex flex-wrap items-center gap-x-7 gap-y-3">
              <div className="flex items-center gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-amber text-amber" />
                ))}
                <span className="ml-1 text-sm font-semibold text-ink">4.9</span>
                <span className="text-sm text-ink-muted">· +50 veterinarias</span>
              </div>
              <span className="hidden sm:block h-4 w-px bg-warm-border" />
              {[
                { icon: ShieldCheck, text: "Datos protegidos" },
                { icon: Zap, text: "Sin tarjeta" },
                { icon: Globe, text: "Tu link propio" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-ink-muted text-sm font-medium">
                  <Icon className="h-4 w-4 text-teal" />
                  {text}
                </div>
              ))}
            </div>
          </div>

          {/* Columna producto */}
          <motion.div style={{ y: yMock }} className="relative hidden lg:block">
            <Paw className="paw-wiggle absolute -top-12 -right-6 h-40 w-40 text-coral/10" />
            <Bone className="absolute bottom-2 -left-10 h-16 w-16 text-amber/25 -rotate-12" />

            <motion.div
              initial={reduce ? false : { opacity: 0, y: 36, rotate: -2 }}
              animate={reduce ? undefined : { opacity: 1, y: 0, rotate: -1.5 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              className="relative mx-auto max-w-md"
            >
              <ProductMock screen="reservar" />
            </motion.div>

            {/* Chip flotante: gato/vacuna */}
            <div className="float-soft-slow absolute -top-5 -left-8 flex items-center gap-2 rounded-2xl border border-warm-border bg-white px-3.5 py-2.5 shadow-xl rotate-[4deg]">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-soft">
                <CatFace className="h-5 w-5 text-teal" />
              </div>
              <div>
                <p className="text-xs font-bold text-ink leading-none">Michi</p>
                <p className="text-[11px] text-ink-muted mt-0.5">Vacuna en 7 días</p>
              </div>
            </div>

            {/* Chip flotante: recordatorio enviado */}
            <div className="float-soft absolute -bottom-6 right-0 flex items-center gap-2 rounded-2xl border border-warm-border bg-white px-3.5 py-2.5 shadow-xl rotate-[-3deg]">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-coral-soft">
                <Vaccine className="h-5 w-5 text-coral" />
              </div>
              <div>
                <p className="text-xs font-bold text-ink leading-none">Recordatorio enviado</p>
                <p className="text-[11px] text-ink-muted mt-0.5">por WhatsApp, solo</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
