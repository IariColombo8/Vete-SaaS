import { supabase } from "./config"
import type { Usuario, Invitacion } from "./types"

/** Usuarios e invitaciones. Mismas firmas que la versión Firestore. */

type Fila = Record<string, unknown>

function aUsuario(f: Fila): Usuario {
  const role = f.role as Usuario["role"]
  return {
    uid: f.id as string,
    email: (f.email as string) ?? null,
    displayName: (f.display_name as string) ?? null,
    photoURL: (f.photo_url as string) ?? null,
    role,
    tenantId: (f.tenant_id as string) ?? undefined,
    // Compat: algunos componentes viejos todavía miran isAdmin
    isAdmin: role === "veterinario" || role === "empleado" || role === "superadmin",
    createdAt: f.created_at,
    lastLogin: f.last_login,
  }
}

function aInvitacion(f: Fila): Invitacion {
  return {
    id: f.id as string,
    email: (f.email as string) ?? "",
    tenantId: (f.tenant_id as string) ?? "",
    role: f.role as Invitacion["role"],
    estado: f.estado as Invitacion["estado"],
    invitedBy: (f.invited_by as string) ?? "",
    createdAt: f.created_at,
  }
}

// ============ USUARIOS ============
export async function getUsuarios(): Promise<Usuario[]> {
  const { data, error } = await supabase.from("usuarios").select("*")
  if (error) {
    console.error("Error al listar usuarios:", error.message)
    return []
  }
  return (data ?? []).map(aUsuario)
}

// ============ INVITACIONES ============
export async function createInvitacion(
  tenantId: string,
  email: string,
  role: "veterinario" | "empleado",
  invitedBy?: string,
): Promise<Invitacion> {
  const { data, error } = await supabase
    .from("invitaciones")
    .upsert(
      {
        tenant_id: tenantId,
        email: email.trim().toLowerCase(),
        role,
        estado: "pendiente",
        invited_by: invitedBy || null,
      },
      { onConflict: "tenant_id,email" },
    )
    .select("*")
    .single()

  if (error) throw new Error(`No se pudo crear la invitación: ${error.message}`)
  return aInvitacion(data)
}

export async function getInvitacionesByTenant(tenantId: string): Promise<Invitacion[]> {
  const { data, error } = await supabase
    .from("invitaciones").select("*").eq("tenant_id", tenantId)
  if (error) return []
  return (data ?? []).map(aInvitacion)
}

export async function deleteInvitacion(id: string): Promise<void> {
  const { error } = await supabase.from("invitaciones").delete().eq("id", id)
  if (error) throw new Error(`No se pudo borrar la invitación: ${error.message}`)
}
