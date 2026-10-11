import { NextResponse } from "next/server"
import { autorizarStaff } from "@/lib/mp-point/auth"

/**
 * Ata un cobro Point aprobado a la venta que el mostrador registró después.
 *
 * POST { tenantId, ventaId }
 * Auth: staff del tenant.
 *
 * `ventas` es solo-select por RLS, así que el vínculo lo escribe el servidor
 * con service_role, verificando que cobro y venta sean del mismo tenant.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let payload: { tenantId?: string; ventaId?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }
  const auth = await autorizarStaff(request, payload.tenantId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  if (!payload.ventaId) return NextResponse.json({ ok: false, error: "Falta ventaId" }, { status: 400 })
  const tenantId = payload.tenantId as string

  try {
    const { data: cobro, error: errCobro } = await auth.admin
      .from("mp_point_cobros")
      .select("id, order_id, payment_id, venta_id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle()
    if (errCobro) throw errCobro
    if (!cobro) return NextResponse.json({ ok: false, error: "Cobro no encontrado" }, { status: 404 })
    if (cobro.venta_id && cobro.venta_id !== payload.ventaId) {
      return NextResponse.json({ ok: false, error: "Este cobro ya está asociado a otra venta" }, { status: 409 })
    }

    const { data: venta, error: errVenta } = await auth.admin
      .from("ventas")
      .select("id")
      .eq("id", payload.ventaId)
      .eq("tenant_id", tenantId)
      .maybeSingle()
    if (errVenta) throw errVenta
    if (!venta) return NextResponse.json({ ok: false, error: "Venta no encontrada" }, { status: 404 })

    const { error: e1 } = await auth.admin
      .from("mp_point_cobros")
      .update({ venta_id: payload.ventaId, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (e1) throw e1

    const { error: e2 } = await auth.admin
      .from("ventas")
      .update({ mp_order_id: cobro.order_id, mp_payment_id: cobro.payment_id })
      .eq("id", payload.ventaId)
    if (e2) throw e2

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[mp-point/vincular]", error)
    return NextResponse.json({ ok: false, error: "No se pudo asociar el cobro a la venta" }, { status: 500 })
  }
}
