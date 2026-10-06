import type { PostMeta } from "@/lib/blog/posts"
import { SITIO } from "./sitio"

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}/

/** "Equipo VetPanel" firma como organización, no como persona. */
const ES_EQUIPO = /^equipo\s/i

/**
 * Datos estructurados (schema.org, JSON-LD) de un artículo del blog. El editor
 * apunta a la organización que ya declara la landing (`/#organizacion`).
 * Una fecha mal escrita en el frontmatter no se publica: Google la marca como error.
 */
export function datosEstructuradosArticulo(post: PostMeta, baseUrl: string): Record<string, unknown> {
  const url = `${baseUrl}/blog/${post.slug}`
  const autor = post.author?.trim()

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#articulo`,
    headline: post.title,
    description: post.description,
    url,
    mainEntityOfPage: url,
    ...(FECHA_ISO.test(post.date ?? "") ? { datePublished: post.date } : {}),
    inLanguage: "es-AR",
    image: `${baseUrl}${SITIO.imagen}`,
    author:
      autor && !ES_EQUIPO.test(autor)
        ? { "@type": "Person", name: autor }
        : { "@type": "Organization", name: autor ?? SITIO.nombre, url: baseUrl },
    publisher: { "@id": `${baseUrl}/#organizacion` },
  }
}
