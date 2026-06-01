import { CalendarDays, ClipboardList, MessageCircle, Users, Globe, QrCode } from "lucide-react"
import { Reveal } from "@/components/landing/motion"
import { Paw } from "@/components/landing/pet-art"

export function FeaturesBento() {
  return (
    <section id="caracteristicas" className="relative bg-cream py-24 overflow-hidden">
      <Paw className="pointer-events-none absolute -right-10 top-12 h-44 w-44 text-coral/[0.05] rotate-12" />
      <div className="relative container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-coral mb-3">Todo en un solo lugar</p>
          <h2 className="font-display text-4xl sm:text-5xl font-semibold text-ink">
            Una herramienta para toda la clínica
          </h2>
          <p className="mt-4 text-lg text-ink-muted max-w-xl mx-auto">
            Pensada para veterinarias reales, no para llenar planillas.
          </p>
        </Reveal>

        <div className="grid lg:grid-cols-6 gap-5 auto-rows-fr">
          {/* Agenda — grande */}
          <Reveal className="lg:col-span-3">
            <div className="group h-full rounded-3xl border border-warm-border bg-white p-8 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_24px_50px_-24px_rgba(45,42,38,0.25)]">
              <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-coral-soft text-coral transition-transform group-hover:scale-110">
                <CalendarDays className="h-7 w-7" />
              </div>
              <h3 className="font-display text-2xl font-semibold text-ink mb-2">Agenda online 24/7</h3>
              <p className="text-ink-muted text-sm leading-relaxed mb-5">
                Tus clientes reservan desde el celular cuando quieran. Vos controlás
                horarios, días bloqueados y disponibilidad en tiempo real.
              </p>
              <div className="flex flex-wrap gap-2">
                {["09:00", "10:30", "11:00", "16:30"].map((s, i) => (
                  <span
                    key={s}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      i === 1 ? "bg-coral text-white" : "border border-warm-border bg-cream text-ink"
                    }`}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Libreta — grande */}
          <Reveal delay={0.08} className="lg:col-span-3">
            <div className="group h-full rounded-3xl border border-warm-border bg-white p-8 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_24px_50px_-24px_rgba(45,42,38,0.25)]">
              <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-soft text-teal transition-transform group-hover:scale-110">
                <ClipboardList className="h-7 w-7" />
              </div>
              <h3 className="font-display text-2xl font-semibold text-ink mb-2">Libreta sanitaria digital</h3>
              <p className="text-ink-muted text-sm leading-relaxed mb-5">
                Historial clínico completo de cada mascota: vacunas, diagnósticos y
                tratamientos. Exportable a PDF y con QR público para el dueño.
              </p>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-soft px-3 py-1.5 text-xs font-semibold text-teal">
                  <QrCode className="h-3.5 w-3.5" /> QR por mascota
                </span>
                <span className="rounded-full bg-cream px-3 py-1.5 text-xs font-medium text-ink-muted">PDF</span>
              </div>
            </div>
          </Reveal>

          {/* WhatsApp */}
          <Reveal className="lg:col-span-2">
            <div className="group h-full rounded-3xl border border-warm-border bg-white p-7 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg">
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-coral-soft text-coral transition-transform group-hover:scale-110">
                <MessageCircle className="h-6 w-6" />
              </div>
              <h3 className="font-display text-xl font-semibold text-ink mb-2">Recordatorios automáticos</h3>
              <p className="text-ink-muted text-sm leading-relaxed">
                Confirmaciones y avisos de vacunas por WhatsApp y email. Sin que muevas un dedo.
              </p>
            </div>
          </Reveal>

          {/* Profesionales */}
          <Reveal delay={0.08} className="lg:col-span-2">
            <div className="group h-full rounded-3xl border border-warm-border bg-white p-7 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg">
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-soft text-teal transition-transform group-hover:scale-110">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="font-display text-xl font-semibold text-ink mb-2">Varios profesionales</h3>
              <p className="text-ink-muted text-sm leading-relaxed">
                Agendas independientes por veterinario y roles con permisos para todo tu equipo.
              </p>
            </div>
          </Reveal>

          {/* Página propia */}
          <Reveal delay={0.16} className="lg:col-span-2">
            <div className="group h-full rounded-3xl border border-warm-border bg-white p-7 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg">
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber/15 text-amber transition-transform group-hover:scale-110">
                <Globe className="h-6 w-6" />
              </div>
              <h3 className="font-display text-xl font-semibold text-ink mb-2">Tu página, tu link</h3>
              <p className="text-ink-muted text-sm leading-relaxed">
                Una web pública con la identidad de tu clínica para compartir y recibir reservas.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
