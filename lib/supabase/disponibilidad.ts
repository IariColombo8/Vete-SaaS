import { supabase } from "./config"
import type { DiaBloqueado, Unsubscribe } from "./types"

/**
 * Días bloqueados. En Firestore el docId era la fecha; acá la PK es uuid y
 * la fecha es `unique (tenant_id, fecha)`.
 *
 * `bloquearDia` devuelve `{ id }` como antes, pero el id ya no es la fecha:
 * es el uuid de la fila. `desbloquearDia` acepta cualquiera de los dos.
 */

type Fila = Record<string, unknown>

function aDia(f: Fila): DiaBloqueado {
  return {
    id: f.id as string,
    fecha: (f.fecha as string) ?? undefined,
    motivo: (f.motivo as string) ?? undefined,
  }
}

export async function getDiasBloqueados(tenantId: string): Promise<DiaBloqueado[]> {
  const { data, error } = await supabase
    .from("dias_bloqueados").select("*").eq("tenant_id", tenantId).order("fecha")
  if (error) {
    console.error("Error al leer días bloqueados:", error.message)
    return []
  }
  return (data ?? []).map(aDia)
}

/** Suscripción real-time a los días bloqueados. Reemplaza `onSnapshot`. */
export function subscribeDiasBloqueados(
  tenantId: string,
  onData: (dias: DiaBloqueado[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  let activo = true

  const cargar = async () => {
    try {
      const dias = await getDiasBloqueados(tenantId)
      if (activo) onData(dias)
    } catch (error) {
      if (activo) onError?.(error as Error)
    }
  }

  void cargar()

  const canal = supabase
    .channel(`dias:${tenantId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "dias_bloqueados",
        filter: `tenant_id=eq.${tenantId}`,
      },
      () => { void cargar() },
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        onError?.(new Error("Se perdió la conexión real-time con la disponibilidad"))
      }
    })

  return () => {
    activo = false
    void supabase.removeChannel(canal)
  }
}

export async function bloquearDia(tenantId: string, fecha: string, motivo?: string) {
  const { data, error } = await supabase
    .from("dias_bloqueados")
    .upsert(
      { tenant_id: tenantId, fecha, motivo: motivo || "Día bloqueado" },
      { onConflict: "tenant_id,fecha" },
    )
    .select("id")
    .single()

  if (error) throw new Error(`No se pudo bloquear el día: ${error.message}`)
  return { id: data.id as string }
}

/** Acepta el uuid de la fila o directamente la fecha (YYYY-MM-DD). */
export async function desbloquearDia(tenantId: string, diaId: string) {
  const esFecha = /^\d{4}-\d{2}-\d{2}$/.test(diaId)
  const q = supabase.from("dias_bloqueados").delete().eq("tenant_id", tenantId)
  const { error } = esFecha ? await q.eq("fecha", diaId) : await q.eq("id", diaId)
  if (error) throw new Error(`No se pudo desbloquear el día: ${error.message}`)
}
