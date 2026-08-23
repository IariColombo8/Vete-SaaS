import { supabase, BUCKET } from "./config"

/**
 * Storage. Equivalente a `lib/firebase/storage.ts`.
 *
 * Mismo layout de paths que Firebase, porque las policies del bucket derivan
 * el tenant del primer segmento: veterinarias/{tenantId}/...
 */

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
  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const path = `${tenantId}/${carpeta}/${timestamp}-${safeName}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
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
