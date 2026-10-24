import { NextResponse } from "next/server"
import { autorizarPedido, iniciarPago, mensajePago, origenDe } from "@/lib/pedidos/servidor"

/**
 * Vuelve a generar el cobro online de un pedido (el QR venció, la tarjeta
 * fue rechazada o el comprador cerró Mercado Pago).
 *
 * POST → { ok, pago } con el mismo formato que el alta del pedido.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const acceso = await autorizarPedido(request, id)
  if (!acceso.ok) return NextResponse.json({ ok: false, error: acceso.error }, { status: acceso.status })

  const { pedido } = acceso
  if (pedido.estado === "cancelado") {
    return NextResponse.json({ ok: false, error: "El pedido está cancelado" }, { status: 409 })
  }
  if (pedido.ventaId || pedido.pagoEstado === "aprobado") {
    return NextResponse.json({ ok: false, error: "El pedido ya está pagado" }, { status: 409 })
  }

  try {
    const pago = await iniciarPago(acceso.admin, pedido, origenDe(request))
    return NextResponse.json({ ok: true, pago })
  } catch (error) {
    console.error("[tienda/pedidos/pagar]", id, error)
    return NextResponse.json({ ok: false, error: mensajePago(error) }, { status: 502 })
  }
}
