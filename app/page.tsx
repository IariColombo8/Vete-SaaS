import Link from "next/link"
import {
  CalendarDays,
  ClipboardList,
  Users,
  Bell,
  Globe,
  Smartphone,
  ArrowRight,
  Check,
  Star,
  Stethoscope,
  ShieldCheck,
  Zap,
} from "lucide-react"
import { HeroCta } from "@/components/hero-cta"
import { PricingCards } from "@/components/pricing/pricing-cards"

// ─── Sección Hero ────────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden bg-slate-950">
      {/* Gradient blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-32 h-[600px] w-[600px] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute -bottom-40 -left-32 h-[500px] w-[500px] rounded-full bg-teal-500/10 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[800px] w-[800px] rounded-full bg-slate-800/30 blur-[100px]" />
      </div>

      {/* Dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "32px 32px" }}
      />

      <div className="relative z-10 container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="max-w-3xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 mb-8">
            <Stethoscope className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-400 tracking-wide uppercase">
              Plataforma de gestión veterinaria
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white leading-[1.05] tracking-tight mb-6">
            Sistema de gestión{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              para Veterinarias
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 leading-relaxed mb-10 max-w-2xl">
            Controlá turnos, clientes y libretas sanitarias desde un solo lugar.
            Tu clínica online, con tu link, en minutos.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <HeroCta />
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 px-7 py-3.5 text-base font-semibold text-slate-200 transition-all hover:border-slate-600"
            >
              Ver demo en vivo
            </Link>
          </div>

          {/* Trust badges */}
          <div className="mt-12 flex flex-wrap items-center gap-6">
            {[
              { icon: ShieldCheck, text: "Tus datos, siempre protegidos" },
              { icon: Zap, text: "Configuración en minutos" },
              { icon: Globe, text: "Tu link personalizado" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 text-slate-500 text-sm">
                <Icon className="h-4 w-4 text-emerald-500" />
                {text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-950 to-transparent" />
    </section>
  )
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function StatsBar() {
  const stats = [
    { value: "500+", label: "Turnos gestionados" },
    { value: "50+", label: "Veterinarias activas" },
    { value: "98%", label: "Clientes satisfechos" },
    { value: "24/7", label: "Disponible siempre" },
  ]

  return (
    <section className="bg-slate-900 border-y border-slate-800">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-800">
          {stats.map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center py-8 px-4 text-center">
              <span className="text-3xl font-extrabold text-white">{value}</span>
              <span className="mt-1 text-sm text-slate-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Características principales ─────────────────────────────────────────────
function FeaturesSection() {
  const features = [
    {
      icon: CalendarDays,
      color: "emerald",
      title: "Agenda Digital",
      description:
        "Turnos online disponibles las 24 horas. Tus clientes reservan desde cualquier dispositivo, vos controlás la disponibilidad en tiempo real.",
      bullets: ["Horarios personalizables", "Días bloqueados", "Recordatorios automáticos"],
    },
    {
      icon: ClipboardList,
      color: "teal",
      title: "Libreta Sanitaria",
      description:
        "Historial clínico completo para cada mascota. Vacunas, diagnósticos, tratamientos y toda la historia en un lugar.",
      bullets: ["Historial cronológico", "Registro de vacunas", "Próximas visitas"],
    },
    {
      icon: Users,
      color: "cyan",
      title: "Gestión de Clientes",
      description:
        "Perfiles completos de dueños y mascotas con historial de visitas, datos de contacto y seguimiento automatizado.",
      bullets: ["Búsqueda por DNI o email", "Historial de cambios", "Múltiples mascotas"],
    },
  ]

  const colorMap: Record<string, string> = {
    emerald: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/20 text-emerald-400",
    teal: "from-teal-500/20 to-teal-500/5 border-teal-500/20 text-teal-400",
    cyan: "from-cyan-500/20 to-cyan-500/5 border-cyan-500/20 text-cyan-400",
  }
  const iconBgMap: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-400",
    teal: "bg-teal-500/10 text-teal-400",
    cyan: "bg-cyan-500/10 text-cyan-400",
  }

  return (
    <section id="caracteristicas" className="bg-slate-950 py-24">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400 mb-3">Características</p>
          <h2 className="text-4xl sm:text-5xl font-extrabold text-white">
            Todo lo que necesita tu clínica
          </h2>
          <p className="mt-4 text-lg text-slate-400 max-w-xl mx-auto">
            Diseñado específicamente para veterinarias. Sin complicaciones.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {features.map(({ icon: Icon, color, title, description, bullets }) => (
            <div
              key={title}
              className={`rounded-2xl border bg-gradient-to-b p-8 ${colorMap[color]}`}
            >
              <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl mb-6 ${iconBgMap[color]}`}>
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">{description}</p>
              <ul className="space-y-2">
                {bullets.map((b) => (
                  <li key={b} className="flex items-center gap-2 text-sm text-slate-300">
                    <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Cómo funciona ────────────────────────────────────────────────────────────
function HowItWorksSection() {
  const steps = [
    {
      number: "01",
      title: "Registrá tu clínica",
      description: "Creá tu cuenta con Google en segundos. Sin formularios largos ni tarjeta requerida.",
    },
    {
      number: "02",
      title: "Personalizá tu página",
      description: "Tu veterinaria tiene su propio link único. Tus clientes reservan directamente desde ahí.",
    },
    {
      number: "03",
      title: "Gestioná todo desde un lugar",
      description: "Aprobá turnos, actualizá historias clínicas y hacé seguimiento desde el panel de control.",
    },
  ]

  return (
    <section className="bg-slate-900 py-24 border-y border-slate-800">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400 mb-3">Simple y rápido</p>
          <h2 className="text-4xl sm:text-5xl font-extrabold text-white">Empezá en 3 pasos</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connector line */}
          <div className="hidden md:block absolute top-10 left-1/3 right-1/3 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />

          {steps.map(({ number, title, description }) => (
            <div key={number} className="relative flex flex-col items-center text-center">
              <div className="relative z-10 mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800 shadow-xl">
                <span className="text-2xl font-extrabold text-emerald-400">{number}</span>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Grid de funcionalidades ──────────────────────────────────────────────────
function FeatureGridSection() {
  const items = [
    { icon: Globe, title: "Link personalizado", desc: "Tu propia URL para compartir con clientes." },
    { icon: Bell, title: "Email automático", desc: "Confirmación instantánea al dueño al reservar." },
    { icon: ShieldCheck, title: "Datos protegidos", desc: "Seguridad de nivel empresarial en todos tus datos." },
    { icon: Smartphone, title: "Mobile first", desc: "Perfecto en celular, tablet y computadora." },
    { icon: ClipboardList, title: "Historial completo", desc: "Cada consulta, vacuna y diagnóstico guardado." },
    { icon: Users, title: "Multi-veterinario", desc: "Sumá a tu equipo con roles y permisos propios." },
  ]

  return (
    <section className="bg-slate-950 py-24">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400 mb-3">Más funciones</p>
          <h2 className="text-4xl font-extrabold text-white">Pensado para el día a día</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="group rounded-xl border border-slate-800 bg-slate-900/50 p-6 hover:border-emerald-500/30 hover:bg-slate-900 transition-all"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                <Icon className="h-5 w-5 text-emerald-400" />
              </div>
              <h4 className="text-sm font-bold text-white mb-1.5">{title}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Precios ──────────────────────────────────────────────────────────────────
function PricingSection() {
  return (
    <section id="precios" className="bg-slate-900 py-24 border-y border-slate-800">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400 mb-3">Precios</p>
          <h2 className="text-4xl sm:text-5xl font-extrabold text-white">Simple y transparente</h2>
          <p className="mt-4 text-slate-400">Sin costos ocultos. Cancelás cuando quieras.</p>
        </div>

        <PricingCards />
      </div>
    </section>
  )
}

// ─── Testimonios ──────────────────────────────────────────────────────────────
function TestimonialsSection() {
  const testimonials = [
    {
      quote: "Antes anotaba los turnos en papel. Ahora mis clientes reservan solos y yo me entero al instante. Cambió todo.",
      name: "Dra. Priscila M.",
      role: "Veterinaria a domicilio, Buenos Aires",
    },
    {
      quote: "La libreta sanitaria digital es lo mejor. Puedo ver el historial completo de cualquier paciente en segundos.",
      name: "Dr. Santiago R.",
      role: "Clínica veterinaria, Córdoba",
    },
  ]

  return (
    <section className="bg-slate-950 py-24">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400 mb-3">Testimonios</p>
          <h2 className="text-4xl font-extrabold text-white">Lo que dicen los veterinarios</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {testimonials.map(({ quote, name, role }) => (
            <div key={name} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8">
              <div className="flex gap-1 mb-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-emerald-400 text-emerald-400" />
                ))}
              </div>
              <p className="text-slate-300 leading-relaxed mb-6 text-sm">"{quote}"</p>
              <div>
                <p className="text-sm font-semibold text-white">{name}</p>
                <p className="text-xs text-slate-500">{role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── CTA final ────────────────────────────────────────────────────────────────
function CtaSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-emerald-900/40 via-slate-900 to-teal-900/40 py-28 border-t border-slate-800">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[400px] w-[800px] rounded-full bg-emerald-500/10 blur-[100px]" />
      </div>
      <div className="relative z-10 container max-w-3xl mx-auto px-4 text-center">
        <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-6 leading-tight">
          Tu clínica merece una herramienta profesional
        </h2>
        <p className="text-lg text-slate-400 mb-10">
          Empezá hoy gratis. Sin tarjeta, sin compromisos.
        </p>
        <Link href="/registro">
          <button className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 px-10 py-4 text-base font-bold text-white shadow-2xl shadow-emerald-500/30 transition-all hover:scale-105">
            Empezar gratis
            <ArrowRight className="h-5 w-5" />
          </button>
        </Link>
        <p className="mt-4 text-xs text-slate-500">Plan básico gratuito. Plan Plus desde $30.000/mes.</p>
      </div>
    </section>
  )
}

// ─── Footer SaaS ─────────────────────────────────────────────────────────────
function SaasFooter() {
  return (
    <footer className="bg-slate-950 border-t border-slate-800 py-12">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500">
              <Stethoscope className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-bold text-white">
              Vet<span className="text-emerald-400">Panel</span>
            </span>
          </div>
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-2">
            <a href="#caracteristicas" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
              Características
            </a>
            <a href="#precios" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
              Precios
            </a>
            <Link href="/login" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
              Iniciar Sesión
            </Link>
          </div>
          <p className="text-xs text-slate-600">
            © {new Date().getFullYear()} VetPanel. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function SaasLandingPage() {
  return (
    <main className="bg-slate-950">
      <HeroSection />
      <StatsBar />
      <FeaturesSection />
      <HowItWorksSection />
      <FeatureGridSection />
      <PricingSection />
      <CtaSection />
      <SaasFooter />
    </main>
  )
}
