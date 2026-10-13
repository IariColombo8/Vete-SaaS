"use client"

import { useEffect, useState, useRef, Children, type ReactNode } from "react"
import { useParams, useRouter } from "next/navigation"
import type { TenantConfig, ServicioTenant, HorarioTenant } from "@/lib/supabase/queries"
import { diaToWeekdays, formatDiasLabel } from "@/lib/turnos/horarios"
import { Button } from "@/components/ui/button"
import {
  CalendarPlus, Phone, Mail, MapPin, Clock, Stethoscope,
  ChevronLeft, ChevronRight, ArrowRight,
  Shield, Star, Home, PawPrint, UserPlus, Gift, ShoppingBag, Info, Code2, Sparkles,
} from "lucide-react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { tieneOferta } from "@/lib/productos/precios"
import { normalizePlan, PLANS } from "@/lib/plans"
import type { Producto, Promocion, Sorteo } from "@/lib/supabase/types"
import { SERVITEC } from "@/lib/marca"
import { FOTOS_DEFAULT_DESKTOP, FOTOS_DEFAULT_MOBILE } from "./fotos-default"
import {
  ANCHOS_HERO, ANCHOS_HERO_MOBILE, ANCHOS_LOGO, SIZES_LOGO_HERO, imagenSupabase, srcSetSupabase,
} from "@/lib/imagenes"
import { Paw, DogFace, CatFace, Bone, HeartPulse } from "@/components/landing/pet-art"

// Todo lo que no está en el hero se carga en chunks aparte y sin SSR: la
// vidriera, promos y sorteos recién existen cuando llega la consulta a
// Supabase (en el cliente), y los diálogos se abren con un click. Con los
// imports estáticos la página pública cargaba ~340 KB de JS comprimido antes
// de pintar (Supabase, Radix Dialog, sonner, date-fns...), y Lighthouse lo suma
// todo al LCP en móvil. Ahora el JS inicial es el del hero.
const ProductoTarjeta = dynamic(() => import("@/components/public/producto-tarjeta").then((m) => m.ProductoTarjeta), { ssr: false })
const PromocionTarjeta = dynamic(() => import("@/components/public/promocion-tarjeta").then((m) => m.PromocionTarjeta), { ssr: false })
const DetalleDialog = dynamic(() => import("@/components/public/detalle-dialog").then((m) => m.DetalleDialog), { ssr: false })
const SorteoBanner = dynamic(() => import("@/components/public/sorteo-banner").then((m) => m.SorteoBanner), { ssr: false })
const SorteoTeaser = dynamic(() => import("@/components/public/sorteo-banner").then((m) => m.SorteoTeaser), { ssr: false })
const SorteosHistorial = dynamic(() => import("@/components/public/sorteos-historial").then((m) => m.SorteosHistorial), { ssr: false })
const RegistroClienteDialog = dynamic(() => import("@/components/turnos/RegistroClienteDialog").then((m) => m.RegistroClienteDialog), { ssr: false })

/* ═══════════════════════════ DEFAULTS ═══════════════════════════ */

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
  { icon: HeartPulse, label: "Amor por los animales", desc: "Cada paciente es tratado con cariño" },
  { icon: Shield, label: "Profesionales matriculados", desc: "Equipo con experiencia comprobada" },
  { icon: Star, label: "Tecnologia moderna", desc: "Equipamiento de ultima generacion" },
]

/**
 * Tonos cálidos que se van alternando en tarjetas e íconos (mismos tokens de
 * marca que la landing: `--color-coral`, `--color-teal`, `--color-amber`).
 * Como texto solo se usan los tonos "ink", que cumplen contraste AA.
 */
const TONOS = [
  { fondo: "bg-coral-soft", texto: "text-coral", borde: "hover:border-coral/40" },
  { fondo: "bg-teal-soft", texto: "text-teal-ink", borde: "hover:border-teal/40" },
  { fondo: "bg-amber/15", texto: "text-ink", borde: "hover:border-amber/50" },
] as const

/* ═══════════════════════════ MAPA ═══════════════════════════ */

/**
 * Resuelve el `src` del iframe del mapa. En Configuración se puede pegar una
 * dirección, un link, o el código `<iframe …>` que da Google Maps: de ese
 * código se toma solo el `src`, y únicamente si apunta a Google Maps. Antes
 * el HTML pegado se insertaba tal cual en la página pública.
 */
function srcDeMapa(valor: string): string | null {
  if (!valor.includes("<iframe")) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(valor)}&output=embed`
  }
  const src = valor.match(/src=["']([^"']+)["']/i)?.[1]
  if (!src) return null
  try {
    const url = new URL(src)
    const esGoogleMaps = /(^|\.)google\.[a-z.]+$/.test(url.hostname) && url.pathname.startsWith("/maps")
    return esGoogleMaps ? url.toString() : null
  } catch {
    return null
  }
}

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

/* ═══════════════════════ HERO CAROUSEL ═══════════════════════ */

function HeroCarousel({ fotosDesktop, fotosMobile }: { fotosDesktop: string[]; fotosMobile: string[] }) {
  // Un slide por foto; si celular y escritorio tienen distinta cantidad, se
  // ciclan. Cuál se muestra lo decide el navegador con <picture>, ya en el
  // HTML del servidor: antes lo decidía JS después de hidratar, así que en el
  // celular se descargaba primero la foto de escritorio y recién después la
  // correcta, y la primera (el LCP) no se podía precargar.
  const len = Math.max(fotosDesktop.length, fotosMobile.length)
  const slides = Array.from({ length: len }, (_, i) => ({
    desktop: fotosDesktop.length ? fotosDesktop[i % fotosDesktop.length] : undefined,
    mobile: fotosMobile.length ? fotosMobile[i % fotosMobile.length] : undefined,
  }))
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (len <= 1) return
    const t = setInterval(() => setIdx(c => (c + 1) % len), 6000)
    return () => clearInterval(t)
  }, [len])

  return (
    <div className="absolute inset-0">
      {slides.map(({ desktop, mobile }, i) => {
        const principal = desktop ?? mobile
        return (
        <picture key={i} className="contents">
          {/* Fotos del bucket: srcset con variantes escaladas por Supabase; externas: tal cual. */}
          {mobile && desktop && mobile !== desktop && (
            <source
              media="(max-width: 767px)"
              srcSet={srcSetSupabase(mobile, ANCHOS_HERO_MOBILE) ?? mobile}
              sizes="100vw"
            />
          )}
          <img
            src={principal}
            srcSet={principal ? srcSetSupabase(principal, ANCHOS_HERO) : undefined}
            sizes="100vw"
            alt=""
            loading={i === 0 ? "eager" : "lazy"}
            fetchPriority={i === 0 ? "high" : "auto"}
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              opacity: i === idx ? 1 : 0,
              transition: "opacity 1.5s ease-in-out",
              // Parallax-like zoom lento en la imagen activa
              transform: i === idx ? "scale(1.05)" : "scale(1)",
            }}
          />
        </picture>
        )
      })}

      {/* Velo cálido: oscurece lo justo para leer el nombre y se funde en
          crema hacia abajo, donde arranca el resto de la página. */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink/75 via-ink/35 to-ink/60" />
      <div className="absolute inset-0 bg-gradient-to-r from-coral-ink/40 via-transparent to-teal-ink/30" />

      {/* Dots + controles */}
      {len > 1 && (
        <div className="absolute bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3">
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => setIdx(c => (c - 1 + len) % len)}
            className="h-10 w-10 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center
                       hover:bg-white/30 transition-all duration-300 hover:scale-110 border border-white/20"
          >
            <ChevronLeft className="h-5 w-5 text-white" />
          </button>
          <div className="flex gap-2">
            {slides.map((_, i) => (
              // Área táctil de 24 px (mínimo accesible); el punto visible sigue chico.
              <button
                key={i}
                type="button"
                aria-label={`Foto ${i + 1}`}
                aria-current={i === idx ? "true" : undefined}
                onClick={() => setIdx(i)}
                className="flex h-6 min-w-6 items-center justify-center"
              >
                <span
                  className={`block rounded-full transition-all duration-500 ${
                    i === idx
                      ? "w-8 h-2.5 bg-amber"
                      : "w-2.5 h-2.5 bg-white/40 hover:bg-white/70"
                  }`}
                />
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Siguiente"
            onClick={() => setIdx(c => (c + 1) % len)}
            className="h-10 w-10 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center
                       hover:bg-white/30 transition-all duration-300 hover:scale-110 border border-white/20"
          >
            <ChevronRight className="h-5 w-5 text-white" />
          </button>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════ HERO SIN FOTOS ═══════════════════════ */

/** Fondo cálido con ilustraciones cuando la veterinaria todavía no subió fotos. */
function GenerativeHero() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-coral-ink via-coral to-teal-ink">
      <div className="paw-pattern absolute inset-0 opacity-[0.08]" />
      <div
        className="warm-blob h-[560px] w-[560px] -top-40 -left-32 opacity-70"
        style={{ background: "radial-gradient(circle closest-side, rgba(255,255,255,0.22), transparent 100%)", animation: "warmFloat1 22s ease-in-out infinite alternate" }}
      />
      <div
        className="warm-blob h-[480px] w-[480px] -bottom-32 -right-24 opacity-60"
        style={{ background: "radial-gradient(circle closest-side, rgba(245,166,35,0.35), transparent 100%)", animation: "warmFloat2 26s ease-in-out infinite alternate" }}
      />
      <DogFace className="float-soft-slow absolute -left-6 bottom-10 h-44 w-44 text-white/15 sm:h-64 sm:w-64" />
      <CatFace className="float-soft absolute -right-4 top-16 h-40 w-40 text-white/15 sm:h-56 sm:w-56" />
      <Bone className="absolute left-[12%] top-[14%] h-14 w-14 text-white/20 rotate-[-18deg]" />
      <Paw className="paw-wiggle absolute right-[14%] bottom-[18%] h-20 w-20 text-white/20" />
    </div>
  )
}

/* ═══════════════════════ ONDA DIVISORIA ═══════════════════════ */

/** Borde ondulado en crema para que el hero se funda con el resto de la página. */
function Onda({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 90"
      preserveAspectRatio="none"
      aria-hidden
      className={`block w-full h-12 sm:h-20 ${className}`}
    >
      <path
        d="M0 60 C 240 100 480 10 720 40 C 960 70 1200 95 1440 50 L1440 90 L0 90 Z"
        fill="currentColor"
      />
    </svg>
  )
}

/* ═══════════════════════ SERVICE CARD ═══════════════════════ */

function ServiceCard({ s, i }: { s: ServicioTenant; i: number }) {
  const tono = TONOS[i % TONOS.length]
  return (
    <Reveal delay={i * 90} direction="up">
      <div
        className={`group relative h-full overflow-hidden rounded-3xl border border-warm-border bg-white p-6 sm:p-7
                    transition-all duration-500 hover:-translate-y-1.5 hover:rotate-[-0.6deg]
                    hover:shadow-[0_28px_50px_-28px_rgba(45,42,38,0.35)] ${tono.borde}`}
      >
        <Paw className="pointer-events-none absolute -right-4 -bottom-5 h-24 w-24 text-coral/[0.06] rotate-12 transition-transform duration-700 group-hover:rotate-[30deg]" />
        <div
          className={`mb-5 flex h-16 w-16 items-center justify-center rounded-[1.4rem] ${tono.fondo}
                      transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6`}
        >
          <span className="text-3xl" aria-hidden>{s.emoji}</span>
        </div>
        <h3 className="font-display text-xl font-semibold text-ink mb-2">{s.nombre}</h3>
        {s.descripcion && (
          <p className="text-sm text-ink-muted leading-relaxed">{s.descripcion}</p>
        )}
      </div>
    </Reveal>
  )
}

/* ═══════════════════════ FEATURE PILL ═══════════════════════ */

function FeaturePill({ icon: Icon, label, desc, i }: {
  icon: React.ComponentType<{ className?: string }>; label: string; desc: string; i: number
}) {
  const tono = TONOS[i % TONOS.length]
  return (
    <Reveal delay={150 + i * 120} direction="up">
      <div className="group flex items-start gap-4">
        <div
          className={`shrink-0 flex h-14 w-14 items-center justify-center rounded-2xl ${tono.fondo} ${tono.texto}
                      transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="font-display text-base font-semibold text-ink leading-tight">{label}</p>
          <p className="text-sm text-ink-muted mt-1">{desc}</p>
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
          className="absolute left-0 top-1/2 z-10 flex h-11 w-11 -translate-x-4 -translate-y-1/2 items-center justify-center
                     rounded-full bg-white shadow-lg ring-1 ring-warm-border transition-transform duration-300
                     hover:scale-110 hover:bg-coral-soft"
        >
          <ChevronLeft className="h-5 w-5 text-coral" />
        </button>

        <div
          ref={scrollRef}
          className="grid grid-flow-col grid-rows-2 auto-cols-[calc(25%-9px)] gap-4 snap-x snap-mandatory
                     overflow-x-auto scroll-smooth pb-2 lg:auto-cols-[calc(33.333%-11px)]
                     [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((child, i) => (
            <div key={i} className="snap-start">
              {child}
            </div>
          ))}
        </div>

        <button
          type="button"
          aria-label="Siguiente"
          onClick={() => desplazar(1)}
          className="absolute right-0 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 translate-x-4 items-center justify-center
                     rounded-full bg-white shadow-lg ring-1 ring-warm-border transition-transform duration-300
                     hover:scale-110 hover:bg-coral-soft"
        >
          <ChevronRight className="h-5 w-5 text-coral" />
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════ MAIN PAGE ═══════════════════════ */

export default function VetPublicPage({ configInicial }: { configInicial: TenantConfig | null }) {
  const params = useParams()
  const slug = params.slug as string
  const router = useRouter()
  // La config llega del servidor (`page.tsx` ya la leyó para el SEO): el hero
  // sale en el HTML inicial en vez de esperar un spinner + fetch en el cliente.
  const config = configInicial
  const exists = config !== null
  const [productos, setProductos] = useState<Producto[]>([])
  const [promociones, setPromociones] = useState<Promocion[]>([])
  const [productosDePromos, setProductosDePromos] = useState<Record<string, Producto>>({})
  const [productoSeleccionado, setProductoSeleccionado] = useState<Producto | null>(null)
  const [promocionSeleccionada, setPromocionSeleccionada] = useState<Promocion | null>(null)
  const [sorteoActivo, setSorteoActivo] = useState<Sorteo | null>(null)
  const [sorteosFinalizados, setSorteosFinalizados] = useState<Sorteo[]>([])
  // El botón "Registrarme como cliente" sale en el HTML; el diálogo (formulario,
  // Supabase, Radix) se descarga recién al primer click.
  const [registroAbierto, setRegistroAbierto] = useState(false)

  // Vidriera, promos y sorteos van debajo del pliegue: se cargan en el cliente
  // sin frenar el hero. Si la veterinaria no existe, no hay nada que pedir.
  useEffect(() => {
    if (!exists) return
    let vigente = true
    // El cliente de Supabase (~65 KB) se importa recién acá, fuera del JS inicial.
    Promise.all([
      import("@/lib/supabase/productos"),
      import("@/lib/supabase/promociones"),
      import("@/lib/supabase/sorteos"),
    ])
      .then(async ([productos, promociones, sorteos]) => {
        const [prods, promos, sorteo, historial] = await Promise.all([
          productos.getProductosPublicados(slug), promociones.getPromocionesPublicadas(slug),
          sorteos.getSorteoActivo(slug), sorteos.getSorteosFinalizadosPublicados(slug),
        ])
        if (!vigente) return
        setProductos(prods)
        setPromociones(promos)
        setSorteoActivo(sorteo)
        setSorteosFinalizados(historial)

        const ids = Array.from(new Set(promos.flatMap((p) => p.items.map((i) => i.productoId))))
        const productosPromo = await productos.getProductosPublicadosPorIds(slug, ids)
        if (vigente) setProductosDePromos(Object.fromEntries(productosPromo.map((p) => [p.id, p])))
      })
      .catch((error) => console.error("[vet-public] No se pudo cargar la vidriera:", error))
    return () => {
      vigente = false
    }
  }, [slug, exists])

  /* ── 404 ── */
  if (!exists) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-cream px-4">
        <div className="w-24 h-24 rounded-full bg-coral-soft flex items-center justify-center">
          <Stethoscope className="h-10 w-10 text-coral" />
        </div>
        <div className="text-center">
          <p className="font-display text-ink font-semibold text-2xl mb-1">Veterinaria no encontrada</p>
          <p className="text-ink-muted text-sm">El enlace puede estar incorrecto o la veterinaria ya no existe.</p>
        </div>
        <Button variant="outline" onClick={() => router.push("/")} className="rounded-full border-warm-border text-ink hover:bg-white">
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
  const srcMapa     = googleMapsUrl ? srcDeMapa(googleMapsUrl) : null
  const muestraMapa = (modalidad === "local" || modalidad === "ambos") && !!srcMapa
  const tieneFeatureProductos = PLANS[normalizePlan(config?.plan)].features.productos
  const muestraProductos = tieneFeatureProductos && productos.length > 0
  const tieneFeaturePromos = PLANS[normalizePlan(config?.plan)].features.promosSorteos
  const muestraPromociones = tieneFeaturePromos && promociones.length > 0
  // Prioridad en la vidriera: ofertas primero, después los que tienen foto,
  // el resto al final.
  const productosOrdenados = [...productos].sort((a, b) => {
    const oferta = Number(tieneOferta(b)) - Number(tieneOferta(a))
    if (oferta !== 0) return oferta
    return Number(!!b.imagenUrl) - Number(!!a.imagenUrl)
  })
  // La promo destacada del home: si hay varias, se prioriza la que tiene foto.
  const promocionDestacada = [...promociones].sort(
    (a, b) => Number(!!b.imagenUrl) - Number(!!a.imagenUrl),
  )[0]
  const atiendeDomicilio = modalidad === "domicilio" || modalidad === "ambos"
  const atiendeLocal = modalidad === "local" || modalidad === "ambos"

  return (
    <main className="min-h-screen bg-cream overflow-x-hidden text-ink">

      {/* ╔══════════════════════════════════════════════════╗
          ║                     HERO                        ║
          ╚══════════════════════════════════════════════════╝ */}
      <section id="top" className="relative h-[100svh] sm:h-auto sm:min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background */}
        {hayFotos ? <HeroCarousel fotosDesktop={fotosDesktop} fotosMobile={fotosMobile} /> : <GenerativeHero />}

        {/* Patitas flotando por encima de la foto */}
        <Paw className="paw-wiggle pointer-events-none absolute left-4 top-24 h-12 w-12 text-white/20 sm:left-10 sm:top-28 sm:h-20 sm:w-20" />
        <Paw className="float-soft pointer-events-none absolute right-6 top-40 h-8 w-8 text-amber/40 sm:right-16 sm:h-12 sm:w-12" />
        <Bone className="float-soft-slow pointer-events-none absolute left-[8%] bottom-[22%] hidden h-12 w-12 text-white/20 rotate-12 sm:block" />

        {/* Contenido central */}
        <div
          className="vet-hero-in relative z-10 container max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-32 flex flex-col items-center justify-center text-center h-full sm:h-auto"
        >
          {/* Logo */}
          {logo && (
            <div
              className="vet-hero-in mb-3 sm:mb-8"
              style={{ animationDelay: "0.1s" }}
            >
              {/* En celular el logo suele ser el LCP: prioridad alta y precarga desde page.tsx. */}
              <img
                src={imagenSupabase(logo, 384)}
                srcSet={srcSetSupabase(logo, ANCHOS_LOGO)}
                sizes={SIZES_LOGO_HERO}
                alt={`Logo de ${nombre}`}
                fetchPriority="high"
                decoding="async"
                className="w-16 h-16 sm:w-48 sm:h-48 rounded-2xl sm:rounded-[2rem] shadow-2xl shadow-black/40 ring-4 ring-white/30 object-cover rotate-[-2deg]"
              />
            </div>
          )}

          {/* Badge */}
          <div
            className="vet-hero-in inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 backdrop-blur-xl px-3 py-1 sm:px-5 sm:py-2 mb-2 sm:mb-8"
            style={{ animationDelay: "0.1s" }}
          >
            <Paw className="h-3.5 w-3.5 text-amber" />
            <span className="text-[10px] sm:text-xs font-bold text-white tracking-[0.15em] uppercase">
              Veterinaria
            </span>
          </div>

          {/* Nombre ENORME */}
          <h1
            // El nombre es el LCP: demora mínima, así el navegador lo pinta enseguida.
            className="vet-hero-in font-display text-4xl sm:text-7xl md:text-8xl lg:text-9xl font-semibold text-white leading-[0.95] mb-2 sm:mb-6 tracking-tight"
            style={{ animationDelay: "0.15s", textShadow: "0 4px 60px rgba(0,0,0,0.5)" }}
          >
            {nombre}
          </h1>

          {/* Slogan */}
          <p
            className="vet-hero-in text-base sm:text-2xl md:text-3xl text-white/90 font-light mb-1.5 sm:mb-4 max-w-2xl leading-snug px-2"
            style={{ animationDelay: "0.3s" }}
          >
            {slogan}
          </p>

          {/* Descripción */}
          <p
            className="vet-hero-in hidden sm:block text-base sm:text-lg text-white/70 mb-12 max-w-lg"
            style={{ animationDelay: "0.45s" }}
          >
            {descripcion}
          </p>

          {/* CTAs */}
          <div
            className="vet-hero-in flex flex-col sm:flex-row items-center gap-2 sm:gap-4 mt-4 sm:mt-0 w-full sm:w-auto px-4 sm:px-0"
            style={{ animationDelay: "0.55s" }}
          >
            <Button
              size="lg"
              className="w-full sm:w-auto bg-coral hover:bg-coral-ink text-white font-bold text-sm sm:text-lg h-11 sm:h-14 px-6 sm:px-10 rounded-full
                         shadow-2xl shadow-coral/40 border-0
                         transition-all duration-300 hover:scale-105"
              onClick={() => router.push(`/${slug}/turno`)}
            >
              <CalendarPlus className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
              Sacar turno
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto bg-white/15 hover:bg-white/25 text-white border-2 border-white/40 font-bold text-sm sm:text-lg h-11 sm:h-14 px-6 sm:px-10 rounded-full
                         backdrop-blur-md transition-all duration-300 hover:scale-105"
              onClick={() => setRegistroAbierto(true)}
            >
              <UserPlus className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
              Registrarme como cliente
            </Button>
            {registroAbierto && (
              <RegistroClienteDialog
                tenantId={slug}
                trigger={null}
                open={registroAbierto}
                onOpenChange={setRegistroAbierto}
              />
            )}

            <Button
              variant="ghost"
              size="lg"
              className="w-full sm:w-auto text-white/90 hover:text-white hover:bg-white/15 font-semibold text-sm sm:text-lg h-11 sm:h-14 px-6 sm:px-10 rounded-full"
              onClick={() => router.push(`/${slug}/mi-historia`)}
            >
              <PawPrint className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
              Historia clínica de mi mascota
            </Button>
          </div>
        </div>

        {/* Onda crema que funde el hero con la página */}
        <Onda className="absolute bottom-0 left-0 z-20 text-cream" />
      </section>

      {/* ╔══════════════════════════════════════════════════╗
          ║          SORTEO: cartelito que lleva abajo        ║
          ╚══════════════════════════════════════════════════╝ */}
      {sorteoActivo && <SorteoTeaser tenantId={slug} sorteo={sorteoActivo} />}

      {/* ╔══════════════════════════════════════════════════╗
          ║               FEATURES STRIP                     ║
          ╚══════════════════════════════════════════════════╝ */}
      <section className="relative bg-cream pt-6 pb-14 sm:pt-10 sm:pb-20">
        <div className="container max-w-6xl mx-auto px-6">
          <div className="relative rounded-[2rem] border border-warm-border bg-white p-6 sm:p-10 shadow-[0_30px_60px_-40px_rgba(45,42,38,0.35)]">
            <Paw className="pointer-events-none absolute -top-5 right-8 h-12 w-12 text-coral/15 rotate-12" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              {FEATURES.map((f, i) => (
                <FeaturePill key={f.label} {...f} i={i} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ╔══════════════════════════════════════════════════╗
          ║                  SERVICIOS                       ║
          ╚══════════════════════════════════════════════════╝ */}
      <section className="relative overflow-hidden bg-white py-20 sm:py-28">
        <div className="paw-pattern pointer-events-none absolute inset-0 opacity-[0.035]" />
        <CatFace className="pointer-events-none absolute -right-10 top-10 hidden h-56 w-56 text-teal/10 lg:block" />
        <DogFace className="pointer-events-none absolute -left-12 bottom-6 hidden h-60 w-60 text-coral/10 lg:block" />

        <div className="container max-w-6xl mx-auto px-6 relative">
          <Reveal>
            <div className="text-center mb-14">
              <div className="inline-flex items-center gap-2 rounded-full bg-coral-soft px-4 py-1.5 mb-5">
                <Paw className="h-3.5 w-3.5 text-coral" />
                <span className="text-xs font-bold text-coral uppercase tracking-[0.15em]">
                  Servicios
                </span>
              </div>
              <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold text-ink tracking-tight mb-4">
                Todo lo que tu mascota<br />
                <span className="relative inline-block text-coral">
                  necesita
                  <svg className="absolute -bottom-1 left-0 w-full text-amber/70" viewBox="0 0 320 14" fill="none" aria-hidden>
                    <path d="M3 9C90 3 230 3 317 7" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                </span>
              </h2>
              <p className="text-ink-muted max-w-md mx-auto">
                Ofrecemos una amplia gama de servicios para mantener a tu compañero sano y feliz.
              </p>
            </div>
          </Reveal>

          <div className="flex flex-wrap justify-center gap-5 sm:gap-6">
            {servicios.map((s, i) => (
              <div key={i} className="w-full sm:w-[calc(50%-12px)] lg:w-[calc(25%-18px)]">
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
        <section className="relative overflow-hidden bg-cream-deep py-20 sm:py-28">
          <Bone className="pointer-events-none absolute right-[6%] top-10 h-16 w-16 text-amber/30 rotate-12" />
          <Paw className="pointer-events-none absolute left-[4%] bottom-12 h-24 w-24 text-coral/[0.07] -rotate-12" />
          <div className="container max-w-6xl mx-auto px-6 relative">
            <Reveal>
              <div className="text-center mb-14">
                <div className="inline-flex items-center gap-2 rounded-full bg-amber/20 px-4 py-1.5 mb-5">
                  <Sparkles className="h-3.5 w-3.5 text-ink" />
                  <span className="text-xs font-bold text-ink uppercase tracking-[0.15em]">
                    Vidriera
                  </span>
                </div>
                <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold text-ink tracking-tight mb-4">
                  Mimos y cosas ricas<br />
                  <span className="text-coral">para llevar a casa</span>
                </h2>
              </div>
            </Reveal>

            <VidrieraCarrusel>
              {muestraPromociones && promocionDestacada && (
                <PromocionTarjeta
                  promocion={promocionDestacada} productos={productosDePromos} logo={logo}
                  onClick={() => setPromocionSeleccionada(promocionDestacada)}
                />
              )}
              {muestraProductos && productosOrdenados.slice(0, 11).map((p) => (
                <ProductoTarjeta key={p.id} producto={p} logo={logo} onClick={() => setProductoSeleccionado(p)} />
              ))}
            </VidrieraCarrusel>

            <div className="flex justify-center">
              <Button
                size="lg"
                className="rounded-full font-bold bg-coral hover:bg-coral-ink text-white shadow-lg shadow-coral/25 h-12 px-8"
                onClick={() => router.push(`/${slug}/productos`)}
              >
                <ShoppingBag className="mr-2 h-4 w-4" />
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
      <section className="relative bg-cream py-16 sm:py-24">
        <div className="container max-w-6xl mx-auto px-6">
          <Reveal>
            <div className="text-center mb-10 sm:mb-14">
              <div className="inline-flex items-center gap-2 rounded-full bg-teal-soft px-4 py-1.5 mb-5">
                <Clock className="h-3.5 w-3.5 text-teal-ink" />
                <span className="text-xs font-bold text-teal-ink uppercase tracking-[0.15em]">
                  Te esperamos
                </span>
              </div>
              <h2 className="font-display text-4xl sm:text-5xl font-semibold text-ink tracking-tight">
                Horarios y cómo llegar
              </h2>
            </div>
          </Reveal>

          <div className="grid lg:grid-cols-2 gap-6 items-stretch">

            {/* ── IZQUIERDA: Contacto y Horarios en una sola tarjeta ── */}
            <Reveal>
              <div className="relative h-full overflow-hidden rounded-[2rem] border border-warm-border bg-white shadow-[0_30px_60px_-40px_rgba(45,42,38,0.35)]">
                <Paw className="pointer-events-none absolute -right-6 -bottom-8 h-32 w-32 text-coral/[0.06] rotate-12" />
                <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-warm-border h-full">

                  {/* CONTACTO */}
                  <div className="p-6 sm:p-7 flex flex-col">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="shrink-0 w-11 h-11 rounded-2xl bg-coral-soft flex items-center justify-center">
                        <MapPin className="h-5 w-5 text-coral" />
                      </div>
                      <h3 className="font-display text-lg font-semibold text-ink">Contacto</h3>
                    </div>

                    {atiendeDomicilio && (
                      <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-teal-soft px-3 py-1 text-[11px] font-semibold text-teal-ink mb-4">
                        <Home className="h-3 w-3" />
                        {modalidad === "domicilio" ? "Atendemos a domicilio" : "Local y domicilio"}
                      </span>
                    )}

                    <div className="space-y-3 flex-1">
                      {atiendeLocal && direccion && (
                        <div className="text-sm">
                          <p className="font-semibold text-ink">{direccion}</p>
                          {ciudad && <p className="text-ink-muted text-xs mt-0.5">{ciudad}</p>}
                        </div>
                      )}
                      {telefono && (
                        <a href={`tel:${telefono}`} className="flex items-center gap-2 text-sm font-semibold text-ink hover:text-coral transition-colors">
                          <Phone className="h-4 w-4 text-coral" />
                          {telefono}
                        </a>
                      )}
                      {email && (
                        <a href={`mailto:${email}`} className="flex items-center gap-2 text-sm font-semibold text-ink hover:text-coral transition-colors break-all">
                          <Mail className="h-4 w-4 text-coral" />
                          {email}
                        </a>
                      )}
                      {!(direccion || email || telefono || atiendeDomicilio) && (
                        <p className="text-ink-muted italic text-xs">Datos de contacto no configurados aun.</p>
                      )}
                    </div>

                    <Button
                      className="mt-6 w-full bg-coral hover:bg-coral-ink text-white
                                 font-bold h-11 rounded-full text-sm border-0 shadow-lg shadow-coral/25"
                      onClick={() => router.push(`/${slug}/turno`)}
                    >
                      <CalendarPlus className="mr-2 h-4 w-4" />
                      Reservar turno
                    </Button>
                  </div>

                  {/* HORARIOS */}
                  <div className="p-6 sm:p-7">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="shrink-0 w-11 h-11 rounded-2xl bg-teal-soft flex items-center justify-center">
                        <Clock className="h-5 w-5 text-teal-ink" />
                      </div>
                      <h3 className="font-display text-lg font-semibold text-ink">Horarios</h3>
                    </div>
                    <div className="space-y-2.5">
                      {horarios.map((h, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium text-ink min-w-0">
                            {formatDiasLabel(diaToWeekdays(h.dia)) || h.dia}
                            {h.nombre && <span className="text-ink-muted"> ({h.nombre})</span>}
                          </span>
                          {h.cerrado ? (
                            <span className="shrink-0 whitespace-nowrap rounded-full bg-cream px-2.5 py-0.5 text-[11px] font-semibold text-ink-muted">Cerrado</span>
                          ) : (
                            <span className="shrink-0 whitespace-nowrap rounded-full bg-teal-soft px-2.5 py-0.5 font-mono text-xs font-semibold text-teal-ink">
                              {h.apertura} – {h.cierre}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            </Reveal>

            {/* ── DERECHA: Mapa o placeholder ── */}
            <Reveal delay={200} direction="right">
              <div className="h-full min-h-[280px]">
                {muestraMapa && srcMapa ? (
                  <div className="h-full min-h-[280px] overflow-hidden rounded-[2rem] border-4 border-white shadow-[0_30px_60px_-40px_rgba(45,42,38,0.35)] ring-1 ring-warm-border">
                    <iframe
                      src={srcMapa}
                      className="w-full h-full border-0"
                      loading="lazy"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                      title={`Ubicación de ${nombre} en Google Maps`}
                    />
                  </div>
                ) : (
                  <div className="relative h-full min-h-[280px] overflow-hidden rounded-[2rem] border border-warm-border bg-white
                                  flex flex-col items-center justify-center gap-3 p-8 text-center">
                    <div className="paw-pattern pointer-events-none absolute inset-0 opacity-[0.05]" />
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-coral-soft">
                      {modalidad === "domicilio"
                        ? <Home className="h-9 w-9 text-coral" />
                        : <DogFace className="h-12 w-12 text-coral" />}
                    </div>
                    <p className="relative font-display text-lg font-semibold text-ink">
                      {modalidad === "domicilio" ? "Vamos hasta tu casa" : "Pronto, el mapa"}
                    </p>
                    <p className="relative text-ink-muted text-sm max-w-xs">
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
      <footer className="relative overflow-hidden bg-ink text-white">
        <div className="paw-pattern pointer-events-none absolute inset-0 opacity-[0.05]" />
        <Onda className="relative text-cream rotate-180" />
        <div className="container max-w-6xl mx-auto px-6 py-10 relative">
          <div className="flex items-center gap-3 mb-2">
            {logo ? (
              <img src={imagenSupabase(logo, 80)} alt="" className="w-10 h-10 rounded-xl object-cover ring-2 ring-white/15" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-coral flex items-center justify-center shrink-0">
                <Paw className="h-5 w-5 text-white" />
              </div>
            )}
            <span className="font-display font-semibold text-white text-xl">{nombre}</span>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-8">

            {/* FILA 1 */}

            {/* CONTACTO */}
            <div>
              <h4 className="flex items-center gap-2.5 font-semibold text-white mb-4">
                <MapPin className="h-4 w-4 text-amber shrink-0" />
                Contacto y ubicacion
              </h4>
              <p className="text-sm text-white/70 leading-relaxed mb-4">{descripcion}</p>
              <div className="space-y-2.5 text-sm">
                {direccion && (
                  <div className="flex items-start gap-2.5 text-white/70">
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-amber" />
                    <span>{direccion}{ciudad ? `, ${ciudad}` : ""}</span>
                  </div>
                )}
                {telefono && (
                  <a href={`tel:${telefono}`} className="flex items-center gap-2.5 text-white/70 hover:text-white transition-colors">
                    <Phone className="h-4 w-4 shrink-0 text-amber" />
                    {telefono}
                  </a>
                )}
                {email && (
                  <a href={`mailto:${email}`} className="flex items-center gap-2.5 text-white/70 hover:text-white transition-colors break-all">
                    <Mail className="h-4 w-4 shrink-0 text-amber" />
                    {email}
                  </a>
                )}
              </div>
            </div>

            {/* PARA CLIENTES */}
            <div>
              <h4 className="flex items-center gap-2.5 font-semibold text-white mb-4">
                <PawPrint className="h-4 w-4 text-amber shrink-0" />
                Para clientes
              </h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <Link href={`/${slug}/turno`} className="flex items-center gap-2.5 text-white/70 hover:text-white transition-colors">
                    <CalendarPlus className="h-4 w-4 shrink-0" />
                    Sacar turno
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setRegistroAbierto(true)}
                    className="flex items-center gap-2.5 text-white/70 hover:text-white transition-colors"
                  >
                    <UserPlus className="h-4 w-4 shrink-0" />
                    Registrarme como cliente
                  </button>
                </li>
                <li>
                  <Link href={`/${slug}/mi-historia`} className="flex items-center gap-2.5 text-white/70 hover:text-white transition-colors">
                    <PawPrint className="h-4 w-4 shrink-0" />
                    Historia clinica de mi mascota
                  </Link>
                </li>
                <li>
                  <Link href={`/${slug}/productos`} className="flex items-center gap-2.5 text-white/70 hover:text-white transition-colors">
                    <ShoppingBag className="h-4 w-4 shrink-0" />
                    Productos
                  </Link>
                </li>
                {sorteoActivo && (
                  <li>
                    <a href="#top" className="flex items-center gap-2.5 text-white/70 hover:text-white transition-colors">
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
                <Info className="h-4 w-4 text-amber shrink-0" />
                Sobre VetPanel
              </h4>
              <p className="text-sm text-white/70 leading-relaxed mb-3">
                <Link href="/" className="text-amber font-semibold hover:text-white transition-colors">VetPanel</Link>{" "}
                es la plataforma que le da a esta veterinaria su web, turnos online, historia clinica
                digital y punto de venta.
              </p>
              <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/85 hover:text-white transition-colors">
                Conoce VetPanel
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* SERVITEC */}
            <div>
              <h4 className="flex items-center gap-2.5 font-semibold text-white mb-4">
                <Code2 className="h-4 w-4 text-amber shrink-0" />
                Desarrollado por ServiTec
              </h4>
              <p className="text-sm text-white/70 leading-relaxed mb-3">
                <span className="text-white font-semibold">SERVITEC</span> es el estudio de desarrollo
                detras de VetPanel: diseño, software y soporte tecnico a medida.
              </p>
              <a
                href={SERVITEC.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/85 hover:text-white transition-colors"
              >
                {SERVITEC.dominio}
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>

          </div>
        </div>

        <div className="relative border-t border-white/10">
          <div className="container max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <p className="text-xs text-white/70">
              © {new Date().getFullYear()} {nombre}. Pagina hecha con{" "}
              <Link href="/" className="text-amber font-semibold hover:text-white transition-colors">VetPanel</Link>
              {" "}🐾
            </p>
            <a
              href={SERVITEC.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-extralight uppercase tracking-[0.4em] text-white/70
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
