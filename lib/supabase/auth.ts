import { supabase } from "./config"
import type { User } from "@supabase/supabase-js"
import type { UserRole } from "./types"

/**
 * Auth con Supabase. Equivalente a `lib/firebase/auth.ts`.
 *
 * Diferencia de comportamiento vs Firebase: Google usa REDIRECT, no popup.
 * `signInWithGoogle()` navega fuera de la página y vuelve a /auth/callback.
 * No devuelve el usuario — quien llama debe dejar que la página se vaya.
 *
 * La creación de la fila en `usuarios` la hace un trigger sobre auth.users
 * (ver supabase/schema.sql). Ya no hace falta `createOrUpdateUser` ni la
 * lógica legacy de `findUserDoc` que buscaba por docId y por campo `uid`.
 */

export type { User }

/** Inicia el flujo OAuth de Google. Redirige: no retorna un usuario. */
export const signInWithGoogle = async (redirectTo?: string) => {
  const destino = redirectTo ?? window.location.pathname
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destino)}`,
    },
  })
  if (error) throw error
}

/** Registro con email y contraseña. No requiere configurar ningún proveedor OAuth. */
export const signUpWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  return data.user
}

/** Login con email y contraseña. */
export const signInWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user
}

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export const getCurrentUser = async (): Promise<User | null> => {
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}

/**
 * Escucha cambios de sesión. Misma firma que el `onAuthStateChanged` de
 * Firebase: recibe un callback con el usuario (o null) y devuelve un
 * unsubscribe.
 */
export const onAuthStateChanged = (
  callback: (user: User | null) => void,
): (() => void) => {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null)
  })
  return () => data.subscription.unsubscribe()
}

/** Fila de `usuarios` del uid dado, en forma camelCase. */
export const getUsuarioData = async (
  uid: string,
): Promise<Record<string, unknown> | null> => {
  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .eq("id", uid)
    .maybeSingle()

  if (error) {
    console.error("Error al obtener datos del usuario:", error.message)
    return null
  }
  if (!data) return null

  return {
    uid: data.id,
    email: data.email,
    displayName: data.display_name,
    photoURL: data.photo_url,
    role: data.role,
    tenantId: data.tenant_id ?? undefined,
    createdAt: data.created_at,
    lastLogin: data.last_login,
  }
}

export const getUserRole = async (uid: string): Promise<UserRole | null> => {
  const { data, error } = await supabase
    .from("usuarios")
    .select("role")
    .eq("id", uid)
    .maybeSingle()

  if (error) {
    console.error("Error al obtener rol:", error.message)
    return null
  }
  return (data?.role as UserRole) ?? null
}

/** Actualiza campos del usuario. Acepta claves camelCase como la versión Firebase. */
export const updateUsuario = async (
  uid: string,
  data: Record<string, unknown>,
): Promise<void> => {
  const mapa: Record<string, string> = {
    displayName: "display_name",
    photoURL: "photo_url",
    tenantId: "tenant_id",
    lastLogin: "last_login",
  }
  const payload: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (k === "uid" || k === "id" || k === "isAdmin") continue
    payload[mapa[k] ?? k] = v
  }
  if (Object.keys(payload).length === 0) return

  const { error } = await supabase.from("usuarios").update(payload).eq("id", uid)
  if (error) console.error("Error al actualizar usuario:", error.message)
}

/** ¿Tiene acceso al panel admin? (veterinario, empleado o superadmin) */
export const checkIfUserIsAdmin = async (uid: string): Promise<boolean> => {
  const role = await getUserRole(uid)
  return role === "veterinario" || role === "empleado" || role === "superadmin"
}
