import { supabase } from "./config"
import type { ParticipanteSorteo, Sorteo, SorteoEstado, SorteoGanador, SorteoPremio } from "./types"

/**
 * Sorteos. Las "chances" no se persisten: se calculan on-demand a partir de
 * `ventas` con cliente asociado dentro del rango de fechas del sorteo (ver
 * `getParticipantes`). El sorteo en sí (`elegirGanador`) es puro y testeado
 * sin tocar la base, para poder confiar en el mecanismo de azar ponderado.
 */

type Fila = Record<string, unknown>

function aPremio(f: Fila): SorteoPremio {
  return {
    id: f.id as string,
    orden: Number(f.orden) || 0,
    nombre: (f.nombre as string) ?? "",
    descripcion: (f.descripcion as string) ?? undefined,
    fotoUrl: (f.foto_url as string) ?? undefined,
  }
}

function aGanador(f: Fila): SorteoGanador {
  return {
    premioId: f.premio_id as string,
    clienteId: f.cliente_id as string,
    clienteNombre: (f.cliente_nombre as string) ?? "",
    ventaId: f.venta_id as string,
    ventaNumero: Number(f.venta_numero) || 0,
    sorteadoEn: f.sorteado_en as string,
  }
}

function aSorteo(f: Fila, premios: Fila[], ganadores: Fila[]): Sorteo {
  return {
    id: f.id as string,
    nombre: (f.nombre as string) ?? "",
    descripcion: (f.descripcion as string) ?? undefined,
    fotoUrl: (f.foto_url as string) ?? undefined,
    desde: f.desde as string,
    hasta: f.hasta as string,
    estado: (f.estado as SorteoEstado) ?? "borrador",
    premios: premios.map(aPremio).sort((a, b) => a.orden - b.orden),
    ganadores: ganadores.map(aGanador),
    createdAt: (f.created_at as string) ?? undefined,
    updatedAt: (f.updated_at as string) ?? undefined,
  }
}

function mensajeError(error: { message: string }, accion: string): Error {
  return new Error(`${accion}: ${error.message}`)
}

const SELECT_SORTEO = "*, sorteo_premios(*), sorteo_ganadores(*, clientes(nombre), ventas(numero))"

export async function getSorteos(tenantId: string): Promise<Sorteo[]> {
  const { data, error } = await supabase
    .from("sorteos").select(SELECT_SORTEO)
    .eq("tenant_id", tenantId)
    .order("desde", { ascending: false })
  if (error) throw mensajeError(error, "No se pudieron cargar los sorteos")

  return (data ?? []).map((f: Fila) => {
    const ganadores = ((f.sorteo_ganadores as Fila[]) ?? []).map((g) => ({
      ...g,
      cliente_nombre: (g.clientes as Fila)?.nombre,
      venta_numero: (g.ventas as Fila)?.numero,
    }))
    return aSorteo(f, (f.sorteo_premios as Fila[]) ?? [], ganadores)
  })
}

export interface SorteoInput {
  nombre: string
  descripcion?: string
  fotoUrl?: string | null
  desde: string
  hasta: string
  premios: Pick<SorteoPremio, "orden" | "nombre" | "descripcion" | "fotoUrl">[]
}

export async function createSorteo(tenantId: string, input: SorteoInput): Promise<Sorteo> {
  const { data: creado, error } = await supabase
    .from("sorteos")
    .insert({
      tenant_id: tenantId, nombre: input.nombre, descripcion: input.descripcion || null,
      foto_url: input.fotoUrl || null, desde: input.desde, hasta: input.hasta, estado: "activo",
    })
    .select("*").single()
  if (error) throw mensajeError(error, "No se pudo crear el sorteo")

  const premios = input.premios.map((p) => ({
    sorteo_id: creado.id, orden: p.orden, nombre: p.nombre,
    descripcion: p.descripcion || null, foto_url: p.fotoUrl || null,
  }))
  const { error: errorPremios } = await supabase.from("sorteo_premios").insert(premios)
  if (errorPremios) throw mensajeError(errorPremios, "No se pudieron guardar los premios")

  return aSorteo(creado, premios, [])
}

/** Participantes agrupados por cliente, ordenados de más a menos chances. */
export async function getParticipantes(tenantId: string, sorteo: Pick<Sorteo, "desde" | "hasta">): Promise<ParticipanteSorteo[]> {
  // Los limites se arman en hora local y se convierten a UTC: `created_at`
  // es timestamptz y PostgREST interpreta un string sin offset en la zona de
  // la sesion (UTC en Supabase), no en la hora local del tenant.
  const desde = new Date(`${sorteo.desde}T00:00:00`).toISOString()
  const hasta = new Date(`${sorteo.hasta}T23:59:59.999`).toISOString()

  const { data, error } = await supabase
    .from("ventas")
    .select("id, cliente_id, cliente_nombre")
    .eq("tenant_id", tenantId)
    .eq("estado", "completada")
    .not("cliente_id", "is", null)
    .gte("created_at", desde)
    .lte("created_at", hasta)
  if (error) throw mensajeError(error, "No se pudieron cargar los participantes")

  const porCliente = new Map<string, ParticipanteSorteo>()
  for (const venta of data ?? []) {
    const clienteId = venta.cliente_id as string
    const actual = porCliente.get(clienteId)
    if (actual) {
      actual.chances += 1
      actual.ventaIds.push(venta.id as string)
    } else {
      porCliente.set(clienteId, {
        clienteId, clienteNombre: (venta.cliente_nombre as string) ?? "",
        chances: 1, ventaIds: [venta.id as string],
      })
    }
  }
  return [...porCliente.values()].sort((a, b) => b.chances - a.chances)
}

/**
 * Elige un ganador entre los participantes, con probabilidad proporcional a
 * su cantidad de chances (una "bolita" por chance). `random` e `indiceVenta`
 * son inyectables para poder testear el sorteo sin depender de `Math.random`.
 */
export function elegirGanador(
  participantes: ParticipanteSorteo[],
  random: () => number = Math.random,
  randomVenta: () => number = Math.random,
): (ParticipanteSorteo & { ventaId: string }) | null {
  const totalChances = participantes.reduce((acc, p) => acc + p.chances, 0)
  if (totalChances <= 0) return null

  const r = random() * totalChances
  let acumulado = 0
  for (const p of participantes) {
    acumulado += p.chances
    if (r < acumulado) {
      const indice = Math.min(p.ventaIds.length - 1, Math.floor(randomVenta() * p.ventaIds.length))
      return { ...p, ventaId: p.ventaIds[indice] }
    }
  }
  // No debería llegar acá salvo error de punto flotante al borde: devuelve el último.
  const ultimo = participantes[participantes.length - 1]
  return { ...ultimo, ventaId: ultimo.ventaIds[0] }
}

/**
 * Sortea todos los premios de un sorteo, sin repetir cliente entre premios, y
 * graba los resultados. Idempotente-no: llamarla dos veces sobre un sorteo ya
 * finalizado falla por la constraint `unique (premio_id)` en `sorteo_ganadores`.
 */
export async function sortear(tenantId: string, sorteoId: string): Promise<SorteoGanador[]> {
  const sorteos = await getSorteos(tenantId)
  const sorteo = sorteos.find((s) => s.id === sorteoId)
  if (!sorteo) throw new Error("Sorteo no encontrado")
  if (sorteo.estado === "finalizado") throw new Error("Este sorteo ya fue sorteado")

  const participantes = await getParticipantes(tenantId, sorteo)
  const disponibles = [...participantes]
  const resultados: { premioId: string; clienteId: string; ventaId: string }[] = []

  for (const premio of sorteo.premios) {
    const ganador = elegirGanador(disponibles)
    if (!ganador) break // sin participantes: el premio queda sin ganador
    resultados.push({ premioId: premio.id!, clienteId: ganador.clienteId, ventaId: ganador.ventaId })
    const i = disponibles.findIndex((p) => p.clienteId === ganador.clienteId)
    if (i >= 0) disponibles.splice(i, 1) // no repite cliente entre premios
  }

  if (resultados.length > 0) {
    const { error: errorInsert } = await supabase.from("sorteo_ganadores").insert(
      resultados.map((r) => ({ sorteo_id: sorteoId, premio_id: r.premioId, cliente_id: r.clienteId, venta_id: r.ventaId })),
    )
    if (errorInsert) throw mensajeError(errorInsert, "No se pudo guardar el resultado del sorteo")
  }

  const { error: errorEstado } = await supabase
    .from("sorteos").update({ estado: "finalizado", updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId).eq("id", sorteoId)
  if (errorEstado) throw mensajeError(errorEstado, "No se pudo cerrar el sorteo")

  return (await getSorteos(tenantId)).find((s) => s.id === sorteoId)?.ganadores ?? []
}
