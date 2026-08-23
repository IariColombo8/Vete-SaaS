import { createBrowserClient } from "@supabase/ssr"

/**
 * Cliente Supabase del navegador. Equivalente a `lib/firebase/config.ts`.
 *
 * Usa `createBrowserClient` de @supabase/ssr (no `createClient`) para que la
 * sesión viva en cookies y el servidor pueda leerla en Server Components.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env.local",
  )
}

export const supabase = createBrowserClient(url, key)

/** Bucket único de Storage (ex Firebase Storage). */
export const BUCKET = "veterinarias"

export default supabase
