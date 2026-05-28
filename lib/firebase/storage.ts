import { storage } from "./config"
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage"

/**
 * Sube un archivo a Firebase Storage y retorna la URL pública.
 * Path: veterinarias/{tenantId}/historias/{clienteId}/{mascotaId}/{timestamp}-{filename}
 */
export async function uploadArchivoHistoria(
  tenantId: string,
  clienteId: string,
  mascotaId: string,
  file: File,
): Promise<string> {
  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const path = `veterinarias/${tenantId}/historias/${clienteId}/${mascotaId}/${timestamp}-${safeName}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}

/**
 * Elimina un archivo de Firebase Storage por su URL.
 */
export async function deleteArchivoHistoria(url: string): Promise<void> {
  try {
    const storageRef = ref(storage, url)
    await deleteObject(storageRef)
  } catch {
    // Si el archivo no existe, no es un error crítico
  }
}
