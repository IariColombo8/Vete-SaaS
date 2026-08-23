import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseServer } from "@/lib/supabase/server"

/**
 * Callback de OAuth. Google redirige acá con un `code`; lo canjeamos por la
 * sesión (que queda en cookies) y volvemos a donde el usuario estaba.
 *
 * Reemplaza el `signInWithPopup` de Firebase, que resolvía en el mismo tick.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/"

  // Destino relativo únicamente: evita open redirect vía ?next=https://…
  const destino = next.startsWith("/") && !next.startsWith("//") ? next : "/"

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=sin_codigo`)
  }

  const supabase = await createSupabaseServer()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error("[auth/callback] Error al canjear el código:", error.message)
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  // Best-effort: si había una invitación pendiente para este email, aplicarla.
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) {
      await fetch(`${origin}/api/invitaciones/aceptar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  } catch (error) {
    console.error("[auth/callback] Error al aceptar invitación pendiente:", error)
  }

  return NextResponse.redirect(`${origin}${destino}`)
}
