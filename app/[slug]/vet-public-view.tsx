"use client"

import { useEffect, useState, useRef, useCallback, Children, type ReactNode } from "react"
import { useParams, useRouter } from "next/navigation"
import { getTenant, getTenantConfig } from "@/lib/supabase/queries"
import type { TenantConfig, ServicioTenant, HorarioTenant, Modalidad } from "@/lib/supabase/queries"
import { diaToWeekdays, formatDiasLabel } from "@/lib/turnos/horarios"
import { Button } from "@/components/ui/button"
import {
  CalendarPlus, Phone, Mail, MapPin, Clock, Stethoscope,
  Loader2, ChevronLeft, ChevronRight, ArrowRight,
  Heart, Shield, Star, Home, PawPrint, UserPlus, Gift, ShoppingBag, Info, Code2,

} from "lucide-react"
import Link from "next/link"
import { getProductosPublicados, getProductosPublicadosPorIds } from "@/lib/supabase/productos"
import { getPromocionesPublicadas } from "@/lib/supabase/promociones"
import { getSorteoActivo, getSorteosFinalizadosPublicados } from "@/lib/supabase/sorteos"
import { tieneOferta } from "@/lib/productos/precios"
import { normalizePlan, PLANS } from "@/lib/plans"
import { ProductoTarjeta } from "@/components/public/producto-tarjeta"
import { PromocionTarjeta } from "@/components/public/promocion-tarjeta"
import { DetalleDialog } from "@/components/public/detalle-dialog"
import { SorteoBanner, SorteoTeaser } from "@/components/public/sorteo-banner"
import { SorteosHistorial } from "@/components/public/sorteos-historial"
import { RegistroClienteDialog } from "@/components/turnos/RegistroClienteDialog"
import type { Producto, Promocion, Sorteo } from "@/lib/supabase/types"

/* ═══════════════════════════ DEFAULTS ═══════════════════════════ */

const FOTOS_DEFAULT_DESKTOP = [
  "https://images.unsplash.com/photo-1587300003388-59208cc962cb?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=1400&q=80",
  "https://www.laclinicaveterinaria.com/wp-content/uploads/2022/02/Captura-de-pantalla-2022-02-02-a-las-13.49.23_resultado-scaled.webp",
]

const FOTOS_DEFAULT_MOBILE = [
  "https://images.unsplash.com/photo-1510771463146-e89e6e86560e?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTncqvCAsIT8bP5iYEVJ9VDXejE2HdoqN8hPA&s",
  "https://img.freepik.com/foto-gratis/perro-pequeno-es-adorable_23-2149016873.jpg",
]

const SERVICIOS_DEFAULT: ServicioTenant[] = [
  { emoji: "🩺", nombre: "Consulta general", descripcion: "Revision completa de tu mascota con profesionales dedicados" },
  { emoji: "💉", nombre: "Vacunacion", descripcion: "Plan de vacunas al dia para proteger a tu compañero" },
  { emoji: "🏥", nombre: "Cirugia", descripcion: "Procedimientos quirurgicos con tecnologia de punta" },
  { emoji: "🛁", nombre: "Peluqueria", descripcion: "Bano y corte profesional para que siempre luzca bien" },
  { emoji: "🚨", nombre: "Urgencias", descripcion: "Atencion de emergencias las 24 horas" },
  { emoji: "🧪", nombre: "Analisis clinicos", descripcion: "Laboratorio y diagnostico rapido y preciso" },
]

const HORARIOS_DEFAULT: HorarioTenant[] = [
  { dia: "Lunes a Viernes", apertura: "09:00", cierre: "18:00", cerrado: false },
  { dia: "Sabado", apertura: "09:00", cierre: "13:00", cerrado: false },
  { dia: "Domingo", apertura: "", cierre: "", cerrado: true },
]

const FEATURES = [
  { icon: Heart, label: "Amor por los animales", desc: "Cada paciente es tratado con cariño" },
  { icon: Shield, label: "Profesionales matriculados", desc: "Equipo con experiencia comprobada" },
  { icon: Star, label: "Tecnologia moderna", desc: "Equipamiento de ultima generacion" },
]

/* ═══════════════════ INTERSECTION OBSERVER ═══════════════════ */

function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true)
      return
    }
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.unobserve(el) } },
      { threshold },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])

  return { ref, visible }
}

function Reveal({
  children, className = "", delay = 0, direction = "up",
}: {
  children: ReactNode; className?: string; delay?: number
  direction?: "up" | "left" | "right" | "scale"
}) {
  const { ref, visible } = useReveal()
  const transforms: Record<string, string> = {
    up: "translateY(48px)", left: "translateX(-48px)",
    right: "translateX(48px)", scale: "scale(0.92)",
  }
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : transforms[direction],
        transition: `opacity 0.8s cubic-bezier(.16,1,.3,1) ${delay}ms, transform 0.8s cubic-bezier(.16,1,.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

/* ═══════════════════════ MOBILE DETECT ═══════════════════════ */

function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    setMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [breakpoint])
  return mobile
}

/* ═══════════════════════ HERO CAROUSEL ═══════════════════════ */

function HeroCarousel({ fotosDesktop, fotosMobile }: { fotosDesktop: string[]; fotosMobile: string[] }) {
  const isMobile = useIsMobile()
  const fotos = isMobile && fotosMobile.length > 0 ? fotosMobile : fotosDesktop
  const [idx, setIdx] = useState(0)
  const len = fotos.length

  // Reset index cuando cambia el set de fotos
  useEffect(() => { setIdx(0) }, [isMobile])

  useEffect(() => {
    if (len <= 1) return
    const t = setInterval(() => setIdx(c => (c + 1) % len), 6000)
    return () => clearInterval(t)
  }, [len])

  return (
    <div className="absolute inset-0">
      {fotos.map((url, i) => (
        <img
          key={url}
          src={url}
          alt=""
          loading={i === 0 ? "eager" : "lazy"}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            opacity: i === idx ? 1 : 0,
            transition: "opacity 1.5s ease-in-out",
            // Parallax-like zoom lento en la imagen activa
            transform: i === idx ? "scale(1.05)" : "scale(1)",
          }}
        />
      ))}

      {/* Overlay con gradiente dramático */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/80" />
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/50 via-transparent to-teal-950/30" />

      {/* Dots + controles */}
      {len > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3">
          <button
            aria-label="Anterior"
            onClick={() => setIdx(c => (c - 1 + len) % len)}
            className="h-10 w-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center
                       hover:bg-white/20 transition-all duration-300 hover:scale-110 border border-white/10"
          >
            <ChevronLeft className="h-5 w-5 text-white" />
          </button>
          <div className="flex gap-2">
            {fotos.map((_, i) => (
              <button
                key={i}
                aria-label={`Foto ${i + 1}`}
                onClick={() => setIdx(i)}
                className={`rounded-full transition-all duration-500 ${
                  i === idx
                    ? "w-8 h-2.5 bg-emerald-400"
                    : "w-2.5 h-2.5 bg-white/30 hover:bg-white/50"
                }`}
              />
            ))}
          </div>
          <button
            aria-label="Siguiente"
            onClick={() => setIdx(c => (c + 1) % len)}
            className="h-10 w-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center
                       hover:bg-white/20 transition-all duration-300 hover:scale-110 border border-white/10"
          >
            <ChevronRight className="h-5 w-5 text-white" />
          </button>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════ GENERATIVE HERO ═══════════════════════ */

function GenerativeHero() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-slate-950 via-emerald-950 to-teal-950">
      <div className="vet-blob vet-blob-1" />
      <div className="vet-blob vet-blob-2" />
      <div className="vet-blob vet-blob-3" />
      <div className="vet-blob vet-blob-4" />
      {/* Grid pattern overlay */}
      <div className="absolute inset-0" style={{
        backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)",
        backgroundSize: "40px 40px",
      }} />
    </div>
  )
}

/* ═══════════════════════ SERVICE CARD ═══════════════════════ */

function ServiceCard({ s, i }: { s: ServicioTenant; i: number }) {
  return (
    <Reveal delay={i * 100} direction={i % 2 === 0 ? "left" : "right"}>
      <div className="group relative h-full rounded-3xl p-[1px] bg-gradient-to-br from-emerald-500/20 via-transparent to-teal-500/20
                      hover:from-emerald-500/40 hover:to-teal-500/40 transition-all duration-700">
        <div className="relative h-full rounded-3xl bg-white dark:bg-slate-900 p-7 overflow-hidden
                        transition-all duration-500 group-hover:shadow-2xl group-hover:shadow-emerald-500/10">
          {/* Glow background */}
          <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-emerald-400/0 group-hover:bg-emerald-400/10
                          blur-2xl transition-all duration-700" />

          <div className="relative">
            {/* Emoji container con fondo */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/30
                            flex items-center justify-center mb-5 transition-all duration-500
                            group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-lg group-hover:shadow-emerald-500/20">
              <span className="text-3xl">{s.emoji}</span>
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg mb-2 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors duration-300">
              {s.nombre}
            </h3>
            {s.descripcion && (
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                {s.descripcion}
              </p>
            )}
          </div>
        </div>
      </div>
    </Reveal>
  )
}

/* ═══════════════════════ FEATURE PILL ═══════════════════════ */

function FeaturePill({ icon: Icon, label, desc, i }: {
  icon: typeof Heart; label: string; desc: string; i: number
}) {
  return (
    <Reveal delay={200 + i * 150} direction="up">
      <div className="flex items-start gap-4 group">
        <div className="shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500
                        flex items-center justify-center shadow-lg shadow-emerald-500/20
                        transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6">
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white text-sm">{label}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>
        </div>
      </div>
    </Reveal>
  )
}

/* ═══════════════════════ VIDRIERA CARRUSEL ═══════════════════════ */

/**
 * En mobile: grilla estática 2×2 (4 tarjetas, sin scroll). Desde `sm` hacia
 * arriba: fila única con scroll horizontal y flechas (4 visibles en tablet,
 * 6 en desktop) — el resto se descubre deslizando o con las flechas, sin
 * saltar a una segunda fila.
 */
function VidrieraCarrusel({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const items = Children.toArray(children).filter(Boolean)

  const desplazar = (direccion: 1 | -1) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: direccion * el.clientWidth * 0.85, behavior: "smooth" })
  }

  return (
    <div className="mb-12">
      {/* Mobile: 2 columnas × 2 filas, sin scroll */}
      <div className="grid grid-cols-2 gap-4 sm:hidden">
        {items.slice(0, 4).map((child, i) => <div key={i}>{child}</div>)}
      </div>

      {/* Tablet/desktop: fila única con flechas */}
      <div className="relative hidden sm:block">
        <button
          type="button"
          aria-label="Anterior"
          onClick={() => desplazar(-1)}
          className="absolute left-0 top-1/2 z-10 flex h-10 w-10 -translate-x-4 -translate-y-1/2 items-center justify-center
                     rounded-full bg-white shadow-lg ring-1 ring-slate-900/5 transition-transform duration-300
                     hover:scale-110 dark:bg-slate-800"
        >
          <ChevronLeft className="h-5 w-5 text-slate-700 dark:text-slate-200" />
        </button>

        <div
          ref={scrollRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2
                     [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((child, i) => (
            <div
              key={i}
              className="w-[calc(25%-12px)] shrink-0 snap-start lg:w-[calc(16.666%-14px)]"
            >
              {child}
            </div>
          ))}
        </div>

        <button
          type="button"
          aria-label="Siguiente"
          onClick={() => desplazar(1)}
          className="absolute right-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 translate-x-4 items-center justify-center
                     rounded-full bg-white shadow-lg ring-1 ring-slate-900/5 transition-transform duration-300
                     hover:scale-110 dark:bg-slate-800"
        >
          <ChevronRight className="h-5 w-5 text-slate-700 dark:text-slate-200" />
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════ MAIN PAGE ═══════════════════════ */

export default function VetPublicPage() {
  const params = useParams()
  const slug = params.slug as string
  const router = useRouter()
  const [exists, setExists] = useState(false)
  const [config, setConfig] = useState<TenantConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [heroVisible, setHeroVisible] = useState(false)
  const [productos, setProductos] = useState<Producto[]>([])
  const [promociones, setPromociones] = useState<Promocion[]>([])
  const [productosDePromos, setProductosDePromos] = useState<Record<string, Producto>>({})
  const [productoSeleccionado, setProductoSeleccionado] = useState<Producto | null>(null)
  const [promocionSeleccionada, setPromocionSeleccionada] = useState<Promocion | null>(null)
  const [sorteoActivo, setSorteoActivo] = useState<Sorteo | null>(null)
  const [sorteosFinalizados, setSorteosFinalizados] = useState<Sorteo[]>([])

  useEffect(() => {
    Promise.all([
      getTenant(slug), getTenantConfig(slug), getProductosPublicados(slug), getPromocionesPublicadas(slug),
      getSorteoActivo(slug), getSorteosFinalizadosPublicados(slug),
    ]).then(
      async ([t, cfg, prods, promos, sorteo, historial]) => {
        setExists(!!t)
        setConfig(cfg)
        setProductos(prods)
        setPromociones(promos)
        setSorteoActivo(sorteo)
        setSorteosFinalizados(historial)
        setLoading(false)
        requestAnimationFrame(() => setTimeout(() => setHeroVisible(true), 100))

        const ids = Array.from(new Set(promos.flatMap((p) => p.items.map((i) => i.productoId))))
        const productosPromo = await getProductosPublicadosPorIds(slug, ids)
        setProductosDePromos(Object.fromEntries(productosPromo.map((p) => [p.id, p])))
      },
    )
  }, [slug])

  /* ── LOADING ── */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <Stethoscope className="h-6 w-6 text-emerald-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <span className="text-sm text-slate-500 font-medium animate-pulse">Cargando veterinaria...</span>
        </div>
      </div>
    )
  }

  /* ── 404 ── */
  if (!exists) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950">
        <div className="w-24 h-24 rounded-full bg-slate-900 flex items-center justify-center">
          <Stethoscope className="h-10 w-10 text-slate-700" />
        </div>
        <div className="text-center">
          <p className="text-white font-bold text-xl mb-1">Veterinaria no encontrada</p>
          <p className="text-slate-500 text-sm">El enlace puede estar incorrecto o la veterinaria ya no existe.</p>
        </div>
        <Button variant="outline" onClick={() => router.push("/")} className="border-slate-700 text-slate-300 hover:bg-slate-800">
          Volver al inicio
        </Button>
      </div>
    )
  }

  const nombre      = config?.nombre || slug
  const servicios   = config?.servicios?.length ? config.servicios : SERVICIOS_DEFAULT
  const horarios    = config?.horarios?.length ? config.horarios : HORARIOS_DEFAULT
  const fotosDesktop = config?.fotosHero?.length ? config.fotosHero : FOTOS_DEFAULT_DESKTOP
  const fotosMobile  = config?.fotosHeroMobile?.length ? config.fotosHeroMobile : FOTOS_DEFAULT_MOBILE
  const slogan      = config?.slogan || "Cuidamos a tu mascota como si fuera nuestra"
  const descripcion = config?.descripcion || "Brindamos atencion veterinaria de calidad con el mejor equipo profesional."
  const telefono    = config?.telefono
  const email       = config?.email
  const direccion   = config?.direccion
  const ciudad      = config?.ciudad
  const logo        = config?.logo
  const modalidad   = config?.modalidad ?? "local"
  const googleMapsUrl = config?.googleMapsUrl
  const hayFotos    = fotosDesktop.length > 0 || fotosMobile.length > 0
  const muestraMapa = (modalidad === "local" || modalidad === "ambos") && googleMapsUrl
  const tieneFeatureProductos = PLANS[normalizePlan(config?.plan)].features.productos
  const muestraProductos = tieneFeatureProductos && productos.length > 0
  const tieneFeaturePromos = PLANS[normalizePlan(config?.plan)].features.promosSorteos
  const muestraPromociones = tieneFeaturePromos && promociones.length > 0
  // Prioridad en la vidriera: promo primero, después ofertas, después el resto.
  const productosOrdenados = [...productos].sort((a, b) => Number(tieneOferta(b)) - Number(tieneOferta(a)))

  return (
    <main className="min-h-screen bg-white dark:bg-slate-950 overflow-x-hidden">

      {/* ╔══════════════════════════════════════════════════╗
          ║                     HERO                        ║
          ╚══════════════════════════════════════════════════╝ */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background */}
        {hayFotos ? <HeroCarousel fotosDesktop={fotosDesktop} fotosMobile={fotosMobile} /> : <GenerativeHero />}

        {/* Contenido central */}
        <div
          className="relative z-10 container max-w-6xl mx-auto px-6 py-32 flex flex-col items-center text-center"
          style={{
            opacity: heroVisible ? 1 : 0,
            transform: heroVisible ? "none" : "translateY(50px)",
            transition: "all 1.2s cubic-bezier(.16,1,.3,1)",
          }}
        >
          {/* Logo */}
          {logo && (
            <div
              className="mb-8"
              style={{
                opacity: heroVisible ? 1 : 0,
                transform: heroVisible ? "scale(1)" : "scale(0.7)",
                transition: "all 1s cubic-bezier(.16,1,.3,1) 0.2s",
              }}
            >
              <img
                src={logo}
                alt={`Logo de ${nombre}`}
                className="w-48 h-48 rounded-[2rem] shadow-2xl shadow-black/40 ring-2 ring-white/20 object-cover"
              />
            </div>
          )}

          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/15 backdrop-blur-xl px-5 py-2 mb-8"
            style={{
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? "none" : "translateY(20px)",
              transition: "all 0.8s cubic-bezier(.16,1,.3,1) 0.3s",
            }}
          >
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold text-emerald-300 tracking-[0.15em] uppercase">
              Veterinaria
            </span>
          </div>

          {/* Nombre ENORME */}
          <h1
            className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black text-white leading-none mb-6 tracking-tight"
            style={{
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? "none" : "translateY(30px) scale(0.95)",
              transition: "all 1s cubic-bezier(.16,1,.3,1) 0.4s",
              textShadow: "0 4px 60px rgba(0,0,0,0.5)",
            }}
          >
            {nombre}
          </h1>

          {/* Slogan */}
          <p
            className="text-xl sm:text-2xl md:text-3xl text-white/80 font-light mb-4 max-w-2xl leading-snug"
            style={{
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? "none" : "translateY(20px)",
              transition: "all 0.8s cubic-bezier(.16,1,.3,1) 0.6s",
            }}
          >
            {slogan}
          </p>

          {/* Descripción */}
          <p
            className="text-base sm:text-lg text-white/50 mb-12 max-w-lg"
            style={{
              opacity: heroVisible ? 1 : 0,
              transition: "opacity 0.8s ease 0.8s",
            }}
          >
            {descripcion}
          </p>

          {/* CTAs */}
          <div
            className="flex flex-col sm:flex-row items-center gap-4"
            style={{
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? "none" : "translateY(20px)",
              transition: "all 0.8s cubic-bezier(.16,1,.3,1) 0.9s",
            }}
          >
            <Button
              size="lg"
              className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-lg h-14 px-10 rounded-full
                         shadow-2xl shadow-emerald-500/30 border-0
                         transition-all duration-300 hover:shadow-emerald-400/40 hover:scale-105"
              onClick={() => router.push(`/${slug}/turno`)}
            >
              <CalendarPlus className="mr-2 h-5 w-5" />
              Sacar turno
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <RegistroClienteDialog tenantId={slug} />

            <Button
              variant="ghost"
              size="lg"
              className="text-white/80 hover:text-white hover:bg-white/10 font-semibold text-lg h-14 px-10 rounded-full"
              onClick={() => router.push(`/${slug}/mi-historia`)}
            >
              <PawPrint className="mr-2 h-5 w-5" />
              Historia clínica de mi mascota
            </Button>
          </div>
        </div>
      </section>

      {/* ╔══════════════════════════════════════════════════╗
          ║          SORTEO: cartelito que lleva abajo        ║
          ╚══════════════════════════════════════════════════╝ */}
      {sorteoActivo && <SorteoTeaser tenantId={slug} sorteo={sorteoActivo} />}

      {/* ╔══════════════════════════════════════════════════╗
          ║               FEATURES STRIP                     ║
          ╚══════════════════════════════════════════════════╝ */}
      <section className="py-16 bg-slate-50 dark:bg-slate-900 border-y border-slate-100 dark:border-slate-800">
        <div className="container max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
            {FEATURES.map((f, i) => (
              <div
                key={f.label}
                className={
                  i === FEATURES.length - 1 && FEATURES.length % 2 !== 0
                    ? "col-span-2 sm:col-span-1 flex justify-center [&>*]:max-w-xs"
                    : undefined
                }
              >
                <FeaturePill {...f} i={i} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ╔══════════════════════════════════════════════════╗
          ║                  SERVICIOS                       ║
          ╚══════════════════════════════════════════════════╝ */}
      <section className="py-28 bg-white dark:bg-slate-950 relative">
        {/* Fondo decorativo */}
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(16,185,129,0.06),transparent)] pointer-events-none" />

        <div className="container max-w-6xl mx-auto px-6 relative">
          <Reveal>
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-4 py-1.5 mb-5">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.15em]">
                  Servicios
                </span>
              </div>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white tracking-tight mb-4">
                Todo lo que tu mascota<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500">
                  necesita
                </span>
              </h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Ofrecemos una amplia gama de servicios para mantener a tu compañero sano y feliz.
              </p>
            </div>
          </Reveal>

          <div className="flex flex-wrap justify-center gap-6">
            {servicios.map((s, i) => (
              <div key={i} className="w-[calc(50%-12px)] lg:w-[calc(25%-18px)]">
                <ServiceCard s={s} i={i} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ╔══════════════════════════════════════════════════╗
          ║           PRODUCTOS (promos primero)             ║
          ╚══════════════════════════════════════════════════╝ */}
      {(muestraProductos || muestraPromociones) && (
        <section className="py-28 bg-slate-50 dark:bg-slate-900 relative">
          <div className="container max-w-6xl mx-auto px-6 relative">
            <Reveal>
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-4 py-1.5 mb-5">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.15em]">
                    Productos
                  </span>
                </div>
                <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white tracking-tight mb-4">
                  Todo lo que tu mascota<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500">
                    puede necesitar
                  </span>
                </h2>
              </div>
            </Reveal>

            <VidrieraCarrusel>
              {muestraPromociones && promociones[0] && (
                <PromocionTarjeta
                  promocion={promociones[0]} productos={productosDePromos} logo={logo}
                  onClick={() => setPromocionSeleccionada(promociones[0])}
                />
              )}
              {muestraProductos && productosOrdenados.slice(0, 11).map((p) => (
                <ProductoTarjeta key={p.id} producto={p} logo={logo} onClick={() => setProductoSeleccionado(p)} />
              ))}
            </VidrieraCarrusel>

            <div className="flex justify-center">
              <Button
                size="lg"
                variant="outline"
                className="rounded-full font-bold border-2"
                onClick={() => router.push(`/${slug}/productos`)}
              >
                Ver todos los productos
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ╔══════════════════════════════════════════════════╗
          ║                    SORTEOS                       ║
          ╚══════════════════════════════════════════════════╝ */}
      {sorteoActivo && <SorteoBanner tenantId={slug} sorteo={sorteoActivo} />}
      <SorteosHistorial sorteos={sorteosFinalizados} />

      {/* ╔══════════════════════════════════════════════════╗
          ║              HORARIOS + CONTACTO                 ║
          ╚══════════════════════════════════════════════════╝ */}
      <section className="bg-white dark:bg-slate-950 py-14 sm:py-20">
        <div className="container max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-6 items-stretch">

            {/* ── IZQUIERDA: Contacto y Horarios en una sola tarjeta ── */}
            <Reveal>
              <div className="relative h-full rounded-3xl p-[1px] bg-gradient-to-br from-emerald-500/20 via-transparent to-teal-500/20">
                <div className="h-full rounded-3xl bg-white dark:bg-slate-900 overflow-hidden">
                  <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-800 h-full">

                    {/* CONTACTO */}
                    <div className="p-6 sm:p-7 flex flex-col">
                      <div className="flex items-center gap-3 mb-5">
                        <div className="shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500
                                        flex items-center justify-center shadow-lg shadow-emerald-500/20">
                          <MapPin className="h-5 w-5 text-white" />
                        </div>
                        <h3 className="font-bold text-slate-900 dark:text-white">Contacto</h3>
                      </div>

                      {(modalidad === "domicilio" || modalidad === "ambos") && (
                        <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 mb-4">
                          <Home className="h-3 w-3" />
                          {modalidad === "domicilio" ? "Atendemos a domicilio" : "Local y domicilio"}
                        </span>
                      )}

                      <div className="space-y-3 flex-1">
                        {(modalidad === "local" || modalidad === "ambos") && direccion && (
                          <div className="text-sm">
                            <p className="font-semibold text-slate-800 dark:text-slate-100">{direccion}</p>
                            {ciudad && <p className="text-slate-400 text-xs mt-0.5">{ciudad}</p>}
                          </div>
                        )}
                        {email && (
                          <a href={`mailto:${email}`} className="block text-sm font-semibold text-slate-800 dark:text-slate-100 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors break-all">
                            {email}
                          </a>
                        )}
                        {!(direccion || email || modalidad === "domicilio" || modalidad === "ambos") && (
                          <p className="text-slate-400 italic text-xs">Datos de contacto no configurados aun.</p>
                        )}
                      </div>

                      <Button
                        className="mt-6 w-full bg-emerald-500 hover:bg-emerald-400 text-white
                                   font-bold h-11 rounded-full text-sm border-0 shadow-lg shadow-emerald-500/20"
                        onClick={() => router.push(`/${slug}/turno`)}
                      >
                        <CalendarPlus className="mr-2 h-4 w-4" />
                        Reservar turno
                      </Button>
                    </div>

                    {/* HORARIOS */}
                    <div className="p-6 sm:p-7">
                      <div className="flex items-center gap-3 mb-5">
                        <div className="shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500
                                        flex items-center justify-center shadow-lg shadow-emerald-500/20">
                          <Clock className="h-5 w-5 text-white" />
                        </div>
                        <h3 className="font-bold text-slate-900 dark:text-white">Horarios</h3>
                      </div>
                      <div className="space-y-2.5">
                        {horarios.map((h, i) => (
                          <div key={i} className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-medium text-slate-600 dark:text-slate-300 min-w-0">
                              {formatDiasLabel(diaToWeekdays(h.dia)) || h.dia}
                              {h.nombre && <span className="text-slate-400"> ({h.nombre})</span>}
                            </span>
                            {h.cerrado ? (
                              <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-slate-400">Cerrado</span>
                            ) : (
                              <span className="shrink-0 whitespace-nowrap font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                {h.apertura} – {h.cierre}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </Reveal>

            {/* ── DERECHA: Mapa o placeholder ── */}
            <Reveal delay={200} direction="right">
              <div className="h-full min-h-[280px]">
                {muestraMapa ? (
                  <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 h-full min-h-[280px]">
                    {googleMapsUrl.includes("<iframe") ? (
                      <div
                        className="w-full h-full [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0"
                        dangerouslySetInnerHTML={{ __html: googleMapsUrl }}
                      />
                    ) : (
                      <iframe
                        src={`https://maps.google.com/maps?q=${encodeURIComponent(googleMapsUrl)}&output=embed`}
                        className="w-full h-full border-0"
                        loading="lazy"
                        allowFullScreen
                        referrerPolicy="no-referrer-when-downgrade"
                        title="Ubicacion"
                      />
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 h-full min-h-[280px]
                                  bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center gap-2 p-6">
                    <Stethoscope className="h-6 w-6 text-slate-300 dark:text-slate-700" />
                    <p className="text-slate-400 dark:text-slate-600 text-center text-xs max-w-xs">
                      {modalidad === "domicilio"
                        ? "Nos acercamos a tu domicilio para atender a tu mascota."
                        : "Agrega tu ubicacion de Google Maps desde la configuracion."}
                    </p>
                  </div>
                )}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ╔══════════════════════════════════════════════════╗
          ║                    FOOTER                        ║
          ╚══════════════════════════════════════════════════╝ */}
      <footer className="bg-slate-950 border-t border-slate-800/30">
        <div className="container max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-2">
            {logo ? (
              <img src={logo} alt="" className="w-10 h-10 rounded-xl object-cover ring-1 ring-white/10" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0">
                <Stethoscope className="h-5 w-5 text-white" />
              </div>
            )}
            <span className="font-bold text-white text-lg">{nombre}</span>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-8">

            {/* FILA 1 */}

            {/* CONTACTO */}
            <div>
              <h4 className="flex items-center gap-2.5 font-semibold text-white mb-4">
                <MapPin className="h-4 w-4 text-emerald-500 shrink-0" />
                Contacto y ubicacion
              </h4>
              <p className="text-sm text-slate-400 leading-relaxed mb-4">{descripcion}</p>
              <div className="space-y-2.5 text-sm">
                {direccion && (
                  <div className="flex items-start gap-2.5 text-slate-400">
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
                    <span>{direccion}{ciudad ? `, ${ciudad}` : ""}</span>
                  </div>
                )}
                {telefono && (
                  <a href={`tel:${telefono}`} className="flex items-center gap-2.5 text-slate-400 hover:text-white transition-colors">
                    <Phone className="h-4 w-4 shrink-0 text-emerald-500" />
                    {telefono}
                  </a>
                )}
                {email && (
                  <a href={`mailto:${email}`} className="flex items-center gap-2.5 text-slate-400 hover:text-white transition-colors break-all">
                    <Mail className="h-4 w-4 shrink-0 text-emerald-500" />
                    {email}
                  </a>
                )}
              </div>
            </div>

            {/* PARA CLIENTES */}
            <div>
              <h4 className="flex items-center gap-2.5 font-semibold text-white mb-4">
                <PawPrint className="h-4 w-4 text-emerald-500 shrink-0" />
                Para clientes
              </h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <Link href={`/${slug}/turno`} className="flex items-center gap-2.5 text-slate-400 hover:text-white transition-colors">
                    <CalendarPlus className="h-4 w-4 shrink-0" />
                    Sacar turno
                  </Link>
                </li>
                <li>
                  <RegistroClienteDialog
                    tenantId={slug}
                    trigger={
                      <button type="button" className="flex items-center gap-2.5 text-slate-400 hover:text-white transition-colors">
                        <UserPlus className="h-4 w-4 shrink-0" />
                        Registrarme como cliente
                      </button>
                    }
                  />
                </li>
                <li>
                  <Link href={`/${slug}/mi-historia`} className="flex items-center gap-2.5 text-slate-400 hover:text-white transition-colors">
                    <PawPrint className="h-4 w-4 shrink-0" />
                    Historia clinica de mi mascota
                  </Link>
                </li>
                <li>
                  <Link href={`/${slug}/productos`} className="flex items-center gap-2.5 text-slate-400 hover:text-white transition-colors">
                    <ShoppingBag className="h-4 w-4 shrink-0" />
                    Productos
                  </Link>
                </li>
                {sorteoActivo && (
                  <li>
                    <a href="#top" className="flex items-center gap-2.5 text-slate-400 hover:text-white transition-colors">
                      <Gift className="h-4 w-4 shrink-0" />
                      Sorteo activo: {sorteoActivo.nombre}
                    </a>
                  </li>
                )}
              </ul>
            </div>

            {/* FILA 2 */}

            {/* QUE ES VETPANEL */}
            <div>
              <h4 className="flex items-center gap-2.5 font-semibold text-white mb-4">
                <Info className="h-4 w-4 text-emerald-500 shrink-0" />
                Sobre VetPanel
              </h4>
              <p className="text-sm text-slate-400 leading-relaxed mb-3">
                <Link href="/" className="text-emerald-500 font-semibold hover:text-emerald-400 transition-colors">VetPanel</Link>{" "}
                es la plataforma que le da a esta veterinaria su web, turnos online, historia clinica
                digital y punto de venta.
              </p>
              <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-300 hover:text-white transition-colors">
                Conoce VetPanel
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* SERVITEC */}
            <div>
              <h4 className="flex items-center gap-2.5 font-semibold text-white mb-4">
                <Code2 className="h-4 w-4 text-emerald-500 shrink-0" />
                Desarrollado por ServiTec
              </h4>
              <p className="text-sm text-slate-400 leading-relaxed mb-3">
                <span className="text-white font-semibold">SERVITEC</span> es el estudio de desarrollo
                detras de VetPanel: diseño, software y soporte tecnico a medida.
              </p>
              <a
                href="https://servitec-cdelu.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
              >
                servitec-cdelu.vercel.app
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>

          </div>
        </div>

        <div className="border-t border-slate-800/30">
          <div className="container max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} {nombre}. Pagina hecha con{" "}
              <Link href="/" className="text-emerald-500 font-semibold hover:text-emerald-400 transition-colors">VetPanel</Link>
            </p>
            <a
              href="https://servitec-cdelu.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-extralight uppercase tracking-[0.4em] text-slate-500
                         hover:text-white transition-all duration-500"
              style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
            >
              Hecho por SERVITEC
            </a>
          </div>
        </div>
      </footer>

      <DetalleDialog
        producto={productoSeleccionado}
        promocion={promocionSeleccionada}
        productosDePromos={productosDePromos}
        logo={logo}
        onOpenChange={(open) => {
          if (!open) { setProductoSeleccionado(null); setPromocionSeleccionada(null) }
        }}
      />
    </main>
  )
}
