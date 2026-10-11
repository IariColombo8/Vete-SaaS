import { getUserRole, getUsuarioData } from "@/lib/supabase/auth"
import type { UserRole } from "@/lib/supabase/queries"

export interface DashboardResolution {
  role: UserRole | null
  tenantId: string | null
  redirectTo: string
}

/**
 * Dado un UID, resuelve el rol del usuario y la ruta a la que debe ser redirigido.
 * Centraliza la lógica de redirect post-login que antes estaba duplicada
 * en login, registro, hero-cta y navbar.
 *
 * Quien no tiene veterinaria (rol `usuario`, o `veterinario` sin tenant porque
 * su veterinaria se borró) va a /registro: VetPanel es para veterinarias, no
 * hay un área de "mis turnos" separada del panel.
 */
export async function resolveUserDashboard(uid: string): Promise<DashboardResolution> {
  const role = await getUserRole(uid)

  if (role === "superadmin") {
    return { role, tenantId: null, redirectTo: "/superadmin" }
  }

  if (role === "veterinario" || role === "empleado") {
    const data = await getUsuarioData(uid)
    const tenantId = (data?.tenantId as string) || null
    return {
      role,
      tenantId,
      // El empleado sin tenant no debería existir; si pasa, al inicio.
      redirectTo: tenantId ? `/${tenantId}/admin` : role === "veterinario" ? "/registro" : "/",
    }
  }

  return { role: role ?? "usuario", tenantId: null, redirectTo: "/registro" }
}
