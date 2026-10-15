import { supabase } from "./config"
import { throwIfSupabaseError } from "./assert"
import type { MedioPagoManual, PagoManual } from "../billing/cobro-manual"

/**
 * Pagos en efectivo/transferencia directo a VetPanel (`pagos_manuales`, ver
 * 058_cobro_manual.sql). Registrar y anular: solo superadmin (policies). Leer:
 * el superadmin todos, el equipo de una veterinaria los suyos.
 */

function aPago(f: Record<string, unknown>): PagoManual {
  return {
    id: f.id as string,
    tenantId: f.tenant_id as string,
    periodo: f.periodo as string,
    monto: Number(f.monto),
    medio: f.medio as MedioPagoManual,
    pagadoEl: f.pagado_el as string,
    nota: (f.nota as string | null) ?? null,
    createdAt: f.created_at as string,
    anuladoAt: (f.anulado_at as string | null) ?? null,
    motivoAnulacion: (f.motivo_anulacion as string | null) ?? null,
  }
}

/** Pagos de una veterinaria, o de todas si no se pasa. Más reciente primero. */
export async function getPagosManuales(tenantId?: string): Promise<PagoManual[]> {
  let q = supabase.from("pagos_manuales").select("*").order("periodo", { ascending: false })
  if (tenantId) q = q.eq("tenant_id", tenantId)
  const { data, error } = await q
  throwIfSupabaseError(error, "Error al leer los pagos")
  return (data ?? []).map(aPago)
}

export async function registrarPagoManual(pago: {
  tenantId: string
  periodo: string
  monto: number
  medio: MedioPagoManual
  pagadoEl: string
  nota?: string
}): Promise<void> {
  const { data: sesion } = await supabase.auth.getUser()
  const { error } = await supabase.from("pagos_manuales").insert({
    tenant_id: pago.tenantId,
    periodo: pago.periodo,
    monto: pago.monto,
    medio: pago.medio,
    pagado_el: pago.pagadoEl,
    nota: pago.nota?.trim() || null,
    registrado_por: sesion.user?.id ?? null,
  })
  if (error?.code === "23505") throw new Error("Ese mes ya tiene un pago registrado. Anulalo primero si hay que corregirlo.")
  throwIfSupabaseError(error, "No se pudo registrar el pago")
}

export async function anularPagoManual(id: string, motivo: string): Promise<void> {
  const { data: sesion } = await supabase.auth.getUser()
  const { error } = await supabase
    .from("pagos_manuales")
    .update({ anulado_at: new Date().toISOString(), anulado_por: sesion.user?.id ?? null, motivo_anulacion: motivo.trim() })
    .eq("id", id)
  throwIfSupabaseError(error, "No se pudo anular el pago")
}
