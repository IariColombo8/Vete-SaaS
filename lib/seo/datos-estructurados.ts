import { FAQS } from "@/lib/landing/faqs"
import { SERVITEC } from "@/lib/marca"
import { APP_URL, SITIO } from "./sitio"

/**
 * Datos estructurados (schema.org, JSON-LD) de la landing: le dicen a Google
 * qué es VetPanel, quién lo hace y qué preguntas responde.
 *
 * A propósito NO incluye `aggregateRating` ni reseñas: Google exige que salgan
 * de opiniones reales y verificables, y publicarlas sin eso puede costar una
 * penalización manual. Tampoco los precios de Plus y Pro, que todavía no están
 * publicados en la landing (la sección de precios está comentada en app/page.tsx).
 */
export function datosEstructuradosLanding(): Record<string, unknown> {
  const organizacion = {
    "@type": "Organization",
    "@id": `${APP_URL}/#organizacion`,
    name: SITIO.nombre,
    url: APP_URL,
    logo: `${APP_URL}/logo.png`,
    parentOrganization: {
      "@type": "Organization",
      name: SERVITEC.nombre,
      url: SERVITEC.url,
    },
  }

  const sitioWeb = {
    "@type": "WebSite",
    "@id": `${APP_URL}/#sitio`,
    url: APP_URL,
    name: SITIO.nombre,
    inLanguage: "es-AR",
    publisher: { "@id": organizacion["@id"] },
  }

  const aplicacion = {
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
    publisher: { "@id": organizacion["@id"] },
    featureList: [
      "Turnos online con página propia",
      "Historia clínica digital",
      "Libreta sanitaria con QR",
      "Recordatorios de vacunas por WhatsApp",
      "Punto de venta, stock y caja",
    ],
    // Solo el plan gratuito, que la landing sí menciona (FAQ).
    offers: {
      "@type": "Offer",
      name: "Plan Básico",
      price: "0",
      priceCurrency: "ARS",
      url: `${APP_URL}/registro`,
    },
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

  return { "@context": "https://schema.org", "@graph": [organizacion, sitioWeb, aplicacion, preguntas] }
}

/**
 * Serializa para un <script type="application/ld+json">. Escapa `<` para que un
 * texto con "</script>" no pueda cerrar la etiqueta e inyectar HTML.
 */
export function serializarJsonLd(datos: Record<string, unknown>): string {
  return JSON.stringify(datos).replace(/</g, "\\u003c")
}
