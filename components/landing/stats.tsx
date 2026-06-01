"use client"

import { CountUp } from "@/components/landing/motion"

interface Stat {
  prefix?: string
  value?: number
  suffix?: string
  static?: string
  label: string
}

const STATS: Stat[] = [
  { prefix: "−", value: 40, suffix: "%", label: "menos ausencias a turnos" },
  { prefix: "+", value: 8, suffix: " h", label: "ganadas por semana" },
  { static: "24/7", label: "reservas, sin atender el teléfono" },
  { value: 5, suffix: " min", label: "para dejar todo configurado" },
]

export function Stats() {
  return (
    <section className="bg-white border-y border-warm-border">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y divide-warm-border md:divide-y-0 md:divide-x">
          {STATS.map((s) => (
            <div key={s.label} className="flex flex-col items-center px-4 py-10 text-center">
              <span className="font-display text-4xl sm:text-5xl font-semibold text-coral">
                {s.static ? (
                  s.static
                ) : (
                  <CountUp value={s.value ?? 0} prefix={s.prefix} suffix={s.suffix} />
                )}
              </span>
              <span className="mt-2 text-sm text-ink-muted max-w-[12rem]">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
