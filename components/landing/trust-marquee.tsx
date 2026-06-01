import { ShieldCheck, Smartphone, HeartHandshake, Cloud, MapPin, Clock } from "lucide-react"
import { Paw } from "@/components/landing/pet-art"

// Server component: el marquee es CSS puro (.marquee-track en globals.css),
// no necesita JS de cliente. Un island menos hidratando = mejor LCP.

const ITEMS = [
  { icon: ShieldCheck, text: "Datos cifrados" },
  { icon: Smartphone, text: "Funciona en cualquier celular" },
  { icon: HeartHandshake, text: "Soporte humano" },
  { icon: Cloud, text: "Sin instalar nada" },
  { icon: MapPin, text: "Hecho en Argentina" },
  { icon: Clock, text: "Reservas 24/7" },
]

function Row() {
  return (
    <div className="flex shrink-0">
      {ITEMS.map(({ icon: Icon, text }) => (
        <div key={text} className="flex items-center gap-2.5 px-7 text-sm font-medium text-ink-muted">
          <Icon className="h-4 w-4 text-teal" />
          {text}
          <Paw className="h-3 w-3 text-coral/30 ml-4" />
        </div>
      ))}
    </div>
  )
}

export function TrustMarquee() {
  return (
    <section className="border-y border-warm-border bg-white py-5">
      <div className="marquee-mask overflow-hidden">
        <div className="marquee-track">
          <Row />
          <Row />
        </div>
      </div>
    </section>
  )
}
