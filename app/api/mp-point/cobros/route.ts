import { NextResponse } from "next/server"
import { autorizarStaff, getConfigPoint } from "@/lib/mp-point/auth"
import { crearOrdenPoint, MercadoPagoError, type TipoTarjeta } from "@/lib/mp-point/api"

/**
 * Manda un cobro a la terminal Point de la veterinaria.
 *
 * POST { tenantId, monto, descripcion?, tipoTarjeta?: "credit_card"|"debit_card", cuotas? }
 * Auth: staff del tenant.
 *
 * Crea la orden en Mercado Pago con el token del tenant, guarda la fila en
 * `mp_point_cobros` y devuelve { cobroId, orderId, estado }. El mostrador
 * consulta GET /api/mp-point/cobros/{cobroId} hasta que se resuelva.
 */
export async function POST(request: Request) {
  let payload: { tenantId?: string; monto?: number; descripcion?: string; tipoTarjeta?: TipoTarjeta; cuotas?: number }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  const auth = await autorizarStaff(request, payload.tenantId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const tenantId = payload.tenantId as string

  const monto = Math.round(Number(payload.monto) * 100) / 100
  if (!Number.isFinite(monto) || monto <= 0) {
    return NextResponse.json({ ok: false, error: "Monto inválido" }, { status: 400 })
  }

  try {
    const config = await getConfigPoint(auth.admin, tenantId)
    if (!config) {
      return NextResponse.json({ ok: false, error: "Mercado Pago Point no está conectado" }, { status: 409 })
    }
    if (!config.terminalId) {
      return NextResponse.json({ ok: false, error: "Elegí una terminal en Configuración → Integraciones" }, { status: 409 })
    }

    // Referencia corta y única (MP: hasta 64 chars, sin datos personales).
    const externalReference = `vp-${tenantId.slice(0, 20)}-${Date.now().toString(36)}`.slice(0, 64)

    const orden = await crearOrdenPoint(config.accessToken, {
      terminalId: config.terminalId,
      monto,
      externalReference,
      descripcion: payload.descripcion,
      imprimirTicket: config.printOnTerminal,
      tipoTarjeta: payload.tipoTarjeta,
      cuotas: payload.cuotas,
    })

    const { data, error } = await auth.admin
      .from("mp_point_cobros")
      .insert({
        tenant_id: tenantId,
        order_id: orden.id,
        external_reference: externalReference,
        terminal_id: config.terminalId,
        monto,
        descripcion: payload.descripcion ?? null,
        estado: orden.status,
        estado_detalle: orden.statusDetail,
        payment_id: orden.paymentId,
        usuario_id: auth.userId,
      })
      .select("id")
      .single()
    if (error) throw error

    return NextResponse.json({ ok: true, cobroId: data.id, orderId: orden.id, estado: orden.status })
  } catch (error) {
    console.error("[mp-point/cobros POST]", error)
    if (error instanceof MercadoPagoError) {
      const msg = error.status === 401
        ? "Mercado Pago rechazó el token de la veterinaria. Revisá la integración."
        : error.status === 409
          ? "La terminal ya tiene un cobro en curso. Cancelalo o esperá a que termine."
          : "Mercado Pago no aceptó la orden. Verificá que la terminal esté encendida y en modo PDV."
      return NextResponse.json({ ok: false, error: msg }, { status: 502 })
    }
    return NextResponse.json({ ok: false, error: "No se pudo enviar el cobro a la terminal" }, { status: 500 })
  }
}
