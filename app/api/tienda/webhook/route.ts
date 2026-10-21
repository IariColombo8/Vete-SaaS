import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/supabase/admin"
import { cargarPedido, origenDe, verificarPago } from "@/lib/pedidos/servidor"

/**
 * Webhook de Mercado Pago para los pedidos web (`notification_url` de la
 * preferencia, con `?pedido=<id>`).
 *
 * No se confía en el cuerpo: cada cuenta de MP es de una veterinaria y no
 * tenemos su clave de firma. Se usa solo como aviso para volver a consultar
 * el pago con el token del tenant (`verificarPago`). Siempre responde 200
 * para que MP no reintente en loop por un pedido que no existe.
 */
export async function POST(request: Request) {
  const pedidoId = new URL(request.url).searchParams.get("pedido")
  const admin = getAdminDb()
  if (!pedidoId || !admin || !/^[0-9a-f-]{36}$/i.test(pedidoId)) return NextResponse.json({ ok: true })

  try {
    const pedido = await cargarPedido(admin, pedidoId)
    if (pedido) await verificarPago(admin, pedido, origenDe(request))
  } catch (error) {
    console.error("[tienda/webhook]", pedidoId, error)
  }
  return NextResponse.json({ ok: true })
}

// MP a veces prueba la URL con GET.
export async function GET() {
  return NextResponse.json({ ok: true })
}
