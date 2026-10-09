import { supabase } from "./config"
import { throwIfSupabaseError } from "./assert"
import type { Gasto, GastoFijo } from "./types"
import { sumarMeses } from "@/lib/gastos/meses"

/**
 * Gastos del negocio: fijos mensuales y por única vez (ver 047_gastos.sql).
 *
 * Las plantillas de gastos fijos y sus montos por mes se escriben directo (RLS
 * con `es_staff`). Los pagos van por RPC (`registrar_gasto`, `anular_gasto`)
 * porque pueden quedar imputados a la caja abierta, y ese vínculo lo asigna la
 * base, no el cliente.
 */

type Fila = Record<string, unknown>

function num(v: unknown, porDefecto = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : porDefecto
}

function aGastoFijo(f: Fila): GastoFijo {
  return {
    id: f.id as string,
    descripcion: (f.descripcion as string) ?? "",
    categoria: (f.categoria as string) ?? "",
    monto: num(f.monto),
    diaVencimiento: f.dia_vencimiento != null ? num(f.dia_vencimiento) : undefined,
    desdeMes: (f.desde_mes as string) ?? "",
    hastaMes: (f.hasta_mes as string) ?? undefined,
  }
}

function aGasto(f: Fila): Gasto {
  return {
    id: f.id as string,
    descripcion: (f.descripcion as string) ?? "",
    categoria: (f.categoria as string) ?? "",
    monto: num(f.monto),
    fecha: (f.fecha as string) ?? "",
    gastoFijoId: (f.gasto_fijo_id as string) ?? undefined,
    mes: (f.mes as string) ?? undefined,
    cajaId: (f.caja_id as string) ?? undefined,
    registradoPorNombre: (f.registrado_por_nombre as string) ?? undefined,
    observaciones: (f.observaciones as string) ?? "",
    createdAt: (f.created_at as string) ?? "",
    anuladoAt: (f.anulado_at as string) ?? undefined,
    anuladoMotivo: (f.anulado_motivo as string) ?? undefined,
    anuladoPorNombre: (f.anulado_por_nombre as string) ?? undefined,
  }
}

// ── Gastos fijos ──

/** Todas las plantillas del tenant, incluidas las dadas de baja. */
export async function getGastosFijos(tenantId: string): Promise<GastoFijo[]> {
  const { data, error } = await supabase
    .from("gastos_fijos").select("*")
    .eq("tenant_id", tenantId)
    .order("descripcion")
  throwIfSupabaseError(error, "Error al listar gastos fijos")
  return (data ?? []).map(aGastoFijo)
}

export interface GastoFijoInput {
  descripcion: string
  categoria: string
  monto: number
  diaVencimiento?: number
  desdeMes: string
}

export async function crearGastoFijo(tenantId: string, input: GastoFijoInput): Promise<void> {
  const { error } = await supabase.from("gastos_fijos").insert({
    tenant_id: tenantId,
    descripcion: input.descripcion.trim(),
    categoria: input.categoria.trim(),
    monto: input.monto,
    dia_vencimiento: input.diaVencimiento ?? null,
    desde_mes: input.desdeMes,
  })
  throwIfSupabaseError(error, "Error al crear gasto fijo")
}

export async function actualizarGastoFijo(id: string, input: GastoFijoInput): Promise<void> {
  const { error } = await supabase.from("gastos_fijos").update({
    descripcion: input.descripcion.trim(),
    categoria: input.categoria.trim(),
    monto: input.monto,
    dia_vencimiento: input.diaVencimiento ?? null,
    desde_mes: input.desdeMes,
  }).eq("id", id)
  throwIfSupabaseError(error, "Error al actualizar gasto fijo")
}

/**
 * Da de baja un gasto fijo: deja de correr DESPUÉS de `ultimoMes`. No se borra
 * para que los meses anteriores sigan figurando en el historial.
 */
export async function darDeBajaGastoFijo(id: string, ultimoMes: string): Promise<void> {
  const { error } = await supabase.from("gastos_fijos")
    .update({ hasta_mes: ultimoMes }).eq("id", id)
  throwIfSupabaseError(error, "Error al dar de baja el gasto fijo")
}

export async function reactivarGastoFijo(id: string): Promise<void> {
  const { error } = await supabase.from("gastos_fijos")
    .update({ hasta_mes: null }).eq("id", id)
  throwIfSupabaseError(error, "Error al reactivar el gasto fijo")
}

/** Borra la plantilla. Los pagos ya registrados quedan, sin vínculo. */
export async function eliminarGastoFijo(id: string): Promise<void> {
  const { error } = await supabase.from("gastos_fijos").delete().eq("id", id)
  throwIfSupabaseError(error, "Error al eliminar gasto fijo")
}

// ── Montos por mes ──

/** `gastoFijoId → mes → monto` para los meses del rango, inclusive. */
export async function getMontosPorMes(
  tenantId: string,
  desde: string,
  hasta: string,
): Promise<Map<string, Map<string, number>>> {
  const { data, error } = await supabase
    .from("gastos_fijos_montos").select("gasto_fijo_id, mes, monto")
    .eq("tenant_id", tenantId)
    .gte("mes", desde).lte("mes", hasta)
  throwIfSupabaseError(error, "Error al cargar montos por mes")

  const mapa = new Map<string, Map<string, number>>()
  for (const f of (data ?? []) as Fila[]) {
    const id = f.gasto_fijo_id as string
    if (!mapa.has(id)) mapa.set(id, new Map())
    mapa.get(id)!.set(f.mes as string, num(f.monto))
  }
  return mapa
}

/**
 * Fija el monto de un gasto fijo para cada uno de los meses indicados. Un
 * `null` vuelve ese mes al monto base.
 */
export async function guardarMontosPorMes(
  tenantId: string,
  gastoFijoId: string,
  montos: { mes: string; monto: number | null }[],
): Promise<void> {
  const fijar = montos.filter((m) => m.monto != null)
  const limpiar = montos.filter((m) => m.monto == null).map((m) => m.mes)

  if (fijar.length > 0) {
    const { error } = await supabase.from("gastos_fijos_montos").upsert(
      fijar.map((m) => ({
        gasto_fijo_id: gastoFijoId,
        tenant_id: tenantId,
        mes: m.mes,
        monto: m.monto,
      })),
      { onConflict: "gasto_fijo_id,mes" },
    )
    throwIfSupabaseError(error, "Error al guardar montos por mes")
  }

  if (limpiar.length > 0) {
    const { error } = await supabase.from("gastos_fijos_montos").delete()
      .eq("gasto_fijo_id", gastoFijoId).in("mes", limpiar)
    throwIfSupabaseError(error, "Error al limpiar montos por mes")
  }
}

// ── Gastos pagados ──

/**
 * Gastos de un mes: los por única vez con fecha en el mes y los pagos de fijos
 * imputados a ese mes (aunque se hayan pagado en otra fecha).
 */
export async function getGastosDelMes(tenantId: string, mes: string): Promise<Gasto[]> {
  const siguiente = sumarMeses(mes, 1)
  const { data, error } = await supabase
    .from("gastos").select("*")
    .eq("tenant_id", tenantId)
    .or(`mes.eq.${mes},and(mes.is.null,fecha.gte.${mes},fecha.lt.${siguiente})`)
    .order("fecha", { ascending: false })
  throwIfSupabaseError(error, "Error al listar gastos")
  return (data ?? []).map(aGasto)
}

export interface RegistrarGastoInput {
  descripcion: string
  categoria: string
  monto: number
  /** "YYYY-MM-DD" */
  fecha: string
  descontarDeCaja: boolean
  gastoFijoId?: string
  mes?: string
  observaciones?: string
}

export async function registrarGasto(tenantId: string, input: RegistrarGastoInput): Promise<void> {
  const { error } = await supabase.rpc("registrar_gasto", {
    p_tenant_id: tenantId,
    p_descripcion: input.descripcion,
    p_categoria: input.categoria,
    p_monto: input.monto,
    p_fecha: input.fecha,
    p_descontar_caja: input.descontarDeCaja,
    p_gasto_fijo_id: input.gastoFijoId ?? null,
    p_mes: input.mes ?? null,
    p_observaciones: input.observaciones ?? null,
  })
  if (error) throw new Error(error.message)
}

/**
 * ¿Se puede borrar un gasto? Solo con `npm run dev` en localhost, para limpiar
 * pruebas. En producción los gastos únicamente se anulan.
 */
export function puedeEliminarGastos(): boolean {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return false
  return ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
}

/** Borra un gasto de verdad. Solo funciona en desarrollo (ver `app/api/gastos/eliminar`). */
export async function eliminarGastoDev(id: string): Promise<void> {
  const { data: sesion } = await supabase.auth.getSession()
  const res = await fetch("/api/gastos/eliminar", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sesion.session?.access_token ?? ""}`,
    },
    body: JSON.stringify({ gastoId: id }),
  })
  const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
  if (!res.ok || !json?.ok) throw new Error(json?.error ?? "No se pudo eliminar el gasto")
}

/**
 * Anula un gasto cargado por error. No se borra: queda guardado con el motivo,
 * y deja de sumar en los totales y en el esperado de la caja.
 */
export async function anularGasto(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc("anular_gasto", { p_gasto_id: id, p_motivo: motivo })
  if (error) throw new Error(error.message)
}
