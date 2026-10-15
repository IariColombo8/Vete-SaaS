import "server-only"
import { filaAPlan, getPlanList, ordenarPlanes, registrarPlanes, type PlanDefinition } from "./plans"

/**
 * Catálogo de planes leído desde el servidor (landing, /pricing, checkout,
 * crons). Va por fetch directo a PostgREST con la clave pública —la tabla es
 * de lectura pública— para no meter el cliente de Supabase en el render de
 * páginas públicas.
 *
 * - Por defecto la respuesta se cachea 5 minutos (las páginas de precios se
 *   regeneran solas tras un cambio desde el superadmin).
 * - `fresco: true` saltea la cache: el checkout cobra el precio vigente.
 *
 * Si la lectura falla, devuelve el catálogo que ya hay en memoria.
 */
export async function cargarPlanesServidor(opciones: { fresco?: boolean } = {}): Promise<PlanDefinition[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return getPlanList({ incluirOcultos: true })

  try {
    const res = await fetch(`${url}/rest/v1/planes?select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      ...(opciones.fresco ? { cache: "no-store" as const } : { next: { revalidate: 300, tags: ["planes"] } }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    const filas = (await res.json()) as Record<string, unknown>[]
    const planes = ordenarPlanes(filas.map(filaAPlan))
    registrarPlanes(planes)
    return planes
  } catch (error) {
    console.error("No se pudo leer el catálogo de planes:", error)
    return getPlanList({ incluirOcultos: true })
  }
}
