import { supabase } from "./config"
import { throwIfSupabaseError } from "./assert"
import type { FilaActividad } from "../superadmin/actividad"

/**
 * Contador de uso del panel (`actividad_panel`, ver 057_actividad_panel.sql).
 *
 * `registrarActividad` lo llama el layout del panel cada vez que alguien del
 * equipo lo abre. Falla en silencio: un contador no puede impedir que se use
 * el panel.
 */
export async function registrarActividad(tenantId: string): Promise<void> {
  const { error } = await supabase.rpc("registrar_actividad", { p_tenant: tenantId })
  if (error) console.warn("No se pudo registrar la actividad del panel:", error.message)
}

/** Días con actividad desde hace `dias` días (solo superadmin, lo exige la policy). */
export async function getActividadPlataforma(dias: number): Promise<FilaActividad[]> {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from("actividad_panel")
    .select("usuario_id, tenant_id, dia, aperturas, ultima")
    .gte("dia", desde)
  throwIfSupabaseError(error, "Error al leer la actividad del panel")
  return (data ?? []).map((f) => ({
    usuarioId: f.usuario_id as string,
    tenantId: f.tenant_id as string,
    dia: f.dia as string,
    aperturas: f.aperturas as number,
    ultima: f.ultima as string,
  }))
}
