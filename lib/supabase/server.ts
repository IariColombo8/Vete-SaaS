import "server-only"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * Cliente Supabase para Server Components, Route Handlers y Server Actions.
 * Lee la sesión desde cookies (las escribe `createBrowserClient` en el cliente).
 *
 * Respeta RLS: actúa como el usuario logueado. Para operaciones privilegiadas
 * usar `lib/supabase/admin.ts`.
 */
export async function createSupabaseServer() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server Component: no puede escribir cookies. El refresh de sesión
            // lo hace el middleware, así que es seguro ignorarlo.
          }
        },
      },
    },
  )
}
