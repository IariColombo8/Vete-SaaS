import { supabase } from "./config"
import type { Cliente, ClientesCursor, ClientesPage, ClientesStats, HistorialDato } from "./types"

export type { ClientesStats } from "./types"

/**
 * Clientes. En Firestore el docId era el DNI; acá la PK es un uuid y el DNI
 * es `unique (tenant_id, dni)`. Los IDs que circulan por la app siguen siendo
 * strings opacos, así que los componentes no cambian.
 */

type Fila = Record<string, unknown>

function aCliente(f: Fila): Cliente {
  return {
    id: f.id as string,
    nombre: (f.nombre as string) ?? "",
    telefono: (f.telefono as string) ?? "",
    email: (f.email as string) ?? "",
    dni: (f.dni as string) ?? "",
    domicilio: (f.domicilio as string) ?? "",
    historialDatos: (f.historial_datos as HistorialDato[]) ?? [],
    createdAt: (f.created_at as string) ?? undefined,
    updatedAt: (f.updated_at as string) ?? undefined,
  }
}

const COLS_BASIC = "id, nombre, telefono, email, dni, domicilio, created_at, updated_at"

// El cálculo y la auditoría de `historialDatos` ahora corren en Postgres
// (ver supabase/020_clientes_publico.sql), para que también funcionen sin
// sesión desde el formulario público.

export async function getClienteByDNI(tenantId: string, dni: string): Promise<Cliente | null> {
  if (!dni?.trim()) return null
  const { data } = await supabase
    .rpc("buscar_cliente_publico", { p_tenant: tenantId, p_dni: dni.trim() })
  const fila = Array.isArray(data) ? data[0] : data
  return fila ? aCliente(fila) : null
}

export async function getClienteByEmail(tenantId: string, email: string): Promise<Cliente | null> {
  if (!email) return null
  const { data } = await supabase
    .rpc("buscar_cliente_publico", { p_tenant: tenantId, p_email: email })
  const fila = Array.isArray(data) ? data[0] : data
  return fila ? aCliente(fila) : null
}

export interface ClienteGlobal {
  nombre: string
  telefono: string
  email: string
  domicilio: string
  mascotas: { nombre: string; tipo: string; raza?: string }[]
}

/**
 * Busca al cliente por DNI en CUALQUIER tenant (no solo el actual), para
 * autocompletar el alta cuando alguien ya es cliente de otra veterinaria en
 * VetPanel. Nunca crea nada ni trae historia clínica: solo contacto +
 * mascotas básicas, y solo se usa cuando la persona escribe su DNI a mano en
 * el formulario de registro (no hay lookup automático de fondo).
 */
export async function getClienteGlobalPorDNI(dni: string): Promise<ClienteGlobal | null> {
  if (!dni?.trim()) return null
  const { data } = await supabase.rpc("buscar_cliente_global_publico", { p_dni: dni.trim() })
  if (!data) return null
  return {
    nombre: data.nombre ?? "",
    telefono: data.telefono ?? "",
    email: data.email ?? "",
    domicilio: data.domicilio ?? "",
    mascotas: Array.isArray(data.mascotas) ? data.mascotas : [],
  }
}

/**
 * Crea el cliente, o actualiza el existente si ya hay uno con ese DNI
 * (registrando los cambios en `historialDatos`). Corre vía RPC
 * `security definer` (igual que `crear_turno`): así funciona también sin
 * sesión, para el visitante anónimo que reserva un turno o se autorregistra.
 */
export async function createCliente(
  tenantId: string,
  data: Omit<Cliente, "id">,
): Promise<{ id: string } & Cliente> {
  const { data: creado, error } = await supabase.rpc("guardar_cliente_publico", {
    p_tenant: tenantId,
    p_datos: {
      nombre: data.nombre,
      telefono: data.telefono ?? "",
      email: data.email ?? "",
      dni: data.dni?.trim() || null,
      domicilio: data.domicilio ?? null,
    },
  })

  if (error) throw new Error(`No se pudo crear el cliente: ${error.message}`)
  return aCliente(creado) as { id: string } & Cliente
}

export async function getClientes(tenantId: string): Promise<Cliente[]> {
  const { data } = await supabase
    .from("clientes").select("*").eq("tenant_id", tenantId).order("nombre")
  return (data ?? []).map(aCliente)
}

export async function getClientesBasic(tenantId: string): Promise<Cliente[]> {
  const { data } = await supabase
    .from("clientes").select(COLS_BASIC).eq("tenant_id", tenantId).order("nombre")
  return (data ?? []).map(aCliente)
}

/**
 * Paginación keyset ordenada por (nombre, id). Reemplaza el cursor de
 * Firestore; `cursor` se sigue tratando como valor opaco.
 */
export async function getClientesPaginated(
  tenantId: string,
  pageSize: number,
  cursor: ClientesCursor = null,
): Promise<ClientesPage> {
  let q = supabase
    .from("clientes").select(COLS_BASIC)
    .eq("tenant_id", tenantId)
    .order("nombre").order("id")
    .limit(pageSize)

  if (cursor) {
    // (nombre, id) > (cursor.nombre, cursor.id) — desempata por id cuando el
    // nombre se repite, que es justo lo que un `startAfter(doc)` garantizaba.
    q = q.or(
      `nombre.gt.${cursor.nombre},and(nombre.eq.${cursor.nombre},id.gt.${cursor.id})`,
    )
  }

  const { data, error } = await q
  if (error) {
    console.error("Error paginando clientes:", error.message)
    return { clientes: [], nextCursor: null, hasMore: false }
  }

  const clientes = (data ?? []).map(aCliente)
  const ultimo = clientes[clientes.length - 1]

  return {
    clientes,
    nextCursor: ultimo ? { nombre: ultimo.nombre, id: ultimo.id! } : null,
    hasMore: clientes.length === pageSize,
  }
}

/** Estadísticas rápidas para el mini dashboard: usa `count: "exact", head: true` (no trae filas). */
export async function getClientesStats(tenantId: string): Promise<ClientesStats> {
  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const [totalClientesRes, totalMascotasRes, clientesNuevosMesRes] = await Promise.all([
    supabase.from("clientes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase.from("mascotas").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase
      .from("clientes")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", inicioMes.toISOString()),
  ])

  return {
    totalClientes: totalClientesRes.count ?? 0,
    totalMascotas: totalMascotasRes.count ?? 0,
    clientesNuevosMes: clientesNuevosMesRes.count ?? 0,
  }
}

export async function getClienteCompleto(tenantId: string, clienteId: string) {
  const { data } = await supabase
    .from("clientes")
    .select("*, mascotas(*)")
    .eq("tenant_id", tenantId).eq("id", clienteId)
    .maybeSingle()

  if (!data) return null

  const { mascotas: filasMascotas, ...filaCliente } = data as Fila & { mascotas: Fila[] }
  return {
    ...aCliente(filaCliente),
    mascotas: (filasMascotas ?? []).map((m) => ({
      id: m.id as string,
      nombre: (m.nombre as string) ?? "",
      tipo: (m.tipo as string) ?? "",
      edad: (m.edad as string) ?? undefined,
      raza: (m.raza as string) ?? undefined,
      peso: (m.peso as string) ?? undefined,
      libretaToken: (m.libreta_token as string) ?? undefined,
    })),
  }
}

export async function updateCliente(
  tenantId: string,
  clienteId: string,
  data: Partial<Omit<Cliente, "id">>,
) {
  const { error } = await supabase.rpc("actualizar_cliente_publico", {
    p_tenant: tenantId,
    p_cliente_id: clienteId,
    p_datos: {
      nombre: data.nombre,
      telefono: data.telefono,
      email: data.email,
      ...(data.dni !== undefined ? { dni: data.dni } : {}),
      domicilio: data.domicilio,
    },
  })
  if (error) {
    console.error("Error actualizando cliente:", error.message)
    throw error
  }
  return { success: true, id: clienteId }
}
