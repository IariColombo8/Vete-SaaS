import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"
import { getTenantConfig, type TenantConfig } from "@/lib/supabase/queries"
import { planAllows } from "@/lib/plans"
import { serializarJsonLd } from "@/lib/seo/datos-estructurados"
import { datosEstructuradosVeterinaria } from "@/lib/seo/veterinaria"
import { APP_URL as BASE_URL } from "@/lib/seo/sitio"
import { primerasFotosHero } from "./fotos-default"
import {
  ANCHOS_HERO, ANCHOS_HERO_MOBILE, ANCHOS_LOGO, SIZES_LOGO_HERO, imagenSupabase, srcSetSupabase,
} from "@/lib/imagenes"
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

/**
 * Lo que la página pública necesita de la config. La vista la recibe por
 * props y queda serializada en el HTML, así que no viajan los campos de
 * billing, calendario ni email aunque hoy la policy de `tenants` los deje leer.
 */
function configPublica(config: TenantConfig): TenantConfig {
  const {
    nombre, plan, status, telefono, email, direccion, ciudad, slogan, descripcion,
    servicios, horarios, fotosHero, fotosHeroMobile, logo, modalidad, googleMapsUrl, redes,
  } = config
  return {
    nombre, plan, status, telefono, email, direccion, ciudad, slogan, descripcion,
    servicios, horarios, fotosHero, fotosHeroMobile, logo, modalidad, googleMapsUrl, redes,
  }
}

/**
 * La foto del hero es la imagen más grande de la página (LCP): se precarga
 * desde el HTML con el mismo media query que usa el `<picture>` de la vista,
 * así el navegador la pide antes de parsear el cuerpo. React lleva estos
 * `<link>` al `<head>` solo.
 */
function PreloadFotoHero({ config }: { config: TenantConfig }) {
  const { desktop, mobile } = primerasFotosHero(config)
  const distintas = !!mobile && !!desktop && mobile !== desktop
  const links = distintas
    ? [
        { url: mobile as string, anchos: ANCHOS_HERO_MOBILE, media: "(max-width: 767px)" },
        { url: desktop as string, anchos: ANCHOS_HERO, media: "(min-width: 768px)" },
      ]
    : [{ url: desktop ?? mobile, anchos: ANCHOS_HERO, media: undefined }]

  // Mismo srcset/sizes que el <picture> y el logo de la vista: si difieren, el
  // navegador precarga una variante y después pide otra.
  const atributos = (url: string, anchos: number[], sizes: string) => {
    const srcSet = srcSetSupabase(url, anchos)
    return srcSet ? { imageSrcSet: srcSet, imageSizes: sizes } : { href: url }
  }

  return (
    <>
      {links
        .filter((l): l is { url: string; anchos: number[]; media: string | undefined } => !!l.url)
        .map((l) => (
          <link
            key={l.url}
            rel="preload"
            as="image"
            media={l.media}
            fetchPriority="high"
            {...atributos(l.url, l.anchos, "100vw")}
          />
        ))}
      {/* El logo va arriba de todo en el hero y en celular suele ser el LCP. */}
      {config.logo && (
        <link
          rel="preload"
          as="image"
          fetchPriority="high"
          {...(srcSetSupabase(config.logo, ANCHOS_LOGO)
            ? { imageSrcSet: srcSetSupabase(config.logo, ANCHOS_LOGO), imageSizes: SIZES_LOGO_HERO }
            : { href: imagenSupabase(config.logo, 384) })}
        />
      )}
    </>
  )
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  const config = await leerConfig(slug)
  // 404 de verdad (ver not-found.tsx): antes respondía 200 con la pantalla de
  // "no encontrada" renderizada en el cliente, un soft 404 para Google.
  if (!config) notFound()
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
      {config && <PreloadFotoHero config={config} />}
      <VetPublicView
        configInicial={config ? configPublica(config) : null}
        // getTenantConfig ya cargó el catálogo de planes.
        vidriera={{
          productos: planAllows(config?.plan, "productos"),
          promos: planAllows(config?.plan, "promosSorteos"),
        }}
      />
    </>
  )
}
