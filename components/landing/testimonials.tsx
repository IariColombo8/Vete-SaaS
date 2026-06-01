import { Star } from "lucide-react"
import { Reveal } from "@/components/landing/motion"
import { DogFace, CatFace, Paw } from "@/components/landing/pet-art"

const TESTIMONIALS = [
  {
    quote:
      "Antes anotaba los turnos en papel y vivía con el teléfono en la mano. Ahora mis clientes reservan solos y me entero al instante. Cambió por completo cómo trabajo.",
    name: "Dra. Priscila M.",
    role: "Veterinaria a domicilio · Buenos Aires",
    art: DogFace,
  },
  {
    quote:
      "La libreta sanitaria digital es lo mejor que me pasó. Veo el historial completo de cualquier paciente en segundos y los recordatorios de vacunas se mandan solos.",
    name: "Dr. Santiago R.",
    role: "Clínica veterinaria · Córdoba",
    art: CatFace,
  },
]

export function Testimonials() {
  return (
    <section className="bg-white py-24 border-y border-warm-border">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-teal mb-3">Testimonios</p>
          <h2 className="font-display text-4xl sm:text-5xl font-semibold text-ink">
            Veterinarios que ya volvieron a casa temprano
          </h2>
        </Reveal>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {TESTIMONIALS.map(({ quote, name, role, art: Art }, i) => (
            <Reveal key={name} delay={i * 0.1}>
              <figure className="relative h-full rounded-3xl border border-warm-border bg-cream p-8 overflow-hidden">
                <Paw className="pointer-events-none absolute -bottom-4 -right-2 h-20 w-20 text-coral/[0.06]" />
                <div className="relative flex gap-1 mb-5">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} className="h-4 w-4 fill-amber text-amber" />
                  ))}
                </div>
                <blockquote className="relative text-ink leading-relaxed mb-6">“{quote}”</blockquote>
                <figcaption className="relative flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-coral-soft">
                    <Art className="h-7 w-7 text-coral" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-ink">{name}</p>
                    <p className="text-xs text-ink-muted">{role}</p>
                  </div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
