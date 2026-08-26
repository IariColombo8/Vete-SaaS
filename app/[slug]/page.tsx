import type { Metadata } from "next"
import { getTenantConfig } from "@/lib/supabase/queries"
import VetPublicView from "./vet-public-view"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://vetpanel.app"

interface Props {
  params: Promise<{ slug: string }>
}

/** SEO dinámico por tenant: título, descripción y Open Graph con datos de la veterinaria. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const config = await getTenantConfig(slug).catch(() => null)

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

export default function Page() {
  return <VetPublicView />
}
