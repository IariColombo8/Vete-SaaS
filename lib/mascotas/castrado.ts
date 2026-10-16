import type { SexoMascota } from "@/lib/supabase/types"

/**
 * "¿Castrado/a?" en los formularios. En la base es boolean nullable; en un
 * <Select> hace falta un string, y "" representa "sin dato" (no se sabe o la
 * mascota se cargó antes de que existiera el campo).
 */
export type OpcionCastrado = "" | "si" | "no"

export function castradoAOpcion(castrado: boolean | undefined): OpcionCastrado {
  if (castrado === true) return "si"
  if (castrado === false) return "no"
  return ""
}

export function opcionACastrado(opcion: OpcionCastrado): boolean | undefined {
  if (opcion === "si") return true
  if (opcion === "no") return false
  return undefined
}

/** "Castrado" / "Castrada" / "No castrado" / "No castrada"; null si no hay dato. */
export function textoCastrado(castrado: boolean | undefined, sexo?: SexoMascota): string | null {
  if (castrado === undefined) return null
  const palabra = sexo === "hembra" ? "Castrada" : "Castrado"
  return castrado ? palabra : `No ${palabra.toLowerCase()}`
}
