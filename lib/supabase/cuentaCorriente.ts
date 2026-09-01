import { supabase } from "./config"
import type { MedioPago } from "./types"

/**
 * Cuenta corriente por cliente. El saldo no se guarda desnormalizado: se
 * calcula sumando `cuenta_corriente_movimientos` (venta suma, pago resta).
 * Con el volumen de una veterinaria (cientos de movimientos por cliente) esto
 * es una consulta liviana y evita el problema clásico de un contador que se
 * desincroniza si algo falla a mitad de camino.
 */

type Fila = Record<string, unknown>

function num(v: unknown, porDefecto = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : porDefecto
}

export interface MovimientoCtaCte {
  id: string
  tipo: "venta" | "pago"
  monto: number
  ventaId?: string
  ventaNumero?: number
  observaciones: string
  usuarioNombre?: string
  createdAt: string
}

export interface ClienteConSaldo {
  clienteId: string
  nombre: string
  telefono: string
  saldo: number
}

function aMovimiento(f: Fila): MovimientoCtaCte {
  const venta = f.ventas as Fila | null
  return {
    id: f.id as string,
    tipo: f.tipo as "venta" | "pago",
    monto: num(f.monto),
    ventaId: (f.venta_id as string) ?? undefined,
    ventaNumero: venta ? num(venta.numero) : undefined,
    observaciones: (f.observaciones as string) ?? "",
    usuarioNombre: (f.usuario_nombre as string) ?? undefined,
    createdAt: (f.created_at as string) ?? "",
  }
}

/**
 * Saldo por cliente. Trae todos los movimientos del tenant y agrupa en el
 * navegador: mismo patrón que `getMetricasVentas`, apropiado para el volumen
 * de una veterinaria.
 *
 * Devuelve a TODO cliente que alguna vez tuvo un movimiento, no solo a los
 * que deben plata hoy: un cliente que ya saldó su deuda tiene que seguir
 * apareciendo (en $0, "al día") para no perder el historial de un vistazo —
 * desaparecer de la lista apenas paga daba la falsa impresión de que se
 * había borrado el registro. Se ordena con los que deben primero.
 */
export async function getSaldosClientes(tenantId: string): Promise<ClienteConSaldo[]> {
  const { data, error } = await supabase
    .from("cuenta_corriente_movimientos")
    .select("cliente_id, tipo, monto, clientes(nombre, telefono)")
    .eq("tenant_id", tenantId)

  if (error) {
    console.error("Error calculando saldos de cuenta corriente:", error.message)
    return []
  }

  const saldos = new Map<string, { nombre: string; telefono: string; saldo: number }>()

  for (const f of (data ?? []) as Fila[]) {
    const clienteId = f.cliente_id as string
    const cliente = f.clientes as Fila | null
    const actual = saldos.get(clienteId) ?? {
      nombre: (cliente?.nombre as string) ?? "",
      telefono: (cliente?.telefono as string) ?? "",
      saldo: 0,
    }
    const monto = num(f.monto)
    actual.saldo += f.tipo === "venta" ? monto : -monto
    saldos.set(clienteId, actual)
  }

  return [...saldos.entries()]
    .map(([clienteId, v]) => ({ clienteId, ...v, saldo: Math.max(0, Math.round(v.saldo * 100) / 100) }))
    .sort((a, b) => b.saldo - a.saldo)
}

export async function getMovimientosCliente(
  tenantId: string,
  clienteId: string,
): Promise<MovimientoCtaCte[]> {
  const { data, error } = await supabase
    .from("cuenta_corriente_movimientos")
    .select("*, ventas(numero)")
    .eq("tenant_id", tenantId)
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error listando movimientos de cuenta corriente:", error.message)
    return []
  }

  return (data ?? []).map(aMovimiento)
}

/** Saldo actual de un cliente puntual (para el POS: cuánto le queda debiendo). */
export async function getSaldoCliente(tenantId: string, clienteId: string): Promise<number> {
  const movimientos = await getMovimientosCliente(tenantId, clienteId)
  const saldo = movimientos.reduce((acc, m) => acc + (m.tipo === "venta" ? m.monto : -m.monto), 0)
  return Math.round(saldo * 100) / 100
}

/**
 * Carga una deuda a mano, sin pasar por una venta del POS (ej: seña de un
 * turno, o un cobro pendiente que se sabe pero todavía no se facturó). El
 * cliente puede ser recién creado con solo el nombre — se completa después.
 */
export async function registrarCargoManualCtaCte(
  tenantId: string,
  clienteId: string,
  monto: number,
  observaciones?: string,
): Promise<void> {
  const { error } = await supabase.rpc("registrar_cargo_manual_cta_cte", {
    p_tenant_id: tenantId,
    p_cliente_id: clienteId,
    p_monto: monto,
    p_observaciones: observaciones ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function registrarPagoCtaCte(
  tenantId: string,
  clienteId: string,
  monto: number,
  medioPago: MedioPago,
  observaciones?: string,
): Promise<void> {
  const { error } = await supabase.rpc("registrar_pago_cta_cte", {
    p_tenant_id: tenantId,
    p_cliente_id: clienteId,
    p_monto: monto,
    p_medio_pago: medioPago,
    p_observaciones: observaciones ?? null,
  })
  if (error) throw new Error(error.message)
}
