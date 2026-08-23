/**
 * Barrel que replica la superficie pública de `lib/firebase/firestore.ts`.
 *
 * Todo lo que antes se importaba desde "@/lib/firebase/firestore" sale de acá
 * con la misma firma, así el swap en los ~61 componentes es solo cambiar el
 * path del import.
 */

// ── Tipos ──
export type {
  UserRole, Usuario, Invitacion, ServicioTenant, HorarioTenant, Tenant, Modalidad,
  MascotaTurnoConfig, ServicioTurnoConfig, Profesional, VacunaTurnoConfig, TurnoConfig,
  TenantConfig, TenantFull, HistorialDato, Cliente, Mascota, Turno, Historia,
  HistoriaClinicaRegistro, ClientesCursor, ClientesPage, LibretaPublica,
  RecordatorioVacuna, DiaBloqueado, Unsubscribe,
} from "./types"

// ── Helpers de ID ──
export { clienteDocId, mascotaDocId } from "./ids"

// ── Dominio ──
export * from "./tenants"
export * from "./clientes"
export * from "./mascotas"
export * from "./historias"
export * from "./turnos"
export * from "./libretas"
export * from "./disponibilidad"
export * from "./recordatorios-vacuna"
export * from "./usuarios"
