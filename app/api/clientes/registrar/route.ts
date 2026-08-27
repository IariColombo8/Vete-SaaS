import { NextResponse } from "next/server"
import { z } from "zod"
import { getAdminDb } from "@/lib/supabase/admin"

/**
 * Alta pública de cliente ("hacerme cliente"). Sin autenticación, así que va
 * por service_role en vez de RLS: `clientes` solo tiene policies de staff/self
 * (ver schema.sql), y abrir un insert anónimo directo en la tabla sería un
 * vector para llenarla de basura sin ningún control server-side.
 */

const bodySchema = z.object({
  tenantId: z.string().min(1),
  nombre: z.string().trim().min(1).max(200),
  telefono: z.string().trim().max(50).optional().default(""),
  email: z.string().trim().email().max(200).optional().or(z.literal("")).default(""),
  dni: z.string().trim().max(20).optional(),
  domicilio: z.string().trim().max(300).optional(),
})

export async function POST(req: Request) {
  const admin = getAdminDb()
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Servicio no disponible" }, { status: 503 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 })
  }

  const { tenantId, nombre, telefono, email, dni, domicilio } = parsed.data

  const { data: tenant } = await admin.from("tenants").select("slug").eq("slug", tenantId).maybeSingle()
  if (!tenant) {
    return NextResponse.json({ ok: false, error: "Veterinaria no encontrada" }, { status: 404 })
  }

  // Mismo criterio de upsert que createCliente (lib/supabase/clientes.ts): si
  // ya existe un cliente con ese DNI, se actualizan sus datos de contacto.
  if (dni) {
    const { data: existente } = await admin
      .from("clientes").select("id").eq("tenant_id", tenantId).eq("dni", dni).maybeSingle()
    if (existente) {
      const { error } = await admin
        .from("clientes")
        .update({ nombre, telefono, email, domicilio: domicilio || null })
        .eq("id", existente.id)
      if (error) return NextResponse.json({ ok: false, error: "No se pudo actualizar tus datos" }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
  }

  const { error } = await admin.from("clientes").insert({
    tenant_id: tenantId, nombre, telefono, email,
    dni: dni || null, domicilio: domicilio || null, historial_datos: [],
  })
  if (error) return NextResponse.json({ ok: false, error: "No se pudo registrar tu alta" }, { status: 500 })

  return NextResponse.json({ ok: true })
}
