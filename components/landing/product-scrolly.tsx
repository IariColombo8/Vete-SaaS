"use client"

import { useState } from "react"
import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import { CalendarCheck, BellRing, ClipboardList, MessageCircle } from "lucide-react"
import { ProductMock, type MockScreen } from "@/components/landing/product-mock"

interface Step {
  icon: typeof CalendarCheck
  screen: MockScreen
  kicker: string
  title: string
  desc: string
}

const STEPS: Step[] = [
  {
    icon: CalendarCheck,
    screen: "reservar",
    kicker: "Reservan solos",
    title: "Tu cliente saca turno en 3 toques",
    desc: "Desde tu link, elige mascota, servicio y horario disponible. Sin llamados, sin idas y vueltas por WhatsApp, a cualquier hora.",
  },
  {
    icon: BellRing,
    screen: "confirmar",
    kicker: "Se confirma solo",
    title: "Confirmás y el dueño se entera al instante",
    desc: "Aprobás el turno y VetPanel le envía la confirmación por email automáticamente. El turno queda en tu agenda, ordenado.",
  },
  {
    icon: ClipboardList,
    screen: "libreta",
    kicker: "Todo a mano",
    title: "La historia clínica completa, en segundos",
    desc: "Vacunas, peso, diagnósticos y tratamientos de cada paciente. Exportás la libreta a PDF o la compartís con un QR.",
  },
  {
    icon: MessageCircle,
    screen: "recordatorio",
    kicker: "Vuelven solos",
    title: "Recordatorios que traen de vuelta a tus pacientes",
    desc: "Avisos automáticos de turnos y de vacunas por vencer, por WhatsApp. Menos ausencias y más visitas, sin que hagas nada.",
  },
]

export function ProductScrolly() {
  const [active, setActive] = useState(0)
  const reduce = useReducedMotion()

  return (
    <section className="relative bg-white py-24">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-4 lg:mb-0">
          <p className="text-sm font-semibold uppercase tracking-widest text-coral mb-3">Cómo funciona</p>
          <h2 className="font-display text-4xl sm:text-5xl font-semibold text-ink">
            Tu clínica, funcionando sola
          </h2>
          <p className="mt-4 text-lg text-ink-muted max-w-xl mx-auto">
            Scrolleá y mirá el flujo completo, de la reserva al recordatorio.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 lg:gap-16">
          {/* Pasos */}
          <div className="lg:py-[10vh]">
            {STEPS.map((step, i) => {
              const Icon = step.icon
              const isActive = active === i
              return (
                <motion.div
                  key={i}
                  onViewportEnter={() => setActive(i)}
                  viewport={{ margin: "-45% 0px -45% 0px" }}
                  animate={{ opacity: reduce || isActive ? 1 : 0.4 }}
                  transition={{ duration: 0.3 }}
                  className="lg:min-h-[72vh] flex flex-col justify-center py-10 lg:py-0"
                >
                  <div className="mb-5 flex items-center gap-3">
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-colors ${
                        isActive ? "bg-coral text-white" : "bg-coral-soft text-coral"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-widest text-coral">
                      Paso {i + 1} · {step.kicker}
                    </span>
                  </div>
                  <h3 className="font-display text-2xl sm:text-3xl font-semibold text-ink mb-3 max-w-md">
                    {step.title}
                  </h3>
                  <p className="text-ink-muted leading-relaxed max-w-md">{step.desc}</p>

                  {/* Mock inline en mobile */}
                  <div className="lg:hidden mt-8 max-w-sm">
                    <ProductMock screen={step.screen} />
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Mock pegado (desktop) */}
          <div className="hidden lg:block">
            <div className="sticky top-28 flex h-[80vh] items-center">
              <div className="relative w-full max-w-md mx-auto">
                {/* halo */}
                <div className="pointer-events-none absolute -inset-8 rounded-[3rem] bg-gradient-to-br from-coral/10 to-teal/10 blur-2xl" />
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active}
                    initial={reduce ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? undefined : { opacity: 0, y: -14 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="relative"
                  >
                    <ProductMock screen={STEPS[active].screen} />
                  </motion.div>
                </AnimatePresence>

                {/* indicador de progreso */}
                <div className="mt-6 flex justify-center gap-2">
                  {STEPS.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        active === i ? "w-8 bg-coral" : "w-1.5 bg-coral/25"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
