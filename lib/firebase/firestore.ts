import { db } from "./config"
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  runTransaction,
  onSnapshot,
  type Unsubscribe,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore"

// ============ ROLES ============
export type UserRole = "superadmin" | "veterinario" | "usuario"

export interface Usuario {
  uid: string
  email: string | null
  displayName?: string | null
  photoURL?: string | null
  role: UserRole
  tenantId?: string
  /** @deprecated usar role */
  isAdmin?: boolean
  createdAt?: unknown
  lastLogin?: unknown
}

export async function getUsuarios(): Promise<Usuario[]> {
  const ref = collection(db, "usuarios")
  const snapshot = await getDocs(ref)
  return snapshot.docs.map((d) => ({ uid: d.id, ...d.data() }) as Usuario)
}

// ============ TENANT ============
export interface ServicioTenant {
  emoji: string
  nombre: string
  descripcion?: string
}

export interface HorarioTenant {
  dia: string
  apertura: string
  cierre: string
  cerrado: boolean
  /** true (default) = horario corrido, false = cierra al mediodia */
  corrido?: boolean
  /** Cierre del primer bloque (ej: 12:00) — solo cuando corrido === false */
  cierre1?: string
  /** Apertura del segundo bloque (ej: 16:00) — solo cuando corrido === false */
  apertura2?: string
}

/** Identificador mínimo — el doc raíz veterinarias/{slug} solo marca existencia */
export interface Tenant {
  slug: string
}

/** "local" = atiende en consultorio, "domicilio" = va a la casa, "ambos" = las dos */
export type Modalidad = "local" | "domicilio" | "ambos"

// ============ TURNO CONFIG ============
/** Tipo de mascota que atiende la veterinaria */
export interface MascotaTurnoConfig {
  id: string
  emoji: string
  nombre: string
}

/** Servicio disponible para reservar turno */
export interface ServicioTurnoConfig {
  id: string
  emoji: string
  nombre: string
  descripcion?: string
}

/** Vacuna disponible para un tipo de mascota */
export interface VacunaTurnoConfig {
  id: string
  nombre: string
  descripcion?: string
}

/** Configuración de turnos — vive en veterinarias/{slug}/config/turno */
export interface TurnoConfig {
  mascotas?: MascotaTurnoConfig[]
  servicios?: ServicioTurnoConfig[]
  /** Vacunas agrupadas por tipo de mascota: { perro: [...], gato: [...] } */
  vacunas?: Record<string, VacunaTurnoConfig[]>
}

/** Todo vive en veterinarias/{slug}/config/datos */
export interface TenantConfig {
  nombre?: string
  plan?: "basico" | "plus" | "pro"
  status?: "activo" | "pausado"
  adminIds?: string[]
  createdAt?: string
  telefono?: string
  email?: string
  direccion?: string
  ciudad?: string
  slogan?: string
  descripcion?: string
  servicios?: ServicioTenant[]
  horarios?: HorarioTenant[]
  fotosHero?: string[]
  fotosHeroMobile?: string[]
  logo?: string
  modalidad?: Modalidad
  googleMapsUrl?: string
  /** Horas mínimas de anticipación para turnos del mismo día (default 2) */
  minHorasAnticipacion?: number
  /** ID del Google Calendar donde se crean los eventos de turno */
  calendarId?: string
}

const configDoc_ = (t: string) => doc(db, "veterinarias", t, "config", "datos")
const turnoConfigDoc_ = (t: string) => doc(db, "veterinarias", t, "config", "turno")

export async function getTenant(tenantId: string): Promise<Tenant | null> {
  const snap = await getDoc(doc(db, "veterinarias", tenantId))
  if (!snap.exists()) return null
  return { slug: snap.id }
}

export async function getTenantConfig(tenantId: string): Promise<TenantConfig | null> {
  const snap = await getDoc(configDoc_(tenantId))
  if (!snap.exists()) return null
  return snap.data() as TenantConfig
}

export async function updateTenantConfig(tenantId: string, data: Partial<TenantConfig>): Promise<void> {
  await setDoc(configDoc_(tenantId), data, { merge: true })
}

// ── Turno Config CRUD ──
export async function getTurnoConfig(tenantId: string): Promise<TurnoConfig | null> {
  const snap = await getDoc(turnoConfigDoc_(tenantId))
  if (!snap.exists()) return null
  return snap.data() as TurnoConfig
}

export async function updateTurnoConfig(tenantId: string, data: Partial<TurnoConfig>): Promise<void> {
  await setDoc(turnoConfigDoc_(tenantId), data, { merge: true })
}

/** Tenant + config merged — útil para páginas que necesitan ambos */
export type TenantFull = Tenant & TenantConfig

export async function getTenantFull(tenantId: string): Promise<TenantFull | null> {
  const [tenant, config] = await Promise.all([getTenant(tenantId), getTenantConfig(tenantId)])
  if (!tenant) return null
  return { ...tenant, ...config }
}

export async function getTenants(): Promise<Tenant[]> {
  const snap = await getDocs(collection(db, "veterinarias"))
  return snap.docs.map(d => ({ slug: d.id }))
}

export async function getTenantsFull(): Promise<TenantFull[]> {
  const tenants = await getTenants()
  const results = await Promise.all(
    tenants.map(async (t) => {
      const cfg = await getTenantConfig(t.slug)
      return { ...t, ...cfg } as TenantFull
    })
  )
  return results
}

export async function updateTenant(tenantId: string, data: Partial<TenantConfig>): Promise<void> {
  await updateTenantConfig(tenantId, data)
}

export async function createTenant(tenantId: string, data: Partial<TenantConfig>): Promise<void> {
  // Doc raíz vacío para que Firebase muestre la veterinaria
  await setDoc(doc(db, "veterinarias", tenantId), {})
  // Todo va en config/datos
  await setDoc(configDoc_(tenantId), {
    status: "activo",
    createdAt: new Date().toISOString(),
    ...data,
  })
}

// ============ PATH HELPERS ============
const clientesCol  = (t: string) => collection(db, "veterinarias", t, "clientes")
const turnosCol    = (t: string) => collection(db, "veterinarias", t, "turnos")
const diasCol      = (t: string) => collection(db, "veterinarias", t, "diasBloqueados")
const mascotasCol  = (t: string, cId: string) => collection(db, "veterinarias", t, "clientes", cId, "mascotas")
const historiasCol = (t: string, cId: string, mId: string) =>
  collection(db, "veterinarias", t, "clientes", cId, "mascotas", mId, "historias")
const historiaClinicaDoc = (t: string, cId: string, mId: string) =>
  doc(db, "veterinarias", t, "clientes", cId, "mascotas", mId, "historiaClinica", "registro")
const contadorDoc  = (t: string) => doc(db, "veterinarias", t, "config", "contadores")

// ============ ID HELPERS ============
/** Convierte texto a slug limpio sin tildes ni espacios */
function toId(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "sin-nombre"
}

/** ID de cliente = DNI */
export function clienteDocId(dni: string): string {
  return dni.trim()
}

/** ID de mascota = nombre-tipo  (ej: firulais-perro) */
export function mascotaDocId(nombre: string, tipo: string): string {
  return `${toId(nombre)}-${toId(tipo)}`
}

/** ID de historia = fecha (YYYY-MM-DD) */
function historiaDocId(fechaAtencion: string): string {
  return (fechaAtencion ?? "").slice(0, 10).replace(/\//g, "-") || new Date().toISOString().slice(0, 10)
}

// ============ INTERFACES ============
export interface HistorialDato {
  campo: string
  valorAnterior: string
  valorNuevo: string
  fechaCambio: string
}

export interface Cliente {
  id?: string
  nombre: string
  telefono: string
  email: string
  dni?: string
  domicilio?: string
  historialDatos?: HistorialDato[]
  createdAt?: string
  updatedAt?: string
}

export interface Mascota {
  id?: string
  nombre: string
  tipo: string
  edad?: string
  raza?: string
  peso?: string
}

export interface Turno {
  id?: string
  clienteId: string
  mascotaId?: string
  cliente: {
    nombre: string
    telefono: string
    email: string
    dni?: string
    domicilio?: string
  }
  mascota: {
    nombre: string
    tipo: string
    motivo?: string
  }
  servicio?: string
  fecha?: string
  hora?: string
  turno: {
    fecha: string
    hora: string
    timestamp: unknown
  }
  estado: "pendiente" | "completado" | "cancelado"
  vacunas?: string[]
  diagnostico?: string
  tratamiento?: string
  medicacion?: string
  observaciones?: string
}

export interface Historia {
  id?: string
  fechaAtencion: string
  motivo?: string
  diagnostico: string
  tratamiento: string
  observaciones?: string
  proximaVisita?: string
  archivos?: string[]
  tipoVisita?: "consulta" | "turno_programado" | "visita_programada"
  turnoId?: string
}

export interface HistoriaClinicaRegistro {
  consultas: unknown[]
  vacunas: unknown[]
  tratamientos: unknown[]
  alergias: unknown[]
  cirugias: unknown[]
  fechaCreacion: string
}

// ============ CLIENTES ============
export async function getClienteByDNI(tenantId: string, dni: string): Promise<Cliente | null> {
  if (!dni?.trim()) return null
  // Con el nuevo esquema, el ID del documento ES el DNI
  const docSnap = await getDoc(doc(clientesCol(tenantId), clienteDocId(dni)))
  if (!docSnap.exists()) return null
  return { id: docSnap.id, ...docSnap.data() } as Cliente
}

export async function createCliente(tenantId: string, data: Omit<Cliente, "id">): Promise<{ id: string } & Cliente> {
  if (data.dni?.trim()) {
    const existente = await getClienteByDNI(tenantId, data.dni.trim())
    if (existente) {
      const cambios: HistorialDato[] = existente.historialDatos || []
      const ahora = new Date().toISOString()
      const campos = ["domicilio", "telefono", "email", "nombre"] as const
      for (const campo of campos) {
        if (data[campo] && existente[campo] !== data[campo]) {
          cambios.push({ campo, valorAnterior: existente[campo] || "", valorNuevo: data[campo] || "", fechaCambio: ahora })
        }
      }
      const clienteRef = doc(clientesCol(tenantId), existente.id!)
      await updateDoc(clienteRef, { ...data, historialDatos: cambios, updatedAt: ahora })
      return { ...existente, ...data, historialDatos: cambios } as { id: string } & Cliente
    }
  }
  const newId = data.dni?.trim() ? clienteDocId(data.dni.trim()) : toId(data.nombre)
  const clienteRef = doc(clientesCol(tenantId), newId)
  const nuevoCliente = { ...data, historialDatos: [], createdAt: new Date().toISOString() }
  await setDoc(clienteRef, nuevoCliente)
  return { id: newId, ...nuevoCliente }
}

export async function getClientes(tenantId: string): Promise<Cliente[]> {
  const snapshot = await getDocs(clientesCol(tenantId))
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Cliente)
}

export async function getClientesBasic(tenantId: string): Promise<Cliente[]> {
  const snapshot = await getDocs(clientesCol(tenantId))
  return snapshot.docs.map((d) => clienteBasicFromDoc(d))
}

/** Mapea un doc de Firestore a Cliente con solo campos básicos. */
function clienteBasicFromDoc(d: QueryDocumentSnapshot<DocumentData>): Cliente {
  const data = d.data()
  return {
    id: d.id,
    nombre: data.nombre || "",
    telefono: data.telefono || "",
    email: data.email || "",
    dni: data.dni || "",
    domicilio: data.domicilio || "",
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  } as Cliente
}

/** Cursor opaco para paginación de clientes. */
export type ClientesCursor = QueryDocumentSnapshot<DocumentData> | null

export interface ClientesPage {
  clientes: Cliente[]
  /** Cursor para la siguiente página; pasar a la próxima llamada. */
  nextCursor: ClientesCursor
  /** true si la página vino llena (probablemente hay más). */
  hasMore: boolean
}

/**
 * Paginación cursor-based de clientes ordenados por nombre.
 * @param cursor Resultado `nextCursor` de la llamada anterior, o null para la primera página.
 */
export async function getClientesPaginated(
  tenantId: string,
  pageSize: number,
  cursor: ClientesCursor = null,
): Promise<ClientesPage> {
  const constraints = [orderBy("nombre"), limit(pageSize)]
  const q = cursor
    ? query(clientesCol(tenantId), orderBy("nombre"), startAfter(cursor), limit(pageSize))
    : query(clientesCol(tenantId), ...constraints)

  const snapshot = await getDocs(q)
  const clientes = snapshot.docs.map((d) => clienteBasicFromDoc(d))
  const lastDoc = snapshot.docs[snapshot.docs.length - 1] ?? null
  return {
    clientes,
    nextCursor: lastDoc,
    hasMore: snapshot.docs.length === pageSize,
  }
}

export async function getClienteCompleto(tenantId: string, clienteId: string) {
  const clienteRef = doc(clientesCol(tenantId), clienteId)
  const clienteSnap = await getDoc(clienteRef)
  if (!clienteSnap.exists()) return null
  const cliente = { id: clienteSnap.id, ...clienteSnap.data() } as Cliente
  const mascotas = await getMascotas(tenantId, clienteId)
  return { ...cliente, mascotas }
}

export async function getClienteByEmail(tenantId: string, email: string): Promise<Cliente | null> {
  const q = query(clientesCol(tenantId), where("email", "==", email))
  const snapshot = await getDocs(q)
  if (snapshot.empty) return null
  const d = snapshot.docs[0]
  return { id: d.id, ...d.data() } as Cliente
}

export async function updateCliente(tenantId: string, clienteId: string, data: Partial<Omit<Cliente, "id">>) {
  try {
    const clienteRef = doc(clientesCol(tenantId), clienteId)
    const clienteActual = await getDoc(clienteRef)
    if (!clienteActual.exists()) throw new Error("Cliente no encontrado")
    const clienteData = clienteActual.data() as Cliente
    const cambios: HistorialDato[] = clienteData.historialDatos || []
    const ahora = new Date().toISOString()
    const campos = ["domicilio", "telefono", "email", "nombre"] as const
    for (const campo of campos) {
      if (data[campo] !== undefined && clienteData[campo] !== data[campo]) {
        cambios.push({ campo, valorAnterior: clienteData[campo] || "", valorNuevo: data[campo] || "", fechaCambio: ahora })
      }
    }
    await updateDoc(clienteRef, { ...data, historialDatos: cambios, updatedAt: ahora })
    return { success: true, id: clienteId }
  } catch (error) {
    console.error("Error actualizando cliente:", error)
    throw error
  }
}

// ============ MASCOTAS ============
export async function createMascota(tenantId: string, clienteId: string, data: Omit<Mascota, "id">) {
  const newId = mascotaDocId(data.nombre, data.tipo)
  const mascotaRef = doc(mascotasCol(tenantId, clienteId), newId)
  await setDoc(mascotaRef, { ...data, createdAt: new Date().toISOString() })
  await createHistoriaClinicaRegistro(tenantId, clienteId, newId)
  return { id: newId }
}

export async function getMascotas(tenantId: string, clienteId: string): Promise<Mascota[]> {
  const snapshot = await getDocs(mascotasCol(tenantId, clienteId))
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Mascota)
}

export const getMascotasByClienteId = getMascotas

export async function updateMascota(tenantId: string, clienteId: string, mascotaId: string, data: Partial<Omit<Mascota, "id">>) {
  try {
    const mascotaRef = doc(mascotasCol(tenantId, clienteId), mascotaId)
    await updateDoc(mascotaRef, { ...data, updatedAt: new Date().toISOString() })
    return { success: true, id: mascotaId }
  } catch (error) {
    console.error("Error actualizando mascota:", error)
    throw error
  }
}

// ============ HISTORIA CLÍNICA (DOCUMENTO REGISTRO) ============
export async function createHistoriaClinicaRegistro(tenantId: string, clienteId: string, mascotaId: string) {
  const ref = historiaClinicaDoc(tenantId, clienteId, mascotaId)
  await setDoc(ref, { consultas: [], vacunas: [], tratamientos: [], alergias: [], cirugias: [], fechaCreacion: new Date().toISOString() })
  return ref
}

export async function getHistoriaClinicaRegistro(tenantId: string, clienteId: string, mascotaId: string) {
  const snap = await getDoc(historiaClinicaDoc(tenantId, clienteId, mascotaId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as unknown as HistoriaClinicaRegistro
}

export async function updateHistoriaClinicaRegistro(tenantId: string, clienteId: string, mascotaId: string, data: Partial<HistoriaClinicaRegistro>) {
  await setDoc(historiaClinicaDoc(tenantId, clienteId, mascotaId), data, { merge: true })
}

export const createHistoriaClinica  = createHistoriaClinicaRegistro
export const getHistoriaClinica     = getHistoriaClinicaRegistro
export const updateHistoriaClinica  = updateHistoriaClinicaRegistro

// ============ HISTORIAS CLÍNICAS (COLECCIÓN) ============
export async function createHistoria(tenantId: string, clienteId: string, mascotaId: string, historiaData: Omit<Historia, "id">) {
  const baseId = historiaDocId(historiaData.fechaAtencion)
  // Evitar duplicados en misma fecha
  const colRef = historiasCol(tenantId, clienteId, mascotaId)
  let finalId = baseId
  let attempt = 1
  while ((await getDoc(doc(colRef, finalId))).exists()) {
    attempt++
    finalId = `${baseId}-${attempt}`
  }
  const payload: Record<string, unknown> = {
    fechaAtencion: historiaData.fechaAtencion ?? "",
    motivo:        historiaData.motivo ?? "Consulta general",
    diagnostico:   historiaData.diagnostico ?? "",
    tratamiento:   historiaData.tratamiento ?? "—",
    observaciones: historiaData.observaciones ?? "",
    proximaVisita: historiaData.proximaVisita ?? "",
  }
  if (historiaData.tipoVisita != null)                    payload.tipoVisita = historiaData.tipoVisita
  if (historiaData.turnoId != null && historiaData.turnoId !== "") payload.turnoId   = historiaData.turnoId
  if (historiaData.archivos?.length)                      payload.archivos   = historiaData.archivos
  await setDoc(doc(colRef, finalId), payload)
  return { id: finalId }
}

export async function getHistorias(tenantId: string, clienteId: string, mascotaId: string): Promise<Historia[]> {
  const q = query(historiasCol(tenantId, clienteId, mascotaId), orderBy("fechaAtencion", "desc"))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Historia)
}

export async function contarVisitasMascota(tenantId: string, clienteId: string, mascotaId: string): Promise<number> {
  try {
    const historias = await getHistorias(tenantId, clienteId, mascotaId)
    return historias.filter((h) => h.tipoVisita !== "turno_programado").length
  } catch {
    return 0
  }
}

export async function getClientesConMascotasYContadores(tenantId: string, limit?: number, offset?: number) {
  const clientesData = await getClientesBasic(tenantId)
  const clientesConDNI = clientesData.filter((c) => c.dni?.trim())
  const paginados = limit ? clientesConDNI.slice(offset || 0, (offset || 0) + limit) : clientesConDNI
  const resultado = []
  for (const cliente of paginados) {
    if (!cliente.id) continue
    try {
      const mascotas = await getMascotas(tenantId, cliente.id)
      if (mascotas.length === 0) continue
      const mascotasConContadores = await Promise.all(
        mascotas.map(async (mascota) => {
          if (!mascota.id) return null
          const historias = await getHistorias(tenantId, cliente.id!, mascota.id)
          return {
            mascota,
            totalVisitas:    historias.filter((h) => h.tipoVisita !== "turno_programado").length,
            ultimaVisita:    historias.length > 0 ? historias[0] : null,
            totalConsultas:  historias.length,
          }
        })
      )
      resultado.push({ cliente, mascotas: mascotasConContadores.filter((m): m is NonNullable<typeof m> => m !== null), totalMascotas: mascotas.length })
    } catch (error) {
      console.error(`Error cargando mascotas del cliente ${cliente.id}:`, error)
    }
  }
  return { clientes: resultado, total: clientesConDNI.length, hasMore: limit ? (offset || 0) + limit < clientesConDNI.length : false }
}

export async function updateHistoria(tenantId: string, clienteId: string, mascotaId: string, historiaId: string, data: Partial<Historia>) {
  return await updateDoc(doc(historiasCol(tenantId, clienteId, mascotaId), historiaId), data)
}

export async function deleteHistoria(tenantId: string, clienteId: string, mascotaId: string, historiaId: string) {
  return await deleteDoc(doc(historiasCol(tenantId, clienteId, mascotaId), historiaId))
}

// ============ TURNOS ============
/**
 * Crea un turno con ID legible: {numero}_{primerNombreCliente}_{nombreMascota}
 * Usa transacción para garantizar numeración única y control de plan.
 */
export async function createTurno(tenantId: string, turnoData: Partial<Turno>): Promise<{ id: string }> {
  const primerNombre = (turnoData.cliente?.nombre ?? "Cliente").split(/\s+/)[0]
  const nombreMascota = turnoData.mascota?.nombre ?? "Mascota"
  const contRef  = contadorDoc(tenantId)
  const cfgRef   = configDoc_(tenantId)

  let turnoId = ""

  await runTransaction(db, async (tx) => {
    const [contSnap, cfgSnap] = await Promise.all([tx.get(contRef), tx.get(cfgRef)])

    const count: number     = contSnap.exists() ? (contSnap.data().turnos ?? 0) : 0
    const plan: string      = cfgSnap.exists()  ? (cfgSnap.data().plan ?? "basico") : "basico"
    const status: string    = cfgSnap.exists()  ? (cfgSnap.data().status ?? "activo") : "activo"
    const mesActual         = new Date().toISOString().slice(0, 7)
    const turnosMes: Record<string, number> = contSnap.exists() ? (contSnap.data().turnosMes ?? {}) : {}
    const countMes          = turnosMes[mesActual] ?? 0

    if (status === "pausado") {
      throw new Error("TENANT_PAUSED")
    }

    if (plan === "basico" && countMes >= 10) {
      throw new Error("PLAN_LIMIT_REACHED")
    }

    const nextNum = count + 1
    turnoId = `${nextNum}_${primerNombre}_${nombreMascota}`

    const turnoCompleto = {
      clienteId:  turnoData.clienteId  || "",
      mascotaId:  turnoData.mascotaId  || "",
      cliente: {
        nombre:    turnoData.cliente?.nombre    || "",
        telefono:  turnoData.cliente?.telefono  || "",
        email:     turnoData.cliente?.email     || "",
        dni:       turnoData.cliente?.dni       || "",
        domicilio: turnoData.cliente?.domicilio || "",
      },
      mascota: {
        nombre: turnoData.mascota?.nombre || "",
        tipo:   turnoData.mascota?.tipo   || "",
        motivo: turnoData.mascota?.motivo || "",
      },
      servicio: turnoData.servicio || "",
      vacunas:  turnoData.vacunas  || [],
      fecha:    turnoData.fecha    || turnoData.turno?.fecha || "",
      hora:     turnoData.hora     || turnoData.turno?.hora  || "",
      turno: {
        fecha:     turnoData.fecha || turnoData.turno?.fecha || "",
        hora:      turnoData.hora  || turnoData.turno?.hora  || "",
        timestamp: serverTimestamp(),
      },
      estado: turnoData.estado || "pendiente",
    }

    tx.set(doc(turnosCol(tenantId), turnoId), turnoCompleto)
    tx.set(contRef, { turnos: nextNum, turnosMes: { ...turnosMes, [mesActual]: countMes + 1 } }, { merge: true })
  })

  // Auto-sync historia clínica
  const fecha    = turnoData.fecha || turnoData.turno?.fecha || ""
  const clienteId = turnoData.clienteId || ""
  const mascotaId = turnoData.mascotaId || ""
  if (clienteId && mascotaId && fecha) {
    try {
      await createHistoria(tenantId, clienteId, mascotaId, {
        fechaAtencion: fecha,
        motivo:        `Turno programado: ${turnoData.servicio || "Consulta"}`,
        diagnostico:   "Visita programada",
        tratamiento:   turnoData.mascota?.motivo || "Pendiente de atención",
        observaciones: `Turno agendado para el ${fecha} a las ${turnoData.hora || ""}. Estado: pendiente`,
        proximaVisita: fecha,
        tipoVisita:    "turno_programado",
        turnoId,
      })
    } catch (error) {
      console.error("Error al crear entrada en historial clínico:", error)
    }
  }

  return { id: turnoId }
}

export async function getTurnos(tenantId: string): Promise<Turno[]> {
  const q = query(turnosCol(tenantId), orderBy("turno.timestamp", "desc"))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Turno)
}

/**
 * Suscripción real-time a los turnos del tenant (ordenados por timestamp desc).
 * Devuelve la función `Unsubscribe` — llamarla al desmontar para evitar fugas.
 */
export function subscribeTurnos(
  tenantId: string,
  onData: (turnos: Turno[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(turnosCol(tenantId), orderBy("turno.timestamp", "desc"))
  return onSnapshot(
    q,
    (snapshot) => onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Turno)),
    (error) => onError?.(error),
  )
}

/** Turnos filtrados por rango de fechas (YYYY-MM-DD). Solo pendientes para disponibilidad. */
export async function getTurnosByDateRange(
  tenantId: string,
  fechaDesde: string,
  fechaHasta: string,
): Promise<Turno[]> {
  const q = query(
    turnosCol(tenantId),
    where("turno.fecha", ">=", fechaDesde),
    where("turno.fecha", "<=", fechaHasta),
    where("estado", "==", "pendiente"),
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Turno)
}

/** Query directa por clienteId — no trae todos los turnos */
export async function getTurnosByClienteId(tenantId: string, clienteId: string): Promise<Turno[]> {
  if (!clienteId) return []
  try {
    const q = query(turnosCol(tenantId), where("clienteId", "==", clienteId))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Turno)
  } catch {
    return []
  }
}

/** Busca turnos por email del cliente — permite al cliente autenticado ver sus turnos sin acceso admin. */
export async function getTurnosByClienteEmail(tenantId: string, email: string): Promise<Turno[]> {
  if (!email) return []
  try {
    const q = query(turnosCol(tenantId), where("cliente.email", "==", email))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Turno)
  } catch {
    return []
  }
}

export async function updateTurno(tenantId: string, turnoId: string, data: Partial<Turno>) {
  return await updateDoc(doc(turnosCol(tenantId), turnoId), data)
}

/** Devuelve cuántos turnos se crearon en el mes actual para este tenant */
export async function getTurnosDelMes(tenantId: string): Promise<number> {
  const snap = await getDoc(contadorDoc(tenantId))
  if (!snap.exists()) return 0
  const mesActual = new Date().toISOString().slice(0, 7)
  const turnosMes: Record<string, number> = snap.data().turnosMes ?? {}
  return turnosMes[mesActual] ?? 0
}

export async function deleteTurno(tenantId: string, turnoId: string) {
  return await deleteDoc(doc(turnosCol(tenantId), turnoId))
}

// ============ DISPONIBILIDAD ============
export interface DiaBloqueado {
  id: string
  fecha?: string
  motivo?: string
}

export async function getDiasBloqueados(tenantId: string): Promise<DiaBloqueado[]> {
  const snapshot = await getDocs(diasCol(tenantId))
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as DiaBloqueado)
}

/**
 * Suscripción real-time a los días bloqueados del tenant.
 * Devuelve la función `Unsubscribe` — llamarla al desmontar para evitar fugas.
 */
export function subscribeDiasBloqueados(
  tenantId: string,
  onData: (dias: DiaBloqueado[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    diasCol(tenantId),
    (snapshot) => onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as DiaBloqueado)),
    (error) => onError?.(error),
  )
}

export async function bloquearDia(tenantId: string, fecha: string, motivo?: string) {
  const diaRef = doc(diasCol(tenantId), fecha)
  await setDoc(diaRef, { fecha, motivo: motivo || "Día bloqueado", fechaCreacion: new Date().toISOString() })
  return { id: fecha }
}

export async function desbloquearDia(tenantId: string, diaId: string) {
  return await deleteDoc(doc(diasCol(tenantId), diaId))
}
