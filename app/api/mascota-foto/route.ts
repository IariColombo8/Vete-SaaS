import { NextResponse } from "next/server"
import { supabase, BUCKET } from "@/lib/supabase/config"
import { getAdminDb } from "@/lib/supabase/admin"

const MAX_BYTES = 5 * 1024 * 1024

/**
 * Sube la foto de perfil de una mascota sin requerir sesión.
 *
 * El visitante no está autenticado, así que el ownership se valida a mano:
 * el DNI que manda tiene que corresponder a un cliente que sea dueño de esa
 * mascota (mismo patrón de verificación que ya hace guardar_cliente_publico
 * del lado de la base). Recién ahí se escribe con la service_role key,
 * porque la policy de Storage (storage_write) solo permite `insert` a staff.
 */
export async function POST(request: Request) {
  const admin = getAdminDb()
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Supabase Admin no configurado en el servidor" },
      { status: 503 },
    )
  }

  const form = await request.formData()
  const tenantId = form.get("tenantId")
  const dni = form.get("dni")
  const mascotaId = form.get("mascotaId")
  const foto = form.get("foto")

  if (
    typeof tenantId !== "string" || !tenantId ||
    typeof dni !== "string" || !dni.trim() ||
    typeof mascotaId !== "string" || !mascotaId ||
    !(foto instanceof File)
  ) {
    return NextResponse.json({ ok: false, error: "Faltan datos" }, { status: 400 })
  }

  if (!foto.type.startsWith("image/")) {
    return NextResponse.json({ ok: false, error: "El archivo tiene que ser una imagen" }, { status: 400 })
  }
  if (foto.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "La imagen no puede pesar más de 5MB" }, { status: 400 })
  }

  // Ownership: el DNI tiene que pertenecer a un cliente de este tenant, y
  // esa mascota tiene que ser suya.
  const { data: cliente } = await supabase
    .rpc("buscar_cliente_publico", { p_tenant: tenantId, p_dni: dni.trim() })
  const clienteFila = Array.isArray(cliente) ? cliente[0] : cliente
  if (!clienteFila) {
    return NextResponse.json({ ok: false, error: "No encontramos un cliente con ese DNI" }, { status: 404 })
  }

  const { data: mascotas } = await supabase
    .rpc("obtener_mascotas_publico", { p_tenant: tenantId, p_cliente_id: clienteFila.id })
  const mascotaActual = (mascotas ?? []).find((m: { id: string; foto_url?: string | null }) => m.id === mascotaId)
  if (!mascotaActual) {
    return NextResponse.json({ ok: false, error: "Ese DNI no corresponde a esta mascota" }, { status: 403 })
  }

  const ext = (foto.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "")
  const path = `${tenantId}/mascotas/${mascotaId}/foto-${Date.now()}.${ext}`
  const buffer = Buffer.from(await foto.arrayBuffer())

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: foto.type,
    cacheControl: "3600",
    upsert: false,
  })
  if (uploadError) {
    console.error("[mascota-foto] Error subiendo:", uploadError.message)
    return NextResponse.json({ ok: false, error: "No se pudo subir la foto" }, { status: 500 })
  }

  const fotoUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

  const { error: updateError } = await admin
    .from("mascotas")
    .update({ foto_url: fotoUrl })
    .eq("id", mascotaId)
    .eq("tenant_id", tenantId)
  if (updateError) {
    console.error("[mascota-foto] Error actualizando mascota:", updateError.message)
    return NextResponse.json({ ok: false, error: "No se pudo guardar la foto" }, { status: 500 })
  }

  // Limpieza best-effort de la foto anterior: si falla no aborta la
  // respuesta (la mascota ya quedó con la foto nueva), solo queda un
  // archivo huérfano que se puede purgar después.
  const fotoAnteriorUrl = mascotaActual.foto_url
  if (fotoAnteriorUrl) {
    const marker = `/${BUCKET}/`
    const idx = fotoAnteriorUrl.indexOf(marker)
    if (idx !== -1) {
      const pathAnterior = decodeURIComponent(fotoAnteriorUrl.slice(idx + marker.length))
      if (pathAnterior && pathAnterior !== path) {
        const { error: removeError } = await admin.storage.from(BUCKET).remove([pathAnterior])
        if (removeError) {
          console.error("[mascota-foto] No se pudo borrar la foto anterior:", removeError.message)
        }
      }
    }
  }

  return NextResponse.json({ ok: true, fotoUrl })
}
