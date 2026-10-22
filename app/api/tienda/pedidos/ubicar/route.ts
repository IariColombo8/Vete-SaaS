import { NextResponse } from "next/server"
import { autorizarPedido, origenDe, verificarPago } from "@/lib/pedidos/servidor"

/**
 * El pedido de la ruta pública /{veterinaria}/pedido/{dni}/{número}.
 *
 * GET ?tenant=&dni=&numero=[&verificar=1]
 * Auth: la cuenta que hizo el pedido (o staff). Con otra cuenta responde lo
 * mismo que si no existiera.
 *
 * `verificar=1` además le pregunta a Mercado Pago por el pago. La primera
 * carga no lo hace, así la página (y el QR) aparece enseguida; el polling sí.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const tenantId = url.searchParams.get("tenant") ?? ""
  const dni = url.searchParams.get("dni") ?? ""
  const numero = Number(url.searchParams.get("numero"))
  if (!tenantId || !dni || !Number.isInteger(numero) || numero <= 0) {
    return NextResponse.json({ ok: false, error: "Pedido no encontrado" }, { status: 404 })
  }

  try {
    const acceso = await autorizarPedido(request, { tenantId, dni, numero })
    if (!acceso.ok) return NextResponse.json({ ok: false, error: acceso.error }, { status: acceso.status })

    let pedido = acceso.pedido
    if (url.searchParams.get("verificar") === "1") {
      try {
        pedido = await verificarPago(acceso.admin, pedido, origenDe(request))
      } catch (error) {
        console.error("[tienda/pedidos/ubicar] verificarPago", pedido.id, error)
      }
    }
    return NextResponse.json({ ok: true, pedido })
  } catch (error) {
    console.error("[tienda/pedidos/ubicar]", error)
    return NextResponse.json({ ok: false, error: "No se pudo cargar el pedido" }, { status: 500 })
  }
}
