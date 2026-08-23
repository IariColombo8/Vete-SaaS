import "server-only"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Cliente Supabase con service_role (server-only). Equivalente a
 * `lib/firebase/admin.ts`.
 *
 * Saltea RLS. Se usa para lo que las policies bloquean al cliente:
 * aceptar invitaciones (asignar role/tenantId), webhooks de pago que cambian
 * el plan, y el cron de recordatorios que barre todos los tenants.
 *
 * Credencial vía env: SUPABASE_SECRET_KEY (nunca NEXT_PUBLIC_).
 * Si falta, `getAdminDb()` devuelve null y las rutas responden 503.
 */

let cached: SupabaseClient | null = null

function build(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY

  if (!url || !secret) {
    console.warn("[admin] SUPABASE_SECRET_KEY no configurada")
    return null
  }

  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Cliente con service_role, o null si no hay credenciales. */
export function getAdminDb(): SupabaseClient | null {
  if (cached) return cached
  cached = build()
  return cached
}

/**
 * Equivalente a `getAdminAuth()` de Firebase. En Supabase la administración de
 * usuarios cuelga del mismo cliente: `getAdminAuth()?.admin.getUserById(...)`.
 */
export function getAdminAuth() {
  return getAdminDb()?.auth ?? null
}

/**
 * Valida un access token y devuelve el usuario, o null.
 * Reemplaza `getAdminAuth().verifyIdToken(token)` de Firebase.
 */
export async function verificarToken(token: string) {
  const admin = getAdminDb()
  if (!admin) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error) return null
  return data.user
}
