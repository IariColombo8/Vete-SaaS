import { supabase } from "./config"
import { throwIfSupabaseError } from "./assert"
import type { RecordatorioVacuna, TipoRecordatorio } from "./types"

/**
 * Recordatorios de vacunas y desparasitaciones. Los automáticos los crea un
 * trigger desde la historia (060); acá solo se crean los manuales.
 */

type Fila = Record<string, unknown>

function aRecordatorio(f: Fila): RecordatorioVacuna {
  const cliente = f.clientes as { nombre?: string; telefono?: string } | null | undefined
  return {
    id: f.id as string,
    clienteId: (f.cliente_id as string) ?? "",
    mascotaId: (f.mascota_id as string) ?? "",
    mascotaNombre: (f.mascota_nombre as string) ?? "",
    telefono: (f.telefono as string) ?? "",
    vacuna: (f.vacuna as string) ?? "",
    fecha: (f.fecha as string) ?? "",
    enviado: (f.enviado as boolean) ?? false,
    tipo: (f.tipo as RecordatorioVacuna["tipo"]) ?? "vacuna",
    origen: (f.origen as RecordatorioVacuna["origen"]) ?? "manual",
    // Sin la migración 060 no hay `estado`: se deduce del boolean viejo.
    estado: (f.estado as RecordatorioVacuna["estado"]) ?? (f.enviado ? "enviado" : "pendiente"),
    canal: (f.canal as RecordatorioVacuna["canal"]) ?? undefined,
    enviadoAt: (f.enviado_at as string) ?? undefined,
    intentos: (f.intentos as number) ?? 0,
    ultimoError: (f.ultimo_error as string) ?? undefined,
    clienteNombre: cliente?.nombre ?? undefined,
    clienteTelefono: cliente?.telefono ?? undefined,
    createdAt: (f.created_at as string) ?? undefined,
  }
}

export async function createRecordatorioVacuna(
  tenantId: string,
  data: Omit<RecordatorioVacuna, "id" | "enviado" | "createdAt">,
): Promise<RecordatorioVacuna> {
  const { data: creado, error } = await supabase
    .from("recordatorios_vacunas")
    .insert({
      tenant_id: tenantId,
      cliente_id: data.clienteId || null,
      mascota_id: data.mascotaId || null,
      mascota_nombre: data.mascotaNombre ?? "",
      telefono: data.telefono ?? "",
      vacuna: data.vacuna,
      fecha: data.fecha,
      enviado: false,
    })
    .select("*")
    .single()

  if (error) throw new Error(`No se pudo crear el recordatorio: ${error.message}`)
  return aRecordatorio(creado)
}

export async function getRecordatoriosVacunaByMascota(
  tenantId: string,
  mascotaId: string,
): Promise<RecordatorioVacuna[]> {
  const { data, error } = await supabase
    .from("recordatorios_vacunas").select("*")
    .eq("tenant_id", tenantId).eq("mascota_id", mascotaId)
    .order("fecha")
  if (error) return []
  return (data ?? []).map(aRecordatorio)
}

export interface ProximaVacuna {
  vacuna: string
  tipo: TipoRecordatorio
  /** YYYY-MM-DD */
  fecha: string
}

/**
 * Próximas vacunas/desparasitaciones de una mascota, para "Mi historia" (sin
 * sesión, RPC 061). Una por vacuna, ordenadas por fecha.
 */
export async function getProximasVacunasPublico(tenantId: string, mascotaId: string): Promise<ProximaVacuna[]> {
  const { data, error } = await supabase.rpc("obtener_proximas_vacunas_publico", {
    p_tenant: tenantId,
    p_mascota_id: mascotaId,
  })
  throwIfSupabaseError(error, "Error al cargar las próximas vacunas")
  return ((data ?? []) as Fila[])
    .map((f) => ({
      vacuna: (f.vacuna as string) ?? "",
      tipo: (f.tipo as TipoRecordatorio) ?? "vacuna",
      fecha: (f.fecha as string) ?? "",
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/**
 * Lo que falta avisar con próxima dosis entre `desde` y `hasta` (inclusive),
 * con nombre y teléfono actuales del dueño. Para la tarjeta del Dashboard.
 */
export async function getRecordatoriosPorAvisar(
  tenantId: string,
  desde: string,
  hasta: string,
): Promise<RecordatorioVacuna[]> {
  const { data, error } = await supabase
    .from("recordatorios_vacunas")
    .select("*, clientes(nombre, telefono)")
    .eq("tenant_id", tenantId)
    .in("estado", ["pendiente", "fallido"])
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha")
  throwIfSupabaseError(error, "Error al cargar recordatorios de vacunas")
  return (data ?? []).map(aRecordatorio)
}

/** El veterinario avisó a mano por wa.me: el cron ya no lo manda. */
export async function marcarRecordatorioAvisadoManual(tenantId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from("recordatorios_vacunas")
    .update({ estado: "enviado", canal: "manual", enviado_at: new Date().toISOString() })
    .eq("tenant_id", tenantId).eq("id", id)
  throwIfSupabaseError(error, "No se pudo marcar el recordatorio como avisado")
}

/** No corresponde avisar (la mascota ya no viene, se vacunó en otro lado…). No se borra. */
export async function descartarRecordatorioVacuna(tenantId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from("recordatorios_vacunas")
    .update({ estado: "cancelado" })
    .eq("tenant_id", tenantId).eq("id", id)
  throwIfSupabaseError(error, "No se pudo descartar el recordatorio")
}

export async function deleteRecordatorioVacuna(
  tenantId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("recordatorios_vacunas").delete()
    .eq("tenant_id", tenantId).eq("id", id)
  if (error) throw new Error(`No se pudo borrar el recordatorio: ${error.message}`)
}
