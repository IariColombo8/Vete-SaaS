import { supabase, BUCKET } from "./config"

/**
 * Storage. Equivalente a `lib/firebase/storage.ts`.
 *
 * Mismo layout de paths que Firebase, porque las policies del bucket derivan
 * el tenant del primer segmento: veterinarias/{tenantId}/...
 */

/**
 * Redimensiona una imagen en el browser antes de subirla. Sin esto, un logo
 * de cámara (2576x2576, ~2.5MB) rompe el preview de WhatsApp: su crawler
 * tiene timeouts cortos y descarta archivos grandes, aunque Facebook/Twitter
 * los toleren.
 */
async function redimensionarImagen(file: File, maxDimension: number): Promise<File> {
  if (typeof window === "undefined" || !file.type.startsWith("image/")) return file

  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file
  if (bitmap.width <= maxDimension && bitmap.height <= maxDimension) return file

  const scale = maxDimension / Math.max(bitmap.width, bitmap.height)
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, 0.85))
  if (!blob) return file
  return new File([blob], file.name, { type: file.type })
}

/** Sube un archivo de historia clínica y devuelve su URL pública. */
export async function uploadArchivoHistoria(
  tenantId: string,
  clienteId: string,
  mascotaId: string,
  file: File,
): Promise<string> {
  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const path = `${tenantId}/historias/${clienteId}/${mascotaId}/${timestamp}-${safeName}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  })
  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`)

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/** Sube una foto del tenant (hero, logo) y devuelve su URL pública. */
export async function uploadFotoTenant(
  tenantId: string,
  carpeta: string,
  file: File,
): Promise<string> {
  const maxDimension = carpeta === "logo" ? 600 : 1600
  const archivo = await redimensionarImagen(file, maxDimension)

  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const path = `${tenantId}/${carpeta}/${timestamp}-${safeName}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, archivo, {
    cacheControl: "3600",
    upsert: false,
  })
  if (error) throw new Error(`No se pudo subir la foto: ${error.message}`)

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * Extrae el path interno del bucket a partir de una URL pública.
 * Devuelve null si la URL no pertenece a este bucket (ej: una vieja de Firebase).
 */
function pathDesdeUrl(url: string): string | null {
  const marcador = `/storage/v1/object/public/${BUCKET}/`
  const i = url.indexOf(marcador)
  if (i === -1) return null
  return decodeURIComponent(url.slice(i + marcador.length))
}

/** Elimina un archivo por su URL pública. No falla si no existe. */
export async function deleteArchivoHistoria(url: string): Promise<void> {
  const path = pathDesdeUrl(url)
  if (!path) return
  await supabase.storage.from(BUCKET).remove([path])
}

/** Alias: la config del tenant borra fotos con la misma lógica. */
export const deleteFotoTenant = deleteArchivoHistoria
