import dynamic from "next/dynamic"
import { Hero } from "@/components/landing/hero"
import { TrustMarquee } from "@/components/landing/trust-marquee"
import { ProblemSolution } from "@/components/landing/problem-solution"
import { FeaturesBento } from "@/components/landing/features-bento"
import { Testimonials } from "@/components/landing/testimonials"
import { SaasFooter } from "@/components/landing/footer"

// Secciones interactivas below-the-fold: SSR (ssr:true por defecto, contenido en
// el HTML) pero con su JS en chunks separados, para no bloquear la hidratación
// del hero y mejorar el LCP en mobile.
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

export default function SaasLandingPage() {
  return (
    <main className="bg-cream">
      <Hero />
      <TrustMarquee />
      <ProblemSolution />
      <ProductScrolly />
      <Stats />
      <FeaturesBento />
      <Testimonials />
      <PricingSection />
      <Faq />
      <FinalCta />
      <SaasFooter />
    </main>
  )
}
