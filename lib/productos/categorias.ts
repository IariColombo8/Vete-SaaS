/**
 * Las 4 categorías fijas (Medicamentos, Alimentos, Accesorios, Servicio)
 * siempre tienen que estar disponibles para filtrar o para aplicar ganancia,
 * aunque el catálogo todavía no tenga ningún producto activo en alguna de
 * ellas —`getCategorias` solo devuelve las que ya tienen productos—, así que
 * se anteponen a mano en este orden fijo y el resto de las categorías (si el
 * tenant cargó alguna otra) va después, alfabético.
 */
export const CATEGORIAS_FIJAS = ["Medicamentos", "Accesorios", "Alimentos", "Servicio"]

/**
 * Dedupe sin distinguir mayúsculas: el catálogo es texto libre y productos
 * cargados a mano o importados terminan con "accesorios" y "Accesorios"
 * como si fueran rubros distintos. Ante un empate gana la fija (con su
 * capitalización canónica) y, entre las demás, la primera que aparece.
 */
export function ordenarCategorias(categorias: string[]): string[] {
  const vistas = new Set(CATEGORIAS_FIJAS.map((c) => c.toLowerCase()))

  const otras = categorias
    .filter((c) => c.trim() !== "")
    .sort((a, b) => a.localeCompare(b, "es"))
    .filter((c) => {
      const clave = c.toLowerCase()
      if (vistas.has(clave)) return false
      vistas.add(clave)
      return true
    })

  return [...CATEGORIAS_FIJAS, ...otras]
}
