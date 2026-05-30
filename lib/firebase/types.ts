import type { QueryDocumentSnapshot, DocumentData } from "firebase/firestore"

/**
 * Tipos del dominio de datos (Firestore). Módulo base sin lógica ni dependencias
 * de runtime, para que cualquier módulo lo importe sin ciclos.
 */

// ── Roles / usuarios ──
export type UserRole = "superadmin" | "veterinario" | "empleado" | "usuario"

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

// ── Invitaciones ──
/** Invitación de un dueño para sumar veterinario/empleado a su tenant. */
export interface Invitacion {
  id?: string
  email: string
  tenantId: string
  role: "veterinario" | "empleado"
  estado: "pendiente" | "aceptada"
  invitedBy?: string
  createdAt?: unknown
}

// ── Tenant ──
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

// ── Turno config ──
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
  /** Duración del turno en minutos (default 60). Define cuántos slots ocupa. */
  duracionMin?: number
}

/** Profesional con agenda propia dentro de la veterinaria */
export interface Profesional {
  id: string
  nombre: string
  /** false = no recibe turnos nuevos. Default true. */
  activo?: boolean
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
  /** Profesionales con agendas independientes. Vacío/ausente = agenda única. */
  profesionales?: Profesional[]
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

/** Tenant + config merged — útil para páginas que necesitan ambos */
export type TenantFull = Tenant & TenantConfig

// ── Clientes / mascotas / historias ──
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
  /** Token aleatorio para la libreta pública por QR (no adivinable). */
  libretaToken?: string
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
  /** Duración del turno en minutos (snapshot del servicio al reservar; default 60). */
  duracionMin?: number
  /** Profesional asignado (agenda independiente). Ausente = agenda única. */
  profesionalId?: string
  profesionalNombre?: string
  turno: {
    fecha: string
    hora: string
    timestamp: unknown
  }
  estado: "pendiente" | "confirmado" | "completado" | "cancelado"
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

// ── Paginación de clientes ──
/** Cursor opaco para paginación de clientes. */
export type ClientesCursor = QueryDocumentSnapshot<DocumentData> | null

export interface ClientesPage {
  clientes: Cliente[]
  /** Cursor para la siguiente página; pasar a la próxima llamada. */
  nextCursor: ClientesCursor
  /** true si la página vino llena (probablemente hay más). */
  hasMore: boolean
}

// ── Libreta pública (QR) ──
export interface LibretaPublica {
  token: string
  mascota: { nombre: string; tipo: string; raza?: string; edad?: string }
  vetNombre?: string
  historias: { fecha: string; motivo: string; diagnostico?: string; tratamiento?: string }[]
  generadoEl: string
}

// ── Recordatorios de vacunas ──
export interface RecordatorioVacuna {
  id?: string
  clienteId: string
  mascotaId: string
  mascotaNombre: string
  telefono: string
  vacuna: string
  /** Fecha de la próxima dosis (YYYY-MM-DD). */
  fecha: string
  enviado?: boolean
  createdAt?: string
}

// ── Disponibilidad ──
export interface DiaBloqueado {
  id: string
  fecha?: string
  motivo?: string
}
