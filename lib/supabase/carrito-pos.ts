import { supabase } from "./config"

/**
 * Carrito de mostrador compartido (ver `supabase/025_carrito_pos.sql`).
 * `data` es opaco acá: lo define y lo interpreta `useCarritoCompartido`.
 */

export interface CarritoPosFila {
  data: Record<string, unknown>
  clientId: string | null
  updatedAt: string
}

export async function getCarritoPos(tenantId: string): Promise<CarritoPosFila | null> {
  const { data } = await supabase
    .from("carrito_pos")
    .select("data, client_id, updated_at")
    .eq("tenant_id", tenantId)
    .maybeSingle()
  if (!data) return null
  return {
    data: (data.data as Record<string, unknown>) ?? {},
    clientId: (data.client_id as string) ?? null,
    updatedAt: data.updated_at as string,
  }
}

export async function guardarCarritoPos(
  tenantId: string,
  data: Record<string, unknown>,
  clientId: string,
): Promise<void> {
  const { error } = await supabase
    .from("carrito_pos")
    .upsert({ tenant_id: tenantId, data, client_id: clientId, updated_at: new Date().toISOString() })
  if (error) throw error
}

/** Se llama al cobrar o vaciar, para que la otra pantalla también se limpie. */
export async function limpiarCarritoPos(tenantId: string, clientId: string): Promise<void> {
  await guardarCarritoPos(tenantId, {}, clientId)
}

export function suscribirCarritoPos(
  tenantId: string,
  onCambio: (fila: CarritoPosFila) => void,
) {
  const canal = supabase
    .channel(`carrito_pos:${tenantId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "carrito_pos", filter: `tenant_id=eq.${tenantId}` },
      (payload) => {
        const fila = payload.new as Record<string, unknown>
        if (!fila) return
        onCambio({
          data: (fila.data as Record<string, unknown>) ?? {},
          clientId: (fila.client_id as string) ?? null,
          updatedAt: fila.updated_at as string,
        })
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(canal)
  }
}
