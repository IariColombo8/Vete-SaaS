import type { UserRole } from "@/lib/supabase/queries"

/** Secciones del panel admin sujetas a control de acceso por rol. */
export type AdminSection =
  | "dashboard" | "turnos" | "libreta" | "clientes" | "productos"
  | "pos" | "ventas" | "caja" | "configuracion"

/**
 * Permisos por rol dentro del panel de una veterinaria.
 * - veterinario / superadmin: acceso total (incluye configuración y facturación).
 * - empleado: operativo (turnos, libreta, clientes, dashboard) pero NO configuración.
 */
const SECTION_ACCESS: Record<AdminSection, UserRole[]> = {
  dashboard: ["superadmin", "veterinario", "empleado"],
  turnos: ["superadmin", "veterinario", "empleado"],
  libreta: ["superadmin", "veterinario", "empleado"],
  clientes: ["superadmin", "veterinario", "empleado"],
  // El empleado carga mercadería y ajusta stock: es trabajo de mostrador.
  productos: ["superadmin", "veterinario", "empleado"],
  // El mostrador lo atiende el empleado: vender y cobrar es su trabajo.
  pos: ["superadmin", "veterinario", "empleado"],
  ventas: ["superadmin", "veterinario", "empleado"],
  // Abrir y cerrar caja es parte del turno del empleado.
  caja: ["superadmin", "veterinario", "empleado"],
  configuracion: ["superadmin", "veterinario"],
}

/** ¿El rol tiene acceso al panel admin de un tenant (no es cliente común)? */
export function hasAdminAccess(role: UserRole | null | undefined): boolean {
  return role === "superadmin" || role === "veterinario" || role === "empleado"
}

/** ¿El rol puede acceder a una sección concreta del panel? */
export function canAccessSection(role: UserRole | null | undefined, section: AdminSection): boolean {
  if (!role) return false
  return SECTION_ACCESS[section].includes(role)
}

/** Roles que pueden gestionar usuarios e invitaciones del tenant. */
export function canManageTeam(role: UserRole | null | undefined): boolean {
  return role === "superadmin" || role === "veterinario"
}
