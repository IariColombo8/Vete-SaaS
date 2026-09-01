import { supabase } from "./config"
import type {
  ParticipanteSorteo, Sorteo, SorteoCompraModo, SorteoEstado, SorteoGanador, SorteoMecanicas, SorteoPremio,
} from "./types"

/**
 * Sorteos. Las "chances" no se persisten como conteo: se calculan on-demand
 * combinando hasta tres mecánicas configurables por sorteo (ver `mecanicas`
 * en `Sorteo`):
 *  - registro: 1 chance por ser cliente de la base (cualquiera).
 *  - compra: 1 chance por venta, o 1 chance cada $X acumulados (a elección).
 *  - foto: 1 chance por foto de mascota subida durante la vigencia (tabla
 *    `sorteo_participaciones`).
 * El sorteo en sí (`elegirGanador`) es puro y testeado sin tocar la base.
 */

type Fila = Record<string, unknown>

function num(v: unknown, porDefecto = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : porDefecto
}

function aPremio(f: Fila): SorteoPremio {
  return {
    id: f.id as string,
    orden: Number(f.orden) || 0,
    nombre: (f.nombre as string) ?? "",
    descripcion: (f.descripcion as string) ?? undefined,
    fotoUrl: (f.foto_url as string) ?? undefined,
    productoId: (f.producto_id as string) ?? undefined,
  }
}

function aGanador(f: Fila): SorteoGanador {
  return {
    premioId: f.premio_id as string,
    clienteId: f.cliente_id as string,
    clienteNombre: (f.cliente_nombre as string) ?? "",
    ventaId: (f.venta_id as string) ?? undefined,
    ventaNumero: f.venta_numero != null ? Number(f.venta_numero) : undefined,
    sorteadoEn: f.sorteado_en as string,
  }
}

function aMecanicas(f: Fila): SorteoMecanicas {
  return {
    registro: (f.chance_por_registro as boolean) ?? true,
    compra: (f.chance_por_compra as boolean) ?? true,
    compraModo: ((f.compra_modo as SorteoCompraModo) ?? "venta"),
    compraMontoUmbral: f.compra_monto_umbral != null ? num(f.compra_monto_umbral) : undefined,
    foto: (f.chance_por_foto as boolean) ?? false,
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
    mecanicas: aMecanicas(f),
    createdAt: (f.created_at as string) ?? undefined,
    updatedAt: (f.updated_at as string) ?? undefined,
  }
}

function mensajeError(error: { message: string }, accion: string): Error {
  return new Error(`${accion}: ${error.message}`)
}

const SELECT_SORTEO = "*, sorteo_premios(*), sorteo_ganadores(*, clientes(nombre), ventas(numero))"

function aSorteosDesdeFilas(data: Fila[]): Sorteo[] {
  return (data ?? []).map((f) => {
    const ganadores = ((f.sorteo_ganadores as Fila[]) ?? []).map((g) => ({
      ...g,
      cliente_nombre: (g.clientes as Fila)?.nombre,
      venta_numero: (g.ventas as Fila)?.numero,
    }))
    return aSorteo(f, (f.sorteo_premios as Fila[]) ?? [], ganadores)
  })
}

export async function getSorteos(tenantId: string): Promise<Sorteo[]> {
  const { data, error } = await supabase
    .from("sorteos").select(SELECT_SORTEO)
    .eq("tenant_id", tenantId)
    .order("desde", { ascending: false })
  if (error) throw mensajeError(error, "No se pudieron cargar los sorteos")
  return aSorteosDesdeFilas((data ?? []) as Fila[])
}

/** El sorteo activo para mostrar en el banner del home público (o null si no hay). */
export async function getSorteoActivo(tenantId: string): Promise<Sorteo | null> {
  const { data, error } = await supabase
    .from("sorteos").select(SELECT_SORTEO)
    .eq("tenant_id", tenantId)
    .eq("estado", "activo")
    .order("desde", { ascending: false })
    .limit(1)
  if (error) {
    console.error("Error cargando el sorteo activo:", error.message)
    return null
  }
  return aSorteosDesdeFilas((data ?? []) as Fila[])[0] ?? null
}

/**
 * Historial de sorteos ya finalizados para el home público, con sus
 * ganadores. No usa el select anidado de `getSorteos` (que trae `clientes`
 * directo) porque `clientes` es estrictamente staff-only — acá los ganadores
 * se piden vía la RPC `obtener_ganadores_sorteo_publico`, que solo expone
 * nombre y premio, nada más de la ficha del cliente.
 */
export async function getSorteosFinalizadosPublicados(tenantId: string): Promise<Sorteo[]> {
  const { data, error } = await supabase
    .from("sorteos").select("*, sorteo_premios(*)")
    .eq("tenant_id", tenantId)
    .eq("estado", "finalizado")
    .order("hasta", { ascending: false })
  if (error) {
    console.error("Error cargando el historial de sorteos:", error.message)
    return []
  }

  return Promise.all(
    ((data ?? []) as Fila[]).map(async (f) => {
      const { data: ganadores } = await supabase.rpc("obtener_ganadores_sorteo_publico", { p_sorteo_id: f.id })
      const filas = ((ganadores ?? []) as Fila[]).map((g) => ({
        premio_id: g.premio_id, cliente_id: g.cliente_id, cliente_nombre: g.cliente_nombre, sorteado_en: g.sorteado_en,
      }))
      return aSorteo(f, (f.sorteo_premios as Fila[]) ?? [], filas)
    }),
  )
}

export interface SorteoInput {
  nombre: string
  descripcion?: string
  fotoUrl?: string | null
  desde: string
  hasta: string
  premios: Pick<SorteoPremio, "orden" | "nombre" | "descripcion" | "fotoUrl" | "productoId">[]
  mecanicas: SorteoMecanicas
}

export async function createSorteo(tenantId: string, input: SorteoInput): Promise<Sorteo> {
  const { data: creado, error } = await supabase
    .from("sorteos")
    .insert({
      tenant_id: tenantId, nombre: input.nombre, descripcion: input.descripcion || null,
      foto_url: input.fotoUrl || null, desde: input.desde, hasta: input.hasta, estado: "activo",
      chance_por_registro: input.mecanicas.registro,
      chance_por_compra: input.mecanicas.compra,
      compra_modo: input.mecanicas.compraModo,
      compra_monto_umbral: input.mecanicas.compraModo === "monto" ? input.mecanicas.compraMontoUmbral ?? null : null,
      chance_por_foto: input.mecanicas.foto,
    })
    .select("*").single()
  if (error) throw mensajeError(error, "No se pudo crear el sorteo")

  const premios = input.premios.map((p) => ({
    sorteo_id: creado.id, orden: p.orden, nombre: p.nombre,
    descripcion: p.descripcion || null, foto_url: p.fotoUrl || null, producto_id: p.productoId || null,
  }))
  const { error: errorPremios } = await supabase.from("sorteo_premios").insert(premios)
  if (errorPremios) throw mensajeError(errorPremios, "No se pudieron guardar los premios")

  return aSorteo(creado, premios, [])
}

/**
 * Edita un sorteo no finalizado: nombre, fechas, mecánicas y premios (se
 * reemplazan todos, mismo criterio que `updatePromocion` con sus items). No
 * permitido sobre un sorteo ya finalizado — ahí los premios ya tienen
 * ganadores asociados (`sorteo_ganadores.premio_id`) y borrarlos rompería esa
 * referencia.
 */
export async function updateSorteo(tenantId: string, id: string, input: SorteoInput): Promise<void> {
  const { data: actual, error: errorActual } = await supabase
    .from("sorteos").select("estado").eq("tenant_id", tenantId).eq("id", id).single()
  if (errorActual) throw mensajeError(errorActual, "No se pudo cargar el sorteo")
  if (actual.estado === "finalizado") throw new Error("Este sorteo ya fue sorteado, no se puede editar")

  const { error } = await supabase
    .from("sorteos")
    .update({
      nombre: input.nombre, descripcion: input.descripcion || null,
      foto_url: input.fotoUrl || null,
      desde: input.desde, hasta: input.hasta,
      chance_por_registro: input.mecanicas.registro,
      chance_por_compra: input.mecanicas.compra,
      compra_modo: input.mecanicas.compraModo,
      compra_monto_umbral: input.mecanicas.compraModo === "monto" ? input.mecanicas.compraMontoUmbral ?? null : null,
      chance_por_foto: input.mecanicas.foto,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId).eq("id", id)
  if (error) throw mensajeError(error, "No se pudo actualizar el sorteo")

  const { error: errorBorrado } = await supabase.from("sorteo_premios").delete().eq("sorteo_id", id)
  if (errorBorrado) throw mensajeError(errorBorrado, "No se pudieron actualizar los premios")

  const premios = input.premios.map((p) => ({
    sorteo_id: id, orden: p.orden, nombre: p.nombre,
    descripcion: p.descripcion || null, foto_url: p.fotoUrl || null, producto_id: p.productoId || null,
  }))
  const { error: errorPremios } = await supabase.from("sorteo_premios").insert(premios)
  if (errorPremios) throw mensajeError(errorPremios, "No se pudieron guardar los premios")
}

/**
 * Cancela un sorteo no finalizado (se borra: cascada se lleva premios y, si
 * hubiera, participaciones por foto). Sobre uno finalizado no tiene sentido
 * "cancelar" — ya tiene ganadores registrados.
 */
export async function cancelarSorteo(tenantId: string, id: string): Promise<void> {
  const { data: actual, error: errorActual } = await supabase
    .from("sorteos").select("estado").eq("tenant_id", tenantId).eq("id", id).single()
  if (errorActual) throw mensajeError(errorActual, "No se pudo cargar el sorteo")
  if (actual.estado === "finalizado") throw new Error("Este sorteo ya fue sorteado, no se puede cancelar")

  const { error } = await supabase.from("sorteos").delete().eq("tenant_id", tenantId).eq("id", id)
  if (error) throw mensajeError(error, "No se pudo cancelar el sorteo")
}

/** Participantes agrupados por cliente, ordenados de más a menos chances. */
export async function getParticipantes(tenantId: string, sorteo: Pick<Sorteo, "id" | "desde" | "hasta" | "mecanicas">): Promise<ParticipanteSorteo[]> {
  // Los limites se arman en hora local y se convierten a UTC: `created_at`
  // es timestamptz y PostgREST interpreta un string sin offset en la zona de
  // la sesion (UTC en Supabase), no en la hora local del tenant.
  const desde = new Date(`${sorteo.desde}T00:00:00`).toISOString()
  const hasta = new Date(`${sorteo.hasta}T23:59:59.999`).toISOString()
  const { registro, compra, compraModo, compraMontoUmbral, foto } = sorteo.mecanicas

  const porCliente = new Map<string, ParticipanteSorteo>()
  const sumar = (clienteId: string, clienteNombre: string, chances: number, ventaId?: string) => {
    if (chances <= 0) return
    const actual = porCliente.get(clienteId)
    if (actual) {
      actual.chances += chances
      if (ventaId) actual.ventaIds.push(ventaId)
    } else {
      porCliente.set(clienteId, { clienteId, clienteNombre, chances, ventaIds: ventaId ? [ventaId] : [] })
    }
  }

  if (registro) {
    // Requiere participación explícita en ESTE sorteo (tocar "Registrate y
    // participá"), no cuenta a todo cliente viejo de la base sin que haga nada.
    const { data, error } = await supabase
      .from("sorteo_participaciones")
      .select("cliente_id, clientes(nombre)")
      .eq("sorteo_id", sorteo.id)
      .eq("tipo", "registro")
    if (error) throw mensajeError(error, "No se pudieron cargar las participaciones de registro")
    for (const p of data ?? []) {
      const clientes = p.clientes as unknown as Fila | Fila[] | null
      const cliente = Array.isArray(clientes) ? clientes[0] : clientes
      sumar(p.cliente_id as string, (cliente?.nombre as string) ?? "", 1)
    }
  }

  if (compra) {
    const { data, error } = await supabase
      .from("ventas")
      .select("id, cliente_id, cliente_nombre, total")
      .eq("tenant_id", tenantId)
      .eq("estado", "completada")
      .not("cliente_id", "is", null)
      .gte("created_at", desde)
      .lte("created_at", hasta)
    if (error) throw mensajeError(error, "No se pudieron cargar las ventas del sorteo")

    if (compraModo === "monto" && compraMontoUmbral && compraMontoUmbral > 0) {
      const totalPorCliente = new Map<string, { nombre: string; total: number; ventaIds: string[] }>()
      for (const venta of data ?? []) {
        const clienteId = venta.cliente_id as string
        const actual = totalPorCliente.get(clienteId)
        if (actual) {
          actual.total += num(venta.total)
          actual.ventaIds.push(venta.id as string)
        } else {
          totalPorCliente.set(clienteId, {
            nombre: (venta.cliente_nombre as string) ?? "", total: num(venta.total), ventaIds: [venta.id as string],
          })
        }
      }
      for (const [clienteId, v] of totalPorCliente) {
        const chances = Math.floor(v.total / compraMontoUmbral)
        for (let i = 0; i < chances; i++) sumar(clienteId, v.nombre, 1, v.ventaIds[i % v.ventaIds.length])
      }
    } else {
      for (const venta of data ?? []) {
        sumar(venta.cliente_id as string, (venta.cliente_nombre as string) ?? "", 1, venta.id as string)
      }
    }
  }

  if (foto) {
    const { data, error } = await supabase
      .from("sorteo_participaciones")
      .select("cliente_id, clientes(nombre)")
      .eq("sorteo_id", sorteo.id)
      .eq("tipo", "foto_mascota")
    if (error) throw mensajeError(error, "No se pudieron cargar las participaciones por foto")
    for (const p of data ?? []) {
      const clientes = p.clientes as unknown as Fila | Fila[] | null
      const cliente = Array.isArray(clientes) ? clientes[0] : clientes
      sumar(p.cliente_id as string, (cliente?.nombre as string) ?? "", 1)
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
): (ParticipanteSorteo & { ventaId?: string }) | null {
  const totalChances = participantes.reduce((acc, p) => acc + p.chances, 0)
  if (totalChances <= 0) return null

  const r = random() * totalChances
  let acumulado = 0
  for (const p of participantes) {
    acumulado += p.chances
    if (r < acumulado) {
      if (p.ventaIds.length === 0) return { ...p, ventaId: undefined }
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
  const resultados: { premioId: string; clienteId: string; ventaId?: string }[] = []

  for (const premio of sorteo.premios) {
    const ganador = elegirGanador(disponibles)
    if (!ganador) break // sin participantes: el premio queda sin ganador
    resultados.push({ premioId: premio.id!, clienteId: ganador.clienteId, ventaId: ganador.ventaId })
    const i = disponibles.findIndex((p) => p.clienteId === ganador.clienteId)
    if (i >= 0) disponibles.splice(i, 1) // no repite cliente entre premios
  }

  if (resultados.length > 0) {
    const { error: errorInsert } = await supabase.from("sorteo_ganadores").insert(
      resultados.map((r) => ({
        sorteo_id: sorteoId, premio_id: r.premioId, cliente_id: r.clienteId, venta_id: r.ventaId ?? null,
      })),
    )
    if (errorInsert) throw mensajeError(errorInsert, "No se pudo guardar el resultado del sorteo")
  }

  const { error: errorEstado } = await supabase
    .from("sorteos").update({ estado: "finalizado", updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId).eq("id", sorteoId)
  if (errorEstado) throw mensajeError(errorEstado, "No se pudo cerrar el sorteo")

  return (await getSorteos(tenantId)).find((s) => s.id === sorteoId)?.ganadores ?? []
}

/**
 * Foto ya subida por ese cliente (DNI) para este sorteo, o null si todavía no
 * participó con esta mecánica. Se usa para avisar "ya subiste una foto,
 * ¿reemplazar?" en vez de dejar acumular participaciones sin darse cuenta.
 */
export async function getFotoParticipacionExistente(
  tenantId: string,
  sorteoId: string,
  dni: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("obtener_participacion_foto_publico", {
    p_tenant: tenantId,
    p_sorteo_id: sorteoId,
    p_dni: dni,
  })
  if (error) throw mensajeError(error, "No se pudo verificar tu participación")
  return (data as string | null) ?? null
}

/**
 * Registra la participación por foto de mascota desde el banner público (sin
 * sesión). Busca el cliente por DNI vía la RPC `security definer`; si no
 * existe, el llamador debe mandar primero al alta de cliente y reintentar.
 * Si ya había subido una foto para este sorteo, la reemplaza (no acumula).
 */
export async function subirFotoParticipacion(
  tenantId: string,
  sorteoId: string,
  dni: string,
  fotoUrl: string,
): Promise<void> {
  const { error } = await supabase.rpc("registrar_participacion_foto_publico", {
    p_tenant: tenantId,
    p_sorteo_id: sorteoId,
    p_dni: dni,
    p_foto_url: fotoUrl,
  })
  if (error) {
    if (error.message.includes("CLIENTE_NOT_FOUND")) {
      throw new Error("No encontramos un cliente con ese DNI. Registrate primero.")
    }
    throw mensajeError(error, "No se pudo registrar la participación")
  }
}

/**
 * Registra la chance de "cliente registrado" para ESTE sorteo puntual (no
 * alcanza con ser cliente viejo de la base: hay que tocar "Registrate y
 * participá" en cada sorteo). Idempotente: `on conflict do nothing` en la RPC.
 */
export async function registrarParticipacionRegistro(
  tenantId: string,
  sorteoId: string,
  dni: string,
): Promise<void> {
  const { error } = await supabase.rpc("registrar_participacion_registro_publico", {
    p_tenant: tenantId,
    p_sorteo_id: sorteoId,
    p_dni: dni,
  })
  if (error) {
    if (error.message.includes("CLIENTE_NOT_FOUND")) {
      throw new Error("No encontramos un cliente con ese DNI. Registrate primero.")
    }
    throw mensajeError(error, "No se pudo registrar tu participación")
  }
}

export interface FotoParticipacion {
  id: string
  clienteNombre: string
  fotoUrl: string
  createdAt: string
}

/** Fotos subidas para un sorteo, para que el admin las vea y las guarde. */
export async function getFotosParticipacion(sorteoId: string): Promise<FotoParticipacion[]> {
  const { data, error } = await supabase
    .from("sorteo_participaciones")
    .select("id, foto_url, created_at, clientes(nombre)")
    .eq("sorteo_id", sorteoId)
    .eq("tipo", "foto_mascota")
    .order("created_at", { ascending: false })
  if (error) throw mensajeError(error, "No se pudieron cargar las fotos")

  return (data ?? []).map((f: Fila) => {
    const clientes = f.clientes as unknown as Fila | Fila[] | null
    const cliente = Array.isArray(clientes) ? clientes[0] : clientes
    return {
      id: f.id as string,
      clienteNombre: (cliente?.nombre as string) ?? "",
      fotoUrl: f.foto_url as string,
      createdAt: f.created_at as string,
    }
  })
}

/**
 * Rechaza una foto de mascota (staff): borra la participación y con ella la
 * chance que había sumado. Para fotos que no tienen nada que ver con una
 * mascota o el sorteo.
 */
export async function rechazarFotoParticipacion(participacionId: string): Promise<void> {
  const { error } = await supabase.from("sorteo_participaciones").delete().eq("id", participacionId)
  if (error) throw mensajeError(error, "No se pudo rechazar la imagen")
}
