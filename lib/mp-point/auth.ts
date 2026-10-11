import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getAdminDb, verificarToken } from "@/lib/supabase/admin"

/**
 * Autorización de las rutas de Point.
 *
 * - `autorizarStaff`: veterinario o empleado del tenant (o superadmin). Cobrar
 *   con la terminal es trabajo de mostrador, igual que vender.
 * - La configuración (pegar el token, elegir terminal) exige dueño: eso lo
 *   resuelve `autorizarDueno` de `lib/billing/dueno.ts`.
 */
export type ResultadoStaff =
  | { ok: true; admin: SupabaseClient; userId: string; role: string }
  | { ok: false; status: number; error: string }

export async function autorizarStaff(request: Request, tenantId: string | null | undefined): Promise<ResultadoStaff> {
  const admin = getAdminDb()
  if (!admin) return { ok: false, status: 503, error: "Supabase Admin no configurado" }
  if (!tenantId) return { ok: false, status: 400, error: "Falta tenantId" }

  const authHeader = request.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  if (!token) return { ok: false, status: 401, error: "Falta token" }

  const user = await verificarToken(token)
  if (!user) return { ok: false, status: 401, error: "Token inválido" }

  const { data, error } = await admin.from("usuarios").select("role, tenant_id").eq("id", user.id).maybeSingle()
  if (error) return { ok: false, status: 500, error: "No se pudo verificar el usuario" }

  const role = (data?.role as string | undefined) ?? ""
  const esStaff = (role === "veterinario" || role === "empleado") && data?.tenant_id === tenantId
  if (!esStaff && role !== "superadmin") return { ok: false, status: 403, error: "Sin permiso sobre este tenant" }

  return { ok: true, admin, userId: user.id, role }
}

export interface ConfigPoint {
  accessToken: string
  terminalId: string | null
  terminalNombre: string | null
  printOnTerminal: boolean
}

/** Config de Point del tenant (incluye el token: solo para uso en el servidor). */
export async function getConfigPoint(admin: SupabaseClient, tenantId: string): Promise<ConfigPoint | null> {
  const { data, error } = await admin
    .from("mp_point_config")
    .select("access_token, terminal_id, terminal_nombre, print_on_terminal")
    .eq("tenant_id", tenantId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    accessToken: data.access_token as string,
    terminalId: (data.terminal_id as string | null) ?? null,
    terminalNombre: (data.terminal_nombre as string | null) ?? null,
    printOnTerminal: (data.print_on_terminal as boolean) ?? true,
  }
}
