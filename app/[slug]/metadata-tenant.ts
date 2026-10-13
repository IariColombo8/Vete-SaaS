import type { Metadata } from "next"
import { cache } from "react"
import { getTenantConfig } from "@/lib/supabase/queries"
import { APP_URL } from "@/lib/seo/sitio"

/** Config del tenant, una sola consulta por request aunque la pidan metadata y página. */
export const leerConfigTenant = cache((slug: string) => getTenantConfig(slug).catch(() => null))

/**
 * Metadata de las páginas públicas internas de una veterinaria (reservar
 * turno, productos). Son "use client" y no pueden exportar metadata: sin
 * esto heredaban el título de la landing de VetPanel, así que todas las
 * veterinarias competían con el mismo título duplicado en Google.
 */
export async function metadataDeTenant(
  slug: string,
  seccion: { titulo: (nombre: string) => string; descripcion: (nombre: string) => string; ruta: string },
): Promise<Metadata> {
  const config = await leerConfigTenant(slug)
  if (!config || config.status === "pausado") {
    return { title: `${seccion.titulo("Veterinaria")} — VetPanel`, robots: { index: false, follow: false } }
  }
  const nombre = config.nombre || slug
  const title = seccion.titulo(nombre)
  const description = seccion.descripcion(nombre)
  const url = `${APP_URL}/${slug}${seccion.ruta}`
  return {
    title,
    description,
    alternates: { canonical: `/${slug}${seccion.ruta}` },
    openGraph: {
      type: "website",
      locale: "es_AR",
      url,
      siteName: nombre,
      title,
      description,
      images: config.fotosHero?.[0] || config.logo ? [{ url: (config.fotosHero?.[0] || config.logo) as string, alt: nombre }] : undefined,
    },
  }
}
