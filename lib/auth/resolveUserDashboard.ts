import { getUserRole, getUsuarioData } from "@/lib/firebase/auth"
import type { UserRole } from "@/lib/firebase/firestore"

export interface DashboardResolution {
  role: UserRole | null
  tenantId: string | null
  redirectTo: string
}

/**
 * Dado un UID, resuelve el rol del usuario y la ruta a la que debe ser redirigido.
 * Centraliza la lógica de redirect post-login que antes estaba duplicada
 * en login, registro, hero-cta y navbar.
 */
export async function resolveUserDashboard(uid: string): Promise<DashboardResolution> {
  const role = await getUserRole(uid)

  if (role === "superadmin") {
    return { role, tenantId: null, redirectTo: "/superadmin" }
  }

  if (role === "veterinario") {
    const data = await getUsuarioData(uid)
    const tenantId = (data?.tenantId as string) || null
    return {
      role,
      tenantId,
      redirectTo: tenantId ? `/${tenantId}/admin` : "/registro",
    }
  }

  return { role: role ?? "usuario", tenantId: null, redirectTo: "/mis-turnos" }
}
