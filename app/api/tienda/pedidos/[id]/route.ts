import { NextResponse } from "next/server"
import { autorizarPedido, origenDe, verificarPago } from "@/lib/pedidos/servidor"

/**
 * Estado de un pedido para su comprador.
 *
 * GET → { ok, pedido }. Si se paga online y todavía no está cobrado, primero
 * le pregunta a Mercado Pago (vuelta del checkout, polling del QR): si el
 * pago se aprobó, el pedido sale ya con su venta y su factura.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const acceso = await autorizarPedido(request, id)
    if (!acceso.ok) return NextResponse.json({ ok: false, error: acceso.error }, { status: acceso.status })

    let pedido = acceso.pedido
    try {
      pedido = await verificarPago(acceso.admin, pedido, origenDe(request))
    } catch (error) {
      // Mercado Pago caído no impide ver el pedido: se reintenta en el próximo poll.
      console.error("[tienda/pedidos GET] verificarPago", id, error)
    }
    return NextResponse.json({ ok: true, pedido })
  } catch (error) {
    console.error("[tienda/pedidos GET]", error)
    return NextResponse.json({ ok: false, error: "No se pudo cargar el pedido" }, { status: 500 })
  }
}
