/**
 * Persistencia de borradores de formulario en localStorage. Cada diálogo del
 * panel guarda su progreso bajo una key propia (ej. `cliente:${dni}` o
 * `cliente:nuevo`) mientras el usuario tipea, para poder ofrecer "seguir
 * donde ibas" si cierra el navegador, se corta la luz, o pierde la conexión
 * antes de guardar.
 */

const PREFIJO = "borrador:"

interface BorradorGuardado<T> {
  valor: T
  guardadoEn: number
}

function claveCompleta(key: string): string {
  return `${PREFIJO}${key}`
}

export function guardarBorrador<T>(key: string, valor: T): void {
  if (typeof window === "undefined") return
  try {
    const dato: BorradorGuardado<T> = { valor, guardadoEn: Date.now() }
    window.localStorage.setItem(claveCompleta(key), JSON.stringify(dato))
  } catch {
    // localStorage lleno o deshabilitado (modo privado): no es crítico,
    // el formulario sigue funcionando, solo no persiste el borrador.
  }
}

export function leerBorrador<T>(key: string): { valor: T; guardadoEn: number } | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(claveCompleta(key))
    if (!raw) return null
    const dato = JSON.parse(raw) as BorradorGuardado<T>
    return { valor: dato.valor, guardadoEn: dato.guardadoEn }
  } catch {
    return null
  }
}

export function borrarBorrador(key: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(claveCompleta(key))
  } catch {
    // ver comentario en guardarBorrador
  }
}
