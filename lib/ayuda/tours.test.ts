import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { TOURS, claveTourVisto } from "./tours"

/**
 * Todos los `data-tour="…"` escritos en componentes y páginas, más los
 * `tour: "…"` de los grupos del sidebar, que lo arma con `data-tour={grupo.tour}`.
 */
function anclasEnElCodigo(): Set<string> {
  const anclas = new Set<string>()
  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = path.join(dir, nombre)
      if (statSync(ruta).isDirectory()) recorrer(ruta)
      else if (ruta.endsWith(".tsx")) {
        const fuente = readFileSync(ruta, "utf8")
        for (const m of fuente.matchAll(/data-tour="([^"]+)"|\btour: "([^"]+)"/g)) anclas.add(m[1] ?? m[2])
      }
    }
  }
  recorrer(path.resolve(__dirname, "../../components"))
  recorrer(path.resolve(__dirname, "../../app"))
  return anclas
}

describe("TOURS", () => {
  // Un paso cuyo ancla se borró se saltea en silencio al correr el tour:
  // este test es el que avisa que el tour quedó incompleto.
  it("cada paso apunta a un data-tour que existe en el código", () => {
    const anclas = anclasEnElCodigo()
    for (const [seccion, pasos] of Object.entries(TOURS)) {
      for (const paso of pasos ?? []) {
        const ancla = paso.element.match(/^\[data-tour="([^"]+)"\]$/)?.[1]
        expect(ancla, `${seccion}: selector inválido ${paso.element}`).toBeDefined()
        expect(anclas.has(ancla!), `${seccion}: falta data-tour="${ancla}"`).toBe(true)
      }
    }
  })
})

describe("claveTourVisto", () => {
  it("el dashboard conserva la clave anterior, así quien ya lo vio no lo repite", () => {
    expect(claveTourVisto("vipvet", "dashboard")).toBe("vetpanel-tour-vipvet")
  })

  it("cada sección tiene su propia clave", () => {
    expect(claveTourVisto("vipvet", "caja")).toBe("vetpanel-tour-vipvet-caja")
    expect(claveTourVisto("vipvet", "pos")).not.toBe(claveTourVisto("vipvet", "caja"))
  })
})
