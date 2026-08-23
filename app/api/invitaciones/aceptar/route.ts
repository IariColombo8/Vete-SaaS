import { NextResponse } from "next/server"
import { getAdminDb, verificarToken } from "@/lib/supabase/admin"

/**
 * Acepta automáticamente una invitación pendiente para el usuario autenticado.
 *
 * Se llama tras el login. Valida el access token de Supabase, busca una
 * invitación pendiente para el email del usuario y, si existe, asigna
 * `role` + `tenant_id` en su fila de `usuarios` con la service_role key
 * (las policies impiden que el propio usuario se asigne rol).
 *
 * Auth: header `Authorization: Bearer <Supabase access token>`.
 */
export async function POST(request: Request) {
  const admin = getAdminDb()
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Supabase Admin no configurado en el servidor" },
      { status: 503 },
    )
  }

  const authHeader = request.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  if (!token) {
    return NextResponse.json({ ok: false, error: "Falta el token" }, { status: 401 })
  }

  const user = await verificarToken(token)
  if (!user) {
    return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 401 })
  }

  const email = user.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: true, applied: false, reason: "sin_email" })
  }

  try {
    const { data: inv, error } = await admin
      .from("invitaciones")
      .select("id, tenant_id, role")
      .eq("email", email)
      .eq("estado", "pendiente")
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (!inv) {
      return NextResponse.json({ ok: true, applied: false })
    }

    const { error: errUsuario } = await admin
      .from("usuarios")
      .update({ role: inv.role, tenant_id: inv.tenant_id })
      .eq("id", user.id)
    if (errUsuario) throw errUsuario

    await admin
      .from("invitaciones")
      .update({ estado: "aceptada" })
      .eq("id", inv.id)

    return NextResponse.json({
      ok: true,
      applied: true,
      role: inv.role,
      tenantId: inv.tenant_id,
    })
  } catch (error) {
    console.error("[invitaciones/aceptar] Error:", error)
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 })
  }
}
