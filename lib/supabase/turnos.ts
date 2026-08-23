import { supabase } from "./config"
import { getPlanLimits } from "../plans"
import { getTenantConfig } from "./tenants"
import { createHistoria } from "./historias"
import type { Turno, Unsubscribe } from "./types"

/** Turnos. Se conserva la forma denormalizada que tenían en Firestore. */

type Fila = Record<string, unknown>

function aTurno(f: Fila): Turno {
  const fecha = (f.fecha as string) ?? ""
  const hora = (f.hora as string) ?? ""
  return {
    // El código legible ("12_Juan_Firulais") era el docId en Firestore.
    // Ahora la PK es un uuid: `id` es el uuid, `codigo` queda para mostrar.
    id: f.id as string,
    clienteId: (f.cliente_id as string) ?? "",
    mascotaId: (f.mascota_id as string) ?? undefined,
    cliente: {
      nombre: (f.cliente_nombre as string) ?? "",
      telefono: (f.cliente_telefono as string) ?? "",
      email: (f.cliente_email as string) ?? "",
      dni: (f.cliente_dni as string) ?? "",
      domicilio: (f.cliente_domicilio as string) ?? "",
    },
    mascota: {
      nombre: (f.mascota_nombre as string) ?? "",
      tipo: (f.mascota_tipo as string) ?? "",
      motivo: (f.mascota_motivo as string) ?? "",
    },
    servicio: (f.servicio as string) ?? "",
    fecha,
    hora,
    duracionMin: (f.duracion_min as number) ?? 60,
    profesionalId: (f.profesional_id as string) ?? "",
    profesionalNombre: (f.profesional_nombre as string) ?? "",
    turno: { fecha, hora, timestamp: f.turno_timestamp },
    estado: (f.estado as Turno["estado"]) ?? "pendiente",
    vacunas: (f.vacunas as string[]) ?? [],
    diagnostico: (f.diagnostico as string) ?? undefined,
    tratamiento: (f.tratamiento as string) ?? undefined,
    medicacion: (f.medicacion as string) ?? undefined,
    observaciones: (f.observaciones as string) ?? undefined,
  }
}

/**
 * Crea un turno. La numeración, el chequeo de plan y el de estado del tenant
 * pasan por la función `crear_turno` de Postgres, que corre todo en una
 * transacción (reemplaza el `runTransaction` de Firestore).
 *
 * Lanza Error("TENANT_PAUSED") o Error("PLAN_LIMIT_REACHED"), igual que antes.
 */
export async function createTurno(
  tenantId: string,
  turnoData: Partial<Turno>,
): Promise<{ id: string }> {
  const config = await getTenantConfig(tenantId)
  const maxTurnosMes = getPlanLimits(config?.plan ?? "basico").maxTurnosMes

  const fecha = turnoData.fecha || turnoData.turno?.fecha || ""
  const hora = turnoData.hora || turnoData.turno?.hora || ""

  const { data, error } = await supabase.rpc("crear_turno", {
    p_tenant: tenantId,
    p_max_turnos_mes: maxTurnosMes,
    p_datos: {
      cliente_id: turnoData.clienteId || "",
      mascota_id: turnoData.mascotaId || "",
      cliente_nombre: turnoData.cliente?.nombre || "",
      cliente_telefono: turnoData.cliente?.telefono || "",
      cliente_email: turnoData.cliente?.email || "",
      cliente_dni: turnoData.cliente?.dni || "",
      cliente_domicilio: turnoData.cliente?.domicilio || "",
      mascota_nombre: turnoData.mascota?.nombre || "",
      mascota_tipo: turnoData.mascota?.tipo || "",
      mascota_motivo: turnoData.mascota?.motivo || "",
      servicio: turnoData.servicio || "",
      fecha,
      hora,
      duracion_min: turnoData.duracionMin ?? 60,
      profesional_id: turnoData.profesionalId ?? "",
      profesional_nombre: turnoData.profesionalNombre ?? "",
      estado: turnoData.estado || "pendiente",
      vacunas: turnoData.vacunas || [],
    },
  })

  if (error) {
    // Postgres devuelve el mensaje del `raise exception` tal cual
    if (error.message.includes("TENANT_PAUSED")) throw new Error("TENANT_PAUSED")
    if (error.message.includes("PLAN_LIMIT_REACHED")) throw new Error("PLAN_LIMIT_REACHED")
    throw new Error(`No se pudo crear el turno: ${error.message}`)
  }

  const fila = Array.isArray(data) ? data[0] : data
  const turnoId = fila?.id as string

  // Auto-sync con la historia clínica (best-effort, igual que antes)
  const mascotaId = turnoData.mascotaId || ""
  if (mascotaId && fecha) {
    try {
      await createHistoria(tenantId, turnoData.clienteId || "", mascotaId, {
        fechaAtencion: fecha,
        motivo: `Turno programado: ${turnoData.servicio || "Consulta"}`,
        diagnostico: "Visita programada",
        tratamiento: turnoData.mascota?.motivo || "Pendiente de atención",
        observaciones: `Turno agendado para el ${fecha} a las ${hora}. Estado: pendiente`,
        proximaVisita: fecha,
        tipoVisita: "turno_programado",
        turnoId,
      })
    } catch (error) {
      console.error("Error al crear entrada en historial clínico:", error)
    }
  }

  return { id: turnoId }
}

export async function getTurnos(tenantId: string): Promise<Turno[]> {
  const { data, error } = await supabase
    .from("turnos").select("*")
    .eq("tenant_id", tenantId)
    .order("turno_timestamp", { ascending: false })
  if (error) {
    console.error("Error al leer turnos:", error.message)
    return []
  }
  return (data ?? []).map(aTurno)
}

/**
 * Suscripción real-time a los turnos del tenant. Reemplaza `onSnapshot`.
 *
 * Postgres Changes notifica fila por fila, pero los consumidores esperan la
 * lista completa (igual que Firestore), así que se refetchea en cada cambio.
 * Devuelve la función para cortar la suscripción — llamarla al desmontar.
 */
export function subscribeTurnos(
  tenantId: string,
  onData: (turnos: Turno[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  let activo = true

  const cargar = async () => {
    try {
      const turnos = await getTurnos(tenantId)
      if (activo) onData(turnos)
    } catch (error) {
      if (activo) onError?.(error as Error)
    }
  }

  void cargar()

  const canal = supabase
    .channel(`turnos:${tenantId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "turnos", filter: `tenant_id=eq.${tenantId}` },
      () => { void cargar() },
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        onError?.(new Error("Se perdió la conexión real-time con los turnos"))
      }
    })

  return () => {
    activo = false
    void supabase.removeChannel(canal)
  }
}

/**
 * Turnos en un rango de fechas (YYYY-MM-DD). Incluye pendientes y confirmados:
 * ambos ocupan slot para disponibilidad y aplican a recordatorios.
 */
export async function getTurnosByDateRange(
  tenantId: string,
  fechaDesde: string,
  fechaHasta: string,
): Promise<Turno[]> {
  const { data, error } = await supabase
    .from("turnos").select("*")
    .eq("tenant_id", tenantId)
    .gte("fecha", fechaDesde)
    .lte("fecha", fechaHasta)
    .in("estado", ["pendiente", "confirmado"])
  if (error) {
    console.error("Error al leer turnos por rango:", error.message)
    return []
  }
  return (data ?? []).map(aTurno)
}

export async function getTurnosByClienteId(
  tenantId: string,
  clienteId: string,
): Promise<Turno[]> {
  if (!clienteId) return []
  const { data, error } = await supabase
    .from("turnos").select("*")
    .eq("tenant_id", tenantId).eq("cliente_id", clienteId)
  if (error) return []
  return (data ?? []).map(aTurno)
}

/** Turnos por email — permite al cliente ver los suyos sin acceso admin. */
export async function getTurnosByClienteEmail(
  tenantId: string,
  email: string,
): Promise<Turno[]> {
  if (!email) return []
  const { data, error } = await supabase
    .from("turnos").select("*")
    .eq("tenant_id", tenantId).ilike("cliente_email", email)
  if (error) return []
  return (data ?? []).map(aTurno)
}

export async function updateTurno(
  _tenantId: string,
  turnoId: string,
  data: Partial<Turno>,
) {
  const fila: Record<string, unknown> = {}
  if (data.estado !== undefined) fila.estado = data.estado
  if (data.servicio !== undefined) fila.servicio = data.servicio
  if (data.fecha !== undefined) fila.fecha = data.fecha
  if (data.hora !== undefined) fila.hora = data.hora
  if (data.duracionMin !== undefined) fila.duracion_min = data.duracionMin
  if (data.profesionalId !== undefined) fila.profesional_id = data.profesionalId
  if (data.profesionalNombre !== undefined) fila.profesional_nombre = data.profesionalNombre
  if (data.vacunas !== undefined) fila.vacunas = data.vacunas
  if (data.diagnostico !== undefined) fila.diagnostico = data.diagnostico
  if (data.tratamiento !== undefined) fila.tratamiento = data.tratamiento
  if (data.medicacion !== undefined) fila.medicacion = data.medicacion
  if (data.observaciones !== undefined) fila.observaciones = data.observaciones
  if (data.cliente !== undefined) {
    if (data.cliente.nombre !== undefined) fila.cliente_nombre = data.cliente.nombre
    if (data.cliente.telefono !== undefined) fila.cliente_telefono = data.cliente.telefono
    if (data.cliente.email !== undefined) fila.cliente_email = data.cliente.email
    if (data.cliente.dni !== undefined) fila.cliente_dni = data.cliente.dni
    if (data.cliente.domicilio !== undefined) fila.cliente_domicilio = data.cliente.domicilio
  }
  if (data.mascota !== undefined) {
    if (data.mascota.nombre !== undefined) fila.mascota_nombre = data.mascota.nombre
    if (data.mascota.tipo !== undefined) fila.mascota_tipo = data.mascota.tipo
    if (data.mascota.motivo !== undefined) fila.mascota_motivo = data.mascota.motivo
  }
  // Si cambió fecha u hora, recalcular el instante que ordena la lista
  if (data.fecha !== undefined || data.hora !== undefined) {
    const { data: actual } = await supabase
      .from("turnos").select("fecha, hora").eq("id", turnoId).maybeSingle()
    if (actual) {
      const f = (data.fecha ?? actual.fecha) as string
      const h = (data.hora ?? actual.hora) as string
      fila.turno_timestamp = new Date(`${f}T${h || "00:00"}`).toISOString()
    }
  }

  if (Object.keys(fila).length === 0) return
  const { error } = await supabase.from("turnos").update(fila).eq("id", turnoId)
  if (error) throw new Error(`No se pudo actualizar el turno: ${error.message}`)
}

/** Cuántos turnos se crearon este mes para el tenant. */
export async function getTurnosDelMes(tenantId: string): Promise<number> {
  const { data, error } = await supabase.rpc("turnos_del_mes", { p_tenant: tenantId })
  if (error) {
    console.error("Error al contar turnos del mes:", error.message)
    return 0
  }
  return (data as number) ?? 0
}

export async function deleteTurno(_tenantId: string, turnoId: string) {
  const { error } = await supabase.from("turnos").delete().eq("id", turnoId)
  if (error) throw new Error(`No se pudo borrar el turno: ${error.message}`)
}
