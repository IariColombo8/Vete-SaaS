import type { MetadataRoute } from "next"
import { getAllPosts } from "@/lib/blog/posts"
import { getTenantsFull } from "@/lib/supabase/tenants"
import { APP_URL } from "@/lib/seo/sitio"

// Se regenera una vez por hora: una veterinaria nueva entra al sitemap sin redeploy.
export const revalidate = 3600

/**
 * Las páginas públicas de cada veterinaria (activas) y su reserva de turnos.
 * Si la base no responde, el sitemap sale igual con las páginas fijas: un error
 * acá no puede dejar a Google sin sitemap.
 */
async function paginasDeVeterinarias(): Promise<MetadataRoute.Sitemap> {
  try {
    const tenants = await getTenantsFull()
    return tenants
      .filter((t) => t.status !== "pausado")
      .flatMap((t) => [
        { url: `${APP_URL}/${t.slug}`, changeFrequency: "weekly" as const, priority: 0.7 },
        { url: `${APP_URL}/${t.slug}/turno`, changeFrequency: "weekly" as const, priority: 0.6 },
      ])
  } catch (error) {
    console.error("[sitemap] No se pudieron listar las veterinarias:", error)
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fijas: MetadataRoute.Sitemap = [
    { url: APP_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${APP_URL}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${APP_URL}/registro`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${APP_URL}/blog`, changeFrequency: "weekly", priority: 0.7 },
  ]

  const posts: MetadataRoute.Sitemap = getAllPosts().map((p) => {
    // Una fecha mal escrita en el frontmatter no puede romper el XML del sitemap.
    const fecha = new Date(p.date)
    return {
      url: `${APP_URL}/blog/${p.slug}`,
      lastModified: Number.isNaN(fecha.getTime()) ? undefined : fecha,
      changeFrequency: "monthly",
      priority: 0.6,
    }
  })

  return [...fijas, ...posts, ...(await paginasDeVeterinarias())]
}
