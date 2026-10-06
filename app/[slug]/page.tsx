import type { Metadata } from "next"
import { cache } from "react"
import { getTenantConfig } from "@/lib/supabase/queries"
import { serializarJsonLd } from "@/lib/seo/datos-estructurados"
import { datosEstructuradosVeterinaria } from "@/lib/seo/veterinaria"
import { APP_URL as BASE_URL } from "@/lib/seo/sitio"
import VetPublicView from "./vet-public-view"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.vetpanel.com.ar"

// Metadata y página leen la misma config: `cache` evita la segunda query por request.
const leerConfig = cache((slug: string) => getTenantConfig(slug).catch(() => null))

interface Props {
  params: Promise<{ slug: string }>
}

/** SEO dinámico por tenant: título, descripción y Open Graph con datos de la veterinaria. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const config = await leerConfig(slug)

  if (!config) {
    return {
      title: "Veterinaria — VetPanel",
      description: "Reservá turnos online para tu mascota.",
      robots: { index: false, follow: false },
    }
  }

  const nombre = config.nombre || slug
  const title = `${nombre} — Turnos online`
  const description =
    config.descripcion ||
    config.slogan ||
    `Reservá turnos online en ${nombre}. Gestión veterinaria con VetPanel.`
  const ogImage = config.fotosHero?.[0] || config.logo || `${APP_URL}/metadato.png`
  const url = `${APP_URL}/${slug}`

  return {
    title,
    description,
    alternates: { canonical: `/${slug}` },
    openGraph: {
      type: "website",
      locale: "es_AR",
      url,
      siteName: nombre,
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: nombre }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  }
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  const config = await leerConfig(slug)
  // Una veterinaria pausada sigue sin datos estructurados, igual que en el sitemap.
  const datos = config && config.status !== "pausado" ? datosEstructuradosVeterinaria(slug, config, BASE_URL) : null

  return (
    <>
      {datos && (
        <script
          type="application/ld+json"
          // Datos cargados por la veterinaria, escapados en serializarJsonLd.
          dangerouslySetInnerHTML={{ __html: serializarJsonLd(datos) }}
        />
      )}
      <VetPublicView />
    </>
  )
}
