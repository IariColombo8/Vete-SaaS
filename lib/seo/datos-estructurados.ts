import { FAQS } from "@/lib/landing/faqs"
import { SERVITEC } from "@/lib/marca"
import { PLAN_RECOMENDADO, TRIAL_DIAS, getPlanList, type PlanDefinition } from "@/lib/plans"
import { APP_URL, SITIO } from "./sitio"

/**
 * Datos estructurados (schema.org, JSON-LD) de la landing: le dicen a Google
 * qué es VetPanel, quién lo hace, cuánto cuesta y qué preguntas responde.
 *
 * A propósito NO incluye `aggregateRating` ni reseñas: Google exige que salgan
 * de opiniones reales y verificables, y publicarlas sin eso puede costar una
 * penalización manual.
 *
 * Los precios salen del catálogo de planes (tabla `planes`), el mismo que ven
 * la landing, /pricing y el panel: no pueden desincronizarse. Las páginas lo
 * cargan antes con `cargarPlanesServidor` y lo pasan.
 */

function organizacion() {
  return {
    "@type": "Organization",
    "@id": `${APP_URL}/#organizacion`,
    name: SITIO.nombre,
    url: APP_URL,
    logo: `${APP_URL}/logo.png`,
    parentOrganization: {
      "@type": "Organization",
      name: SERVITEC.nombre,
      url: SERVITEC.url,
      sameAs: [SERVITEC.mapsUrl],
    },
  }
}

/** Una `Offer` por plan, con precio mensual en ARS y la prueba gratis. */
export function ofertasPlanes(planes: PlanDefinition[] = getPlanList()): Record<string, unknown>[] {
  return planes.map((plan) => ({
    "@type": "Offer",
    name: `Plan ${plan.nombre}`,
    description: plan.highlights.join(". "),
    price: plan.precioMensual.toFixed(2),
    priceCurrency: "ARS",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: plan.precioMensual.toFixed(2),
      priceCurrency: "ARS",
      billingIncrement: 1,
      unitCode: "MON",
      referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" },
    },
    availability: "https://schema.org/InStock",
    url: `${APP_URL}/pricing`,
    eligibleCustomerType: "https://schema.org/Business",
    // schema.org no tiene campo de "prueba gratis": va en la descripción.
    ...(plan.id === PLAN_RECOMENDADO ? { description: `${TRIAL_DIAS} días de prueba gratis sin tarjeta. ${plan.highlights.join(". ")}` } : {}),
  }))
}

export function aplicacion(planes?: PlanDefinition[]): Record<string, unknown> {
  return {
    "@type": "SoftwareApplication",
    "@id": `${APP_URL}/#aplicacion`,
    name: SITIO.nombre,
    description: SITIO.descripcion,
    url: APP_URL,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Software de gestión veterinaria",
    operatingSystem: "Web",
    inLanguage: "es-AR",
    image: `${APP_URL}${SITIO.imagen}`,
    publisher: { "@id": `${APP_URL}/#organizacion` },
    featureList: [
      "Turnos online con página propia",
      "Historia clínica digital",
      "Libreta sanitaria con QR",
      "Recordatorios de vacunas por email",
      "Punto de venta, stock y caja",
      "Factura electrónica (ARCA)",
      "Cobro con Mercado Pago Point",
    ],
    offers: ofertasPlanes(planes),
  }
}

export function datosEstructuradosLanding(planes?: PlanDefinition[]): Record<string, unknown> {
  const org = organizacion()

  const sitioWeb = {
    "@type": "WebSite",
    "@id": `${APP_URL}/#sitio`,
    url: APP_URL,
    name: SITIO.nombre,
    inLanguage: "es-AR",
    publisher: { "@id": org["@id"] },
  }

  const preguntas = {
    "@type": "FAQPage",
    "@id": `${APP_URL}/#preguntas`,
    mainEntity: FAQS.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  }

  return { "@context": "https://schema.org", "@graph": [org, sitioWeb, aplicacion(planes), preguntas] }
}

/** JSON-LD de /pricing: la aplicación con sus ofertas y las FAQ de precios. */
export function datosEstructuradosPricing(
  faqs: { q: string; a: string }[],
  planes?: PlanDefinition[],
): Record<string, unknown> {
  const preguntas = {
    "@type": "FAQPage",
    "@id": `${APP_URL}/pricing#preguntas`,
    mainEntity: faqs.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  }
  const pagina = {
    "@type": "WebPage",
    "@id": `${APP_URL}/pricing`,
    url: `${APP_URL}/pricing`,
    name: "Precios y planes — VetPanel",
    inLanguage: "es-AR",
    isPartOf: { "@id": `${APP_URL}/#sitio` },
    about: { "@id": `${APP_URL}/#aplicacion` },
  }
  return { "@context": "https://schema.org", "@graph": [organizacion(), pagina, aplicacion(planes), preguntas] }
}

/**
 * Serializa para un <script type="application/ld+json">. Escapa `<` para que un
 * texto con "</script>" no pueda cerrar la etiqueta e inyectar HTML.
 */
export function serializarJsonLd(datos: Record<string, unknown>): string {
  return JSON.stringify(datos).replace(/</g, "\\u003c")
}
