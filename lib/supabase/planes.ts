import { supabase } from "./config"
import { throwIfSupabaseError } from "./assert"
import { filaAPlan, ordenarPlanes, planAFila, registrarPlanes, type PlanDefinition } from "../plans"

/**
 * Catálogo de planes (`planes`, ver 056_planes_editables.sql).
 *
 * `cargarPlanes` lo lee una vez y lo registra en `lib/plans.ts`, que es donde
 * consultan los chequeos de feature. Cache de un minuto: un precio cambiado
 * desde el superadmin llega solo, sin que nadie recargue.
 */

const VIGENCIA_MS = 60_000

let enCurso: Promise<PlanDefinition[]> | null = null
let leidoEn = 0

async function leerPlanes(): Promise<PlanDefinition[]> {
  const { data, error } = await supabase.from("planes").select("*")
  throwIfSupabaseError(error, "Error al leer los planes")
  const planes = ordenarPlanes((data ?? []).map(filaAPlan))
  registrarPlanes(planes)
  return planes
}

/**
 * Carga el catálogo (todos, también los ocultos). Si falla, sigue con el que
 * había en memoria: un plan mal leído no puede dejar el panel sin funcionar.
 */
export async function cargarPlanes(opciones: { forzar?: boolean } = {}): Promise<PlanDefinition[]> {
  const vencido = Date.now() - leidoEn > VIGENCIA_MS
  if (!enCurso || vencido || opciones.forzar) {
    leidoEn = Date.now()
    enCurso = leerPlanes().catch((error) => {
      console.error("No se pudo cargar el catálogo de planes:", error)
      leidoEn = 0
      return []
    })
  }
  return enCurso
}

/** Alta o edición (solo superadmin, lo exige la policy). */
export async function guardarPlan(plan: PlanDefinition, nuevo: boolean): Promise<void> {
  const fila = planAFila(plan)
  const { error } = nuevo
    ? await supabase.from("planes").insert(fila)
    : await supabase.from("planes").update(fila).eq("id", plan.id)
  if (error?.code === "23505") throw new Error(`Ya existe un plan con el id "${plan.id}"`)
  throwIfSupabaseError(error, "No se pudo guardar el plan")
  await cargarPlanes({ forzar: true })
}

/** Borra un plan sin veterinarias. Básico y Pro no se pueden borrar (policy). */
export async function eliminarPlan(id: string): Promise<void> {
  const { data, error } = await supabase.from("planes").delete().eq("id", id).select("id")
  if (error?.code === "23503") {
    throw new Error("Hay veterinarias con este plan: cambiales el plan antes de borrarlo, u ocultalo")
  }
  throwIfSupabaseError(error, "No se pudo borrar el plan")
  if (!data || data.length === 0) throw new Error("Este plan no se puede borrar")
  await cargarPlanes({ forzar: true })
}
