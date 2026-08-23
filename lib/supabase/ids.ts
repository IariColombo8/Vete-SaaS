/**
 * Helpers de ID portados de `lib/firebase/collections.ts`.
 *
 * En Supabase las PK son uuid, así que estos ya no generan IDs de documento.
 * Sobreviven porque la app los usa para otras cosas: `mascotaDocId` alimenta
 * la columna `mascotas.slug` (única por cliente) y `clienteDocId` normaliza
 * el DNI antes de buscar.
 */

/** Convierte texto a slug limpio sin tildes ni espacios */
export function toId(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "sin-nombre"
}

/** Normaliza el DNI (antes era el ID del documento de cliente) */
export function clienteDocId(dni: string): string {
  return dni.trim()
}

/** Slug de mascota: nombre-tipo (ej: firulais-perro) */
export function mascotaDocId(nombre: string, tipo: string): string {
  return `${toId(nombre)}-${toId(tipo)}`
}

/** Normaliza una fecha a YYYY-MM-DD */
export function historiaDocId(fechaAtencion: string): string {
  return (
    (fechaAtencion ?? "").slice(0, 10).replace(/\//g, "-") ||
    new Date().toISOString().slice(0, 10)
  )
}
