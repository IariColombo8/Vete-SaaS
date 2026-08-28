import { describe, it, expect } from "vitest"
import { ordenarCategorias, CATEGORIAS_FIJAS } from "./categorias"

describe("ordenarCategorias", () => {
  it("antepone siempre las categorías fijas en su orden, aunque el catálogo no tenga productos en ellas", () => {
    expect(ordenarCategorias([])).toEqual(CATEGORIAS_FIJAS)
  })

  it("agrega las categorías extra del tenant después, ordenadas alfabéticamente", () => {
    expect(ordenarCategorias(["Higiene", "Peluquería"])).toEqual([
      ...CATEGORIAS_FIJAS, "Higiene", "Peluquería",
    ])
  })

  it("no duplica una categoría fija que ya venga en la lista recibida", () => {
    expect(ordenarCategorias(["Medicamentos", "Accesorios", "Alimentos"])).toEqual(CATEGORIAS_FIJAS)
  })

  it("no duplica una categoría fija que venga con otra capitalización", () => {
    expect(ordenarCategorias(["accesorios", "SERVICIO"])).toEqual(CATEGORIAS_FIJAS)
  })

  it("no duplica dos variantes de capitalización de la misma categoría extra", () => {
    expect(ordenarCategorias(["higiene", "Higiene"])).toEqual([...CATEGORIAS_FIJAS, "higiene"])
  })
})
