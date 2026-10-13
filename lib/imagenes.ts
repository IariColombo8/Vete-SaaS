/**
 * Imágenes de Supabase Storage redimensionadas al vuelo.
 *
 * El proyecto tiene habilitadas las transformaciones de imagen de Storage:
 * `/storage/v1/render/image/public/…?width=…&quality=…` devuelve la imagen
 * escalada (y en WebP para los navegadores que lo aceptan), cacheada en la
 * CDN por variante. Sirve para no mandarle al celular el logo original de
 * 600 px / 300 KB para mostrarlo en 64 px. Las URLs que no son del bucket
 * (fotos de muestra, links externos) se devuelven tal cual.
 */
const ORIGINAL = "/storage/v1/object/public/"
const RENDER = "/storage/v1/render/image/public/"

export function esImagenSupabase(url: string): boolean {
  return url.includes(ORIGINAL)
}

/** URL de la imagen escalada a `ancho` px (manteniendo proporción). */
export function imagenSupabase(url: string, ancho: number, calidad = 75): string {
  if (!esImagenSupabase(url)) return url
  const base = url.replace(ORIGINAL, RENDER)
  const separador = base.includes("?") ? "&" : "?"
  return `${base}${separador}width=${ancho}&quality=${calidad}`
}

/** `srcset` con descriptores de ancho, o undefined si no es del bucket. */
export function srcSetSupabase(url: string, anchos: number[], calidad = 75): string | undefined {
  if (!esImagenSupabase(url)) return undefined
  return anchos.map((w) => `${imagenSupabase(url, w, calidad)} ${w}w`).join(", ")
}

/** Anchos típicos: foto de hero a pantalla completa, y el logo del hero (64 px / 192 px, x2). */
export const ANCHOS_HERO = [768, 1200, 1600]
export const ANCHOS_HERO_MOBILE = [480, 768, 1080]
export const ANCHOS_LOGO = [128, 256, 384]
export const SIZES_LOGO_HERO = "(min-width: 640px) 192px, 64px"
