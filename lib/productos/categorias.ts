/**
 * Las 3 categorías del import (Medicamentos, Alimentos, Accesorios) siempre
 * tienen que estar disponibles para filtrar o para aplicar ganancia, aunque
 * el catálogo todavía no tenga ningún producto activo en alguna de ellas
 * —`getCategorias` solo devuelve las que ya tienen productos—, así que se
 * anteponen a mano en este orden fijo y el resto de las categorías (si el
 * tenant cargó alguna otra, como "Servicios") va después, alfabético.
 */
const ORDEN_CATEGORIAS = ["Medicamentos", "Accesorios", "Alimentos"]

export function ordenarCategorias(categorias: string[]): string[] {
  const otras = categorias
    .filter((c) => !ORDEN_CATEGORIAS.includes(c))
    .sort((a, b) => a.localeCompare(b, "es"))
  return [...ORDEN_CATEGORIAS, ...otras]
}
