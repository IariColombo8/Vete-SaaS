import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getAdminDb, verificarToken } from "@/lib/supabase/admin"

/**
 * Autorización compartida por las rutas de billing: el que llama tiene que ser
 * el veterinario dueño del tenant (o superadmin). Un empleado no contrata ni
 * cancela planes.
 *
 * Devuelve el cliente admin ya resuelto para no repetir el 503 en cada ruta.
 */
export type ResultadoDueno =
  | { ok: true; admin: SupabaseClient; userId: string; email: string; esSuper: boolean }
  | { ok: false; status: number; error: string }

export async function autorizarDueno(request: Request, tenantId: string | null | undefined): Promise<ResultadoDueno> {
  const admin = getAdminDb()
  if (!admin) return { ok: false, status: 503, error: "Supabase Admin no configurado" }
  if (!tenantId) return { ok: false, status: 400, error: "Falta tenantId" }

  const authHeader = request.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  if (!token) return { ok: false, status: 401, error: "Falta token" }

  const user = await verificarToken(token)
  if (!user) return { ok: false, status: 401, error: "Token inválido" }

  const { data: userData, error } = await admin
    .from("usuarios")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle()
  if (error) return { ok: false, status: 500, error: "No se pudo verificar el usuario" }

  const esDueno = userData?.role === "veterinario" && userData?.tenant_id === tenantId
  const esSuper = userData?.role === "superadmin"
  if (!esDueno && !esSuper) return { ok: false, status: 403, error: "Sin permiso sobre este tenant" }

  return { ok: true, admin, userId: user.id, email: user.email || "", esSuper }
}
