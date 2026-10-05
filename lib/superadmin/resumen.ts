import type { TenantFull, UserRole, Usuario } from "@/lib/supabase/types"

const DIA_MS = 24 * 60 * 60 * 1000

export type EstadoFiltro = "todas" | "activas" | "pausadas"
export type PlanFiltro = "todos" | NonNullable<TenantFull["plan"]>
export type RolFiltro = "todos" | UserRole

export interface EstadoTrial {
  tipo: "sin-trial" | "activo" | "vencido"
  diasRestantes: number | null
}

/** Mismo criterio que `getTrialStatus` (lib/plans.ts), con `ahora` inyectable para testear. */
export function estadoTrial(trialExpiresAt: string | null | undefined, ahora: Date = new Date()): EstadoTrial {
  if (!trialExpiresAt) return { tipo: "sin-trial", diasRestantes: null }
  const restanteMs = new Date(trialExpiresAt).getTime() - ahora.getTime()
  if (restanteMs <= 0) return { tipo: "vencido", diasRestantes: 0 }
  return { tipo: "activo", diasRestantes: Math.ceil(restanteMs / DIA_MS) }
}

/** `role` es la fuente de verdad; `isAdmin` queda de las cuentas viejas. */
export function rolDeUsuario(u: Usuario): UserRole {
  return u.role || (u.isAdmin ? "veterinario" : "usuario")
}

export interface ResumenPlataforma {
  veterinarias: number
  activas: number
  pausadas: number
  enTrial: number
  trialVencido: number
  usuarios: number
  staff: number
  superadmins: number
}

export function resumenPlataforma(
  tenants: TenantFull[],
  usuarios: Usuario[],
  ahora: Date = new Date(),
): ResumenPlataforma {
  const pausadas = tenants.filter((t) => t.status === "pausado").length
  const trials = tenants.map((t) => estadoTrial(t.trialExpiresAt, ahora).tipo)
  const roles = usuarios.map(rolDeUsuario)
  return {
    veterinarias: tenants.length,
    activas: tenants.length - pausadas,
    pausadas,
    enTrial: trials.filter((t) => t === "activo").length,
    trialVencido: trials.filter((t) => t === "vencido").length,
    usuarios: usuarios.length,
    staff: roles.filter((r) => r === "veterinario" || r === "empleado").length,
    superadmins: roles.filter((r) => r === "superadmin").length,
  }
}

/**
 * Activas primero y pausadas al final; dentro de cada grupo, alfabético.
 * Los filtros se aplican antes de ordenar.
 */
export function filtrarTenants(
  tenants: TenantFull[],
  filtros: { busqueda: string; estado: EstadoFiltro; plan: PlanFiltro },
): TenantFull[] {
  const q = filtros.busqueda.trim().toLowerCase()
  return tenants
    .filter((t) => {
      const pausada = t.status === "pausado"
      if (filtros.estado === "activas" && pausada) return false
      if (filtros.estado === "pausadas" && !pausada) return false
      if (filtros.plan !== "todos" && (t.plan ?? "basico") !== filtros.plan) return false
      if (q && !(t.nombre ?? t.slug).toLowerCase().includes(q) && !t.slug.toLowerCase().includes(q)) return false
      return true
    })
    .sort((a, b) => {
      const aPausada = a.status === "pausado"
      const bPausada = b.status === "pausado"
      if (aPausada !== bPausada) return aPausada ? 1 : -1
      return (a.nombre ?? a.slug).localeCompare(b.nombre ?? b.slug)
    })
}

export function filtrarUsuarios(usuarios: Usuario[], busqueda: string, rol: RolFiltro): Usuario[] {
  const q = busqueda.trim().toLowerCase()
  return usuarios.filter((u) => {
    if (rol !== "todos" && rolDeUsuario(u) !== rol) return false
    if (!q) return true
    return (u.displayName ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q)
  })
}
