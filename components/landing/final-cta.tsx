"use client"

import Link from "next/link"
import { track } from "@vercel/analytics"
import { ArrowRight } from "lucide-react"
import { Reveal, Magnetic } from "@/components/landing/motion"
import { Paw, Bone } from "@/components/landing/pet-art"

export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-coral via-coral to-coral-ink py-28">
      <div className="paw-pattern pointer-events-none absolute inset-0 opacity-[0.12]" />
      <Paw className="paw-wiggle pointer-events-none absolute -bottom-8 -left-6 h-48 w-48 text-white/10" />
      <Bone className="pointer-events-none absolute top-12 right-10 h-20 w-20 text-white/10 rotate-12" />

      <div className="relative z-10 container max-w-3xl mx-auto px-4 text-center">
        <Reveal>
          <h2 className="font-display text-4xl sm:text-5xl font-semibold text-white mb-6 leading-tight">
            Volvé a casa a horario.<br className="hidden sm:block" /> Probalo hoy, gratis.
          </h2>
          <p className="text-lg text-white/85 mb-10">
            10 días de Pro sin tarjeta, sin instalar nada. Tu clínica online en minutos.
          </p>
          <Magnetic strength={0.4}>
            <Link href="/registro" onClick={() => track("hero_cta_click", { action: "registro", from: "final" })}>
              <button className="inline-flex items-center gap-2 rounded-2xl bg-white px-10 py-4 text-base font-bold text-coral shadow-2xl shadow-black/20 transition-all hover:bg-cream">
                Empezar la prueba gratis
                <ArrowRight className="h-5 w-5" />
              </button>
            </Link>
          </Magnetic>
          <p className="mt-4 text-xs text-white/70">Después, Básico $50.000/mes o Pro $80.000/mes · Cancelás cuando quieras</p>
        </Reveal>
      </div>
    </section>
  )
}
