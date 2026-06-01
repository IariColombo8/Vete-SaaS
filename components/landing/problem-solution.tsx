import { X, Check } from "lucide-react"
import { Reveal } from "@/components/landing/motion"
import { Paw } from "@/components/landing/pet-art"

const ANTES = [
  "Turnos en papel y por WhatsApp a toda hora",
  "Llamados para confirmar y recordar cada visita",
  "Historias clínicas en cuadernos que se pierden",
  "Vacunas vencidas que nadie avisó a tiempo",
]

const DESPUES = [
  "Tus clientes reservan solos, online, 24/7",
  "Recordatorios automáticos por WhatsApp y email",
  "Cada historia clínica ordenada y siempre a mano",
  "Avisos de vacunas que se disparan solos",
]

export function ProblemSolution() {
  return (
    <section className="relative overflow-hidden bg-cream py-24">
      <div className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-coral mb-3">
            El día a día de tu clínica
          </p>
          <h2 className="font-display text-4xl sm:text-5xl font-semibold text-ink">
            Del papel y el caos,{" "}
            <span className="text-coral">al orden automático</span>
          </h2>
        </Reveal>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Antes */}
          <Reveal className="rounded-3xl border border-warm-border bg-white/60 p-8">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-ink/5 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
              Antes
            </p>
            <ul className="space-y-4">
              {ANTES.map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink/5">
                    <X className="h-3.5 w-3.5 text-ink-muted" />
                  </span>
                  <span className="text-ink-muted line-through decoration-ink-muted/30">{t}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          {/* Después */}
          <Reveal delay={0.1} className="relative rounded-3xl border-2 border-coral/30 bg-white p-8 shadow-[0_24px_50px_-28px_rgba(255,107,92,0.45)]">
            <Paw className="pointer-events-none absolute -top-5 -right-3 h-16 w-16 text-coral/10 rotate-12" />
            <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-coral px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-white">
              <Paw className="h-3.5 w-3.5" /> Con VetPanel
            </p>
            <ul className="space-y-4">
              {DESPUES.map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-soft">
                    <Check className="h-3.5 w-3.5 text-teal" />
                  </span>
                  <span className="font-medium text-ink">{t}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
