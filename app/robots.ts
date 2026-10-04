import type { MetadataRoute } from "next"
import { APP_URL, RUTAS_NO_INDEXABLES } from "@/lib/seo/sitio"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...RUTAS_NO_INDEXABLES] }],
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  }
}
