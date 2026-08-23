import { supabase } from "./config"
import type { RecordatorioVacuna } from "./types"

/** Recordatorios de vacunas. Mismas firmas que la versión Firestore. */

type Fila = Record<string, unknown>

function aRecordatorio(f: Fila): RecordatorioVacuna {
  return {
    id: f.id as string,
    clienteId: (f.cliente_id as string) ?? "",
    mascotaId: (f.mascota_id as string) ?? "",
    mascotaNombre: (f.mascota_nombre as string) ?? "",
    telefono: (f.telefono as string) ?? "",
    vacuna: (f.vacuna as string) ?? "",
    fecha: (f.fecha as string) ?? "",
    enviado: (f.enviado as boolean) ?? false,
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

export async function deleteRecordatorioVacuna(
  tenantId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("recordatorios_vacunas").delete()
    .eq("tenant_id", tenantId).eq("id", id)
  if (error) throw new Error(`No se pudo borrar el recordatorio: ${error.message}`)
}

/** Recordatorios pendientes para una fecha (usado por el cron). */
export async function getRecordatoriosVacunaPendientes(
  tenantId: string,
  fecha: string,
): Promise<RecordatorioVacuna[]> {
  const { data, error } = await supabase
    .from("recordatorios_vacunas").select("*")
    .eq("tenant_id", tenantId).eq("fecha", fecha).eq("enviado", false)
  if (error) return []
  return (data ?? []).map(aRecordatorio)
}

export async function marcarRecordatorioVacunaEnviado(
  tenantId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("recordatorios_vacunas")
    .update({ enviado: true })
    .eq("tenant_id", tenantId).eq("id", id)
  if (error) throw new Error(`No se pudo marcar el recordatorio: ${error.message}`)
}
