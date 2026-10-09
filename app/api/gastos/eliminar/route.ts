import { NextResponse } from "next/server"
import { getAdminDb, verificarToken } from "@/lib/supabase/admin"

/**
 * Borra un gasto de verdad. **Solo en desarrollo** (`npm run dev` en localhost),
 * para limpiar lo cargado mientras se prueba.
 *
 * En producción los gastos no se borran nunca, solo se anulan (`anular_gasto`).
 * Por eso esto no es una RPC ni una policy de Supabase: la base es la misma
 * para localhost y para producción, y cualquier permiso de borrado que se le
 * diera ahí valdría también en producción. Acá el borrado lo hace el servidor
 * de Next con service_role, y la ruta responde 404 fuera de desarrollo.
 *
 * Body: { gastoId }
 * Auth: header `Authorization: Bearer <Supabase access token>` — veterinario
 * del tenant del gasto, o superadmin (mismo criterio que la sección Gastos).
 */
export async function POST(request: Request) {
  const host = new URL(request.url).hostname
  const esLocal = host === "localhost" || host === "127.0.0.1" || host === "::1"
  if (process.env.NODE_ENV !== "development" || !esLocal) {
    return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 })
  }

  const admin = getAdminDb()
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Supabase Admin no configurado" }, { status: 503 })
  }

  let payload: { gastoId?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }
  if (!payload.gastoId) {
    return NextResponse.json({ ok: false, error: "Falta gastoId" }, { status: 400 })
  }

  const authHeader = request.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  if (!token) return NextResponse.json({ ok: false, error: "Falta token" }, { status: 401 })

  const user = await verificarToken(token)
  if (!user) return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 401 })

  const [{ data: usuario, error: errorUsuario }, { data: gasto, error: errorGasto }] = await Promise.all([
    admin.from("usuarios").select("role, tenant_id").eq("id", user.id).maybeSingle(),
    admin.from("gastos").select("tenant_id").eq("id", payload.gastoId).maybeSingle(),
  ])
  if (errorUsuario || errorGasto) {
    console.error("Error verificando el borrado de gasto:", errorUsuario ?? errorGasto)
    return NextResponse.json({ ok: false, error: "No se pudo verificar el gasto" }, { status: 500 })
  }
  if (!gasto) return NextResponse.json({ ok: false, error: "El gasto no existe" }, { status: 404 })

  const esDueño = usuario?.role === "veterinario" && usuario?.tenant_id === gasto.tenant_id
  const esSuper = usuario?.role === "superadmin"
  if (!esDueño && !esSuper) {
    return NextResponse.json({ ok: false, error: "Sin permiso sobre este gasto" }, { status: 403 })
  }

  const { error } = await admin.from("gastos").delete().eq("id", payload.gastoId)
  if (error) {
    console.error("Error borrando gasto:", error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
