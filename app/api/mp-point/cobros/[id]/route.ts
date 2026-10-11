import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { autorizarStaff, getConfigPoint } from "@/lib/mp-point/auth"
import { cancelarOrdenPoint, getOrdenPoint, interpretarOrden, type OrdenPoint } from "@/lib/mp-point/api"

/**
 * Seguimiento de un cobro Point.
 *
 *  GET    ?tenantId=   → consulta la orden en MP, actualiza la fila y devuelve
 *                        { estado, resultado, paymentId }. El mostrador lo
 *                        llama cada 2 segundos mientras `resultado === "en_curso"`.
 *  DELETE { tenantId } → cancela la orden (el vendedor se arrepintió o el
 *                        cliente no tiene la tarjeta).
 */
type Params = { params: Promise<{ id: string }> }

async function cargarCobro(admin: SupabaseClient, id: string, tenantId: string) {
  const { data, error } = await admin
    .from("mp_point_cobros")
    .select("id, order_id, estado, payment_id, venta_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle()
  if (error) throw error
  return data
}

async function actualizarCobro(
  admin: SupabaseClient,
  id: string,
  orden: OrdenPoint,
) {
  const { error } = await admin
    .from("mp_point_cobros")
    .update({
      estado: orden.status,
      estado_detalle: orden.paymentStatusDetail ?? orden.statusDetail,
      payment_id: orden.paymentId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) throw error
}

export async function GET(request: Request, { params }: Params) {
  const { id } = await params
  const tenantId = new URL(request.url).searchParams.get("tenantId")
  const auth = await autorizarStaff(request, tenantId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  try {
    const cobro = await cargarCobro(auth.admin, id, tenantId as string)
    if (!cobro) return NextResponse.json({ ok: false, error: "Cobro no encontrado" }, { status: 404 })
    const config = await getConfigPoint(auth.admin, tenantId as string)
    if (!config) return NextResponse.json({ ok: false, error: "Point no está conectado" }, { status: 409 })

    const orden = await getOrdenPoint(config.accessToken, cobro.order_id as string)
    await actualizarCobro(auth.admin, id, orden)

    return NextResponse.json({
      ok: true,
      estado: orden.status,
      detalle: orden.paymentStatusDetail ?? orden.statusDetail,
      resultado: interpretarOrden(orden),
      paymentId: orden.paymentId,
      ventaId: cobro.venta_id,
    })
  } catch (error) {
    console.error("[mp-point/cobros GET]", error)
    return NextResponse.json({ ok: false, error: "No se pudo consultar el cobro" }, { status: 502 })
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params
  let payload: { tenantId?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }
  const auth = await autorizarStaff(request, payload.tenantId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  try {
    const cobro = await cargarCobro(auth.admin, id, payload.tenantId as string)
    if (!cobro) return NextResponse.json({ ok: false, error: "Cobro no encontrado" }, { status: 404 })
    const config = await getConfigPoint(auth.admin, payload.tenantId as string)
    if (!config) return NextResponse.json({ ok: false, error: "Point no está conectado" }, { status: 409 })

    const orden = await cancelarOrdenPoint(config.accessToken, cobro.order_id as string)
    if (orden) {
      await actualizarCobro(auth.admin, id, orden)
      return NextResponse.json({ ok: true, estado: orden.status, resultado: interpretarOrden(orden) })
    }
    // 202: la terminal ya la tomó; la cancelación se confirma en el próximo poll.
    return NextResponse.json({ ok: true, estado: "cancelacion_pedida", resultado: "en_curso" })
  } catch (error) {
    console.error("[mp-point/cobros DELETE]", error)
    return NextResponse.json({ ok: false, error: "No se pudo cancelar el cobro" }, { status: 502 })
  }
}
