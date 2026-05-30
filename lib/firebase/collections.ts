import { db } from "./config"
import { collection, doc } from "firebase/firestore"

/**
 * Referencias a colecciones/documentos de Firestore y helpers de ID.
 * Centralizado para que los módulos de dominio compartan las mismas rutas.
 */

// ── Colecciones / documentos ──
export const invitacionesCol = () => collection(db, "invitaciones")
export const configDoc_ = (t: string) => doc(db, "veterinarias", t, "config", "datos")
export const turnoConfigDoc_ = (t: string) => doc(db, "veterinarias", t, "config", "turno")
export const clientesCol = (t: string) => collection(db, "veterinarias", t, "clientes")
export const turnosCol = (t: string) => collection(db, "veterinarias", t, "turnos")
export const diasCol = (t: string) => collection(db, "veterinarias", t, "diasBloqueados")
export const mascotasCol = (t: string, cId: string) =>
  collection(db, "veterinarias", t, "clientes", cId, "mascotas")
export const historiasCol = (t: string, cId: string, mId: string) =>
  collection(db, "veterinarias", t, "clientes", cId, "mascotas", mId, "historias")
export const historiaClinicaDoc = (t: string, cId: string, mId: string) =>
  doc(db, "veterinarias", t, "clientes", cId, "mascotas", mId, "historiaClinica", "registro")
export const contadorDoc = (t: string) => doc(db, "veterinarias", t, "config", "contadores")
export const libretasPublicasCol = (t: string) => collection(db, "veterinarias", t, "libretasPublicas")
export const recordatoriosVacunaCol = (t: string) => collection(db, "veterinarias", t, "recordatoriosVacunas")

// ── Helpers de ID ──
/** Convierte texto a slug limpio sin tildes ni espacios */
export function toId(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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
export function historiaDocId(fechaAtencion: string): string {
  return (fechaAtencion ?? "").slice(0, 10).replace(/\//g, "-") || new Date().toISOString().slice(0, 10)
}

/** ID determinístico de invitación: tenant + email normalizado. */
export function invitacionId(tenantId: string, email: string): string {
  return `${tenantId}__${email.trim().toLowerCase().replace(/[^a-z0-9@._-]/g, "_")}`
}
