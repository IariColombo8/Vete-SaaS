import type { TenantFull, UserRole } from "@/lib/supabase/types"
import type { EstadoTrial } from "@/lib/superadmin/resumen"
import { cn } from "@/lib/utils"

/**
 * Pastillas de estado del panel. Cada color quiere decir algo: verde = bien,
 * ámbar = hay que mirarlo, rojo = requiere acción. Antes el plan Pro se pintaba
 * con la variante "destructive" y parecía un error.
 */
function Pastilla({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", className)}>
      {children}
    </span>
  )
}

const PUNTO = "size-1.5 rounded-full bg-current"

export function EstadoTenant({ status }: { status: TenantFull["status"] }) {
  return status === "pausado" ? (
    <Pastilla className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
      <span className={PUNTO} /> Pausada
    </Pastilla>
  ) : (
    <Pastilla className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
      <span className={PUNTO} /> Activa
    </Pastilla>
  )
}

export function EtiquetaTrial({ estado }: { estado: EstadoTrial }) {
  if (estado.tipo === "sin-trial") {
    return <Pastilla className="bg-muted text-muted-foreground">Sin prueba</Pastilla>
  }
  if (estado.tipo === "vencido") {
    return <Pastilla className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Prueba vencida</Pastilla>
  }
  const urgente = (estado.diasRestantes ?? 0) <= 3
  return (
    <Pastilla
      className={
        urgente
          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
          : "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
      }
    >
      {estado.diasRestantes === 1 ? "Vence mañana" : `Vence en ${estado.diasRestantes} días`}
    </Pastilla>
  )
}

const ROLES: Record<UserRole, { label: string; className: string }> = {
  superadmin:  { label: "Superadmin",  className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  veterinario: { label: "Veterinario", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  empleado:    { label: "Empleado",    className: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  usuario:     { label: "Cliente",     className: "bg-muted text-muted-foreground" },
}

export const ETIQUETA_ROL: Record<UserRole, string> = {
  superadmin: ROLES.superadmin.label,
  veterinario: ROLES.veterinario.label,
  empleado: ROLES.empleado.label,
  usuario: ROLES.usuario.label,
}

export function EtiquetaRol({ rol }: { rol: UserRole }) {
  const r = ROLES[rol] ?? ROLES.usuario
  return <Pastilla className={r.className}>{r.label}</Pastilla>
}

export const NOMBRE_PLAN: Record<NonNullable<TenantFull["plan"]>, string> = {
  basico: "Básico",
  pro: "Pro",
}
