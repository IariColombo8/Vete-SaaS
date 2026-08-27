import { supabase } from "./config"
import { getClientesBasic } from "./clientes"
import type { Historia, HistoriaClinicaRegistro } from "./types"

/**
 * Historias clínicas. Firmas idénticas a la versión Firestore
 * `(tenantId, clienteId, mascotaId, ...)`, aunque `mascota_id` ya alcanza.
 */

type Fila = Record<string, unknown>

function aHistoria(f: Fila): Historia {
  return {
    id: f.id as string,
    fechaAtencion: (f.fecha_atencion as string) ?? "",
    motivo: (f.motivo as string) ?? undefined,
    diagnostico: (f.diagnostico as string) ?? "",
    tratamiento: (f.tratamiento as string) ?? "",
    observaciones: (f.observaciones as string) ?? undefined,
    proximaVisita: (f.proxima_visita as string) ?? undefined,
    archivos: (f.archivos as string[]) ?? [],
    tipoVisita: (f.tipo_visita as Historia["tipoVisita"]) ?? undefined,
    turnoId: (f.turno_id as string) ?? undefined,
  }
}

// ============ REGISTRO CONSOLIDADO ============

export async function createHistoriaClinicaRegistro(
  tenantId: string,
  _clienteId: string,
  mascotaId: string,
) {
  const { error } = await supabase.from("historia_clinica").upsert(
    {
      mascota_id: mascotaId,
      tenant_id: tenantId,
      consultas: [], vacunas: [], tratamientos: [], alergias: [], cirugias: [],
    },
    { onConflict: "mascota_id" },
  )
  if (error) throw new Error(`No se pudo crear la historia clínica: ${error.message}`)
  return { mascotaId }
}

export async function getHistoriaClinicaRegistro(
  _tenantId: string,
  _clienteId: string,
  mascotaId: string,
): Promise<HistoriaClinicaRegistro | null> {
  const { data } = await supabase
    .from("historia_clinica").select("*").eq("mascota_id", mascotaId).maybeSingle()
  if (!data) return null
  return {
    consultas: data.consultas ?? [],
    vacunas: data.vacunas ?? [],
    tratamientos: data.tratamientos ?? [],
    alergias: data.alergias ?? [],
    cirugias: data.cirugias ?? [],
    fechaCreacion: data.fecha_creacion ?? "",
  }
}

export async function updateHistoriaClinicaRegistro(
  tenantId: string,
  _clienteId: string,
  mascotaId: string,
  data: Partial<HistoriaClinicaRegistro>,
) {
  const fila: Record<string, unknown> = { mascota_id: mascotaId, tenant_id: tenantId }
  if (data.consultas !== undefined) fila.consultas = data.consultas
  if (data.vacunas !== undefined) fila.vacunas = data.vacunas
  if (data.tratamientos !== undefined) fila.tratamientos = data.tratamientos
  if (data.alergias !== undefined) fila.alergias = data.alergias
  if (data.cirugias !== undefined) fila.cirugias = data.cirugias

  const { error } = await supabase
    .from("historia_clinica").upsert(fila, { onConflict: "mascota_id" })
  if (error) throw new Error(`No se pudo actualizar la historia clínica: ${error.message}`)
}

export const createHistoriaClinica = createHistoriaClinicaRegistro
export const getHistoriaClinica = getHistoriaClinicaRegistro
export const updateHistoriaClinica = updateHistoriaClinicaRegistro

// ============ COLECCIÓN DE HISTORIAS ============

/**
 * Crea una historia. A diferencia de Firestore —donde el ID era la fecha y
 * había que buscar un sufijo libre para no pisar la consulta del mismo día—
 * acá cada historia es una fila propia.
 */
/**
 * Crea una historia vía RPC `security definer` (mismo patrón que
 * `crear_turno` / `guardar_cliente_publico`): así funciona también sin
 * sesión, para el auto-sync que dispara `createTurno()` al reservar un
 * turno público.
 */
export async function createHistoria(
  tenantId: string,
  _clienteId: string,
  mascotaId: string,
  historiaData: Omit<Historia, "id">,
) {
  const { data, error } = await supabase.rpc("crear_historia_publica", {
    p_tenant: tenantId,
    p_mascota_id: mascotaId,
    p_datos: {
      fechaAtencion: historiaData.fechaAtencion || new Date().toISOString().slice(0, 10),
      motivo: historiaData.motivo ?? "Consulta general",
      diagnostico: historiaData.diagnostico ?? "",
      tratamiento: historiaData.tratamiento ?? "—",
      observaciones: historiaData.observaciones ?? "",
      proximaVisita: historiaData.proximaVisita || null,
      archivos: historiaData.archivos ?? [],
      tipoVisita: historiaData.tipoVisita ?? "consulta",
      turnoId: historiaData.turnoId || null,
    },
  })

  if (error) throw new Error(`No se pudo crear la historia: ${error.message}`)
  return { id: data.id as string }
}

export async function getHistorias(
  _tenantId: string,
  _clienteId: string,
  mascotaId: string,
): Promise<Historia[]> {
  const { data } = await supabase
    .from("historias").select("*")
    .eq("mascota_id", mascotaId)
    .order("fecha_atencion", { ascending: false })
  return (data ?? []).map(aHistoria)
}

/** Historias de una mascota, sin sesión (para /mi-historia/[mascotaId]). */
export async function getHistoriasPublico(
  tenantId: string,
  mascotaId: string,
): Promise<Historia[]> {
  const { data } = await supabase
    .rpc("obtener_historias_publico", { p_tenant: tenantId, p_mascota_id: mascotaId })
  return (data ?? []).map(aHistoria)
}

export async function contarVisitasMascota(
  _tenantId: string,
  _clienteId: string,
  mascotaId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("historias")
    .select("*", { count: "exact", head: true })
    .eq("mascota_id", mascotaId)
    .neq("tipo_visita", "turno_programado")
  if (error) return 0
  return count ?? 0
}

export async function updateHistoria(
  _tenantId: string,
  _clienteId: string,
  _mascotaId: string,
  historiaId: string,
  data: Partial<Historia>,
) {
  const fila: Record<string, unknown> = {}
  if (data.fechaAtencion) fila.fecha_atencion = data.fechaAtencion
  if (data.motivo !== undefined) fila.motivo = data.motivo
  if (data.diagnostico !== undefined) fila.diagnostico = data.diagnostico
  if (data.tratamiento !== undefined) fila.tratamiento = data.tratamiento
  if (data.observaciones !== undefined) fila.observaciones = data.observaciones
  if (data.proximaVisita !== undefined) fila.proxima_visita = data.proximaVisita || null
  if (data.archivos !== undefined) fila.archivos = data.archivos
  if (data.tipoVisita !== undefined) fila.tipo_visita = data.tipoVisita
  if (data.turnoId !== undefined) fila.turno_id = data.turnoId || null

  if (Object.keys(fila).length === 0) return
  const { error } = await supabase.from("historias").update(fila).eq("id", historiaId)
  if (error) throw new Error(`No se pudo actualizar la historia: ${error.message}`)
}

export async function deleteHistoria(
  _tenantId: string,
  _clienteId: string,
  _mascotaId: string,
  historiaId: string,
) {
  const { error } = await supabase.from("historias").delete().eq("id", historiaId)
  if (error) throw new Error(`No se pudo borrar la historia: ${error.message}`)
}

/**
 * Listado de clientes con sus mascotas y contadores de visitas.
 *
 * En Firestore esto disparaba 1 + N + N*M lecturas. Acá son 2 queries:
 * clientes con mascotas anidadas, y todas las historias del tenant de una vez.
 */
export async function getClientesConMascotasYContadores(
  tenantId: string,
  limit?: number,
  offset?: number,
) {
  const clientesData = await getClientesBasic(tenantId)
  const clientesConDNI = clientesData.filter((c) => c.dni?.trim())
  const paginados = limit
    ? clientesConDNI.slice(offset || 0, (offset || 0) + limit)
    : clientesConDNI

  const ids = paginados.map((c) => c.id!).filter(Boolean)
  if (ids.length === 0) {
    return { clientes: [], total: clientesConDNI.length, hasMore: false }
  }

  const { data: filasMascotas } = await supabase
    .from("mascotas").select("*").in("cliente_id", ids)

  const mascotaIds = (filasMascotas ?? []).map((m) => m.id as string)
  const { data: filasHistorias } = mascotaIds.length
    ? await supabase
        .from("historias").select("*")
        .in("mascota_id", mascotaIds)
        .order("fecha_atencion", { ascending: false })
    : { data: [] as Fila[] }

  // Agrupa historias por mascota, conservando el orden desc
  const historiasPorMascota = new Map<string, Historia[]>()
  for (const f of filasHistorias ?? []) {
    const key = f.mascota_id as string
    const lista = historiasPorMascota.get(key) ?? []
    lista.push(aHistoria(f))
    historiasPorMascota.set(key, lista)
  }

  const resultado = []
  for (const cliente of paginados) {
    const mascotas = (filasMascotas ?? [])
      .filter((m) => m.cliente_id === cliente.id)
      .map((m) => ({
        id: m.id as string,
        nombre: (m.nombre as string) ?? "",
        tipo: (m.tipo as string) ?? "",
        edad: (m.edad as string) ?? undefined,
        raza: (m.raza as string) ?? undefined,
        peso: (m.peso as string) ?? undefined,
        libretaToken: (m.libreta_token as string) ?? undefined,
      }))
    if (mascotas.length === 0) continue

    const mascotasConContadores = mascotas.map((mascota) => {
      const historias = historiasPorMascota.get(mascota.id) ?? []
      return {
        mascota,
        totalVisitas: historias.filter((h) => h.tipoVisita !== "turno_programado").length,
        ultimaVisita: historias.length > 0 ? historias[0] : null,
        totalConsultas: historias.length,
      }
    })

    resultado.push({ cliente, mascotas: mascotasConContadores, totalMascotas: mascotas.length })
  }

  return {
    clientes: resultado,
    total: clientesConDNI.length,
    hasMore: limit ? (offset || 0) + limit < clientesConDNI.length : false,
  }
}
