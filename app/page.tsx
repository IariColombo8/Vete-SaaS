import type { Metadata } from "next"
import dynamic from "next/dynamic"
import { Hero } from "@/components/landing/hero"
import { TrustMarquee } from "@/components/landing/trust-marquee"
import { ProblemSolution } from "@/components/landing/problem-solution"
import { FeaturesBento } from "@/components/landing/features-bento"
import { Comercio } from "@/components/landing/comercio"
import { Testimonials } from "@/components/landing/testimonials"
import { SaasFooter } from "@/components/landing/footer"
import { SITIO } from "@/lib/seo/sitio"
import { datosEstructuradosLanding, serializarJsonLd } from "@/lib/seo/datos-estructurados"
import { cargarPlanesServidor } from "@/lib/planes-servidor"

export const metadata: Metadata = {
  title: { absolute: SITIO.titulo },
  description: SITIO.descripcion,
  keywords: [
    "software para veterinarias",
    "sistema de gestión veterinaria",
    "turnos online veterinaria",
    "historia clínica veterinaria digital",
    "libreta sanitaria digital",
    "factura electrónica ARCA veterinaria",
    "sistema de stock y caja para veterinaria",
    "programa para veterinaria Argentina",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: "/",
    siteName: SITIO.nombre,
    title: SITIO.titulo,
    description: SITIO.descripcion,
    images: [{ url: SITIO.imagen, width: 1200, height: 630, alt: "VetPanel — software de gestión para veterinarias" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITIO.titulo,
    description: SITIO.descripcion,
    images: [SITIO.imagen],
  },
}

// Secciones interactivas below-the-fold: SSR (ssr:true por defecto, contenido en
// el HTML) pero con su JS en chunks separados, para no bloquear la hidratación
// del hero y mejorar el LCP en mobile. Son las únicas que usan Motion: así la
// librería (~35 KB) no entra en el JS inicial. Las secciones estáticas animan
// con `reveal.tsx` (CSS + IntersectionObserver).
const ProductScrolly = dynamic(() =>
  import("@/components/landing/product-scrolly").then((m) => m.ProductScrolly),
)
const Stats = dynamic(() => import("@/components/landing/stats").then((m) => m.Stats))
const PricingSection = dynamic(() =>
  import("@/components/landing/pricing-section").then((m) => m.PricingSection),
)
const Faq = dynamic(() => import("@/components/landing/faq").then((m) => m.Faq))
const FinalCta = dynamic(() =>
  import("@/components/landing/final-cta").then((m) => m.FinalCta),
)

// Los precios salen de la tabla `planes` (editable desde el superadmin): la
// landing se regenera cada 5 minutos.
export const revalidate = 300

export default async function SaasLandingPage() {
  const planes = (await cargarPlanesServidor()).filter((p) => p.visible)

  return (
    <main className="bg-cream">
      <script
        type="application/ld+json"
        // Generado en el servidor desde datos propios, escapado en serializarJsonLd.
        dangerouslySetInnerHTML={{ __html: serializarJsonLd(datosEstructuradosLanding(planes)) }}
      />
      <Hero />
      <TrustMarquee />
      <ProblemSolution />
      <ProductScrolly />
      <Stats />
      <FeaturesBento />
      <Comercio />
      <Testimonials />
      <PricingSection planes={planes} />
      <Faq />
      <FinalCta />
      <SaasFooter />
    </main>
  )
}
