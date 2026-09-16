/**
 * Slug de mascota para URLs legibles (`/mi-historia/{dni}/{slug}`). No es la
 * columna `slug` de la tabla (esa incluye el tipo, para desduplicar altas);
 * este es solo el nombre, así la URL queda corta y memorizable.
 */
export function slugificarMascota(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
}
