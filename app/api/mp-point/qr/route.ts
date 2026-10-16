import { NextResponse } from "next/server"
import { autorizarStaff, getConfigPoint } from "@/lib/mp-point/auth"
import {
  asegurarCajaQr,
  crearOrdenQr,
  detalleMP,
  externalPosIdQr,
  MercadoPagoError,
  SinSucursalError,
  type CrearOrdenQrParams,
} from "@/lib/mp-point/api"

/**
 * Genera un QR de Mercado Pago con el monto de la venta.
 *
 * POST { tenantId, monto, descripcion? }
 * Auth: staff del tenant.
 *
 * Usa el mismo token que Point (Configuración → Integraciones), pero no
 * necesita terminal. Guarda la fila en `mp_point_cobros` con
 * `terminal_id = "qr:<caja>"` y devuelve { cobroId, orderId, qrData }. El
 * seguimiento, la cancelación y el vínculo con la venta van por las mismas
 * rutas de `/api/mp-point/cobros/{id}`.
 *
 * La caja de VetPanel se crea la primera vez: si MP responde `pos_not_found`,
 * se crea y se reintenta una sola vez.
 */
export async function POST(request: Request) {
  let payload: { tenantId?: string; monto?: number; descripcion?: string }
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
      return NextResponse.json(
        { ok: false, error: "Conectá tu cuenta de Mercado Pago en Configuración → Integraciones" },
        { status: 409 },
      )
    }

    const externalPosId = externalPosIdQr(tenantId)
    // Referencia corta y única (MP: hasta 64 chars, letras, números y guiones).
    const externalReference = `vp-${tenantId.replace(/[^a-z0-9_-]/gi, "").slice(0, 20)}-${Date.now().toString(36)}`.slice(0, 64)
    const params: CrearOrdenQrParams = {
      externalPosId,
      monto,
      externalReference,
      descripcion: payload.descripcion,
    }

    let orden
    try {
      orden = await crearOrdenQr(config.accessToken, params)
    } catch (e) {
      if (!(e instanceof MercadoPagoError && e.detalle.includes("pos_not_found"))) throw e
      await asegurarCajaQr(config.accessToken, externalPosId)
      orden = await crearOrdenQr(config.accessToken, params)
    }
    if (!orden.qrData) throw new Error("Mercado Pago no devolvió el QR")

    const { data, error } = await auth.admin
      .from("mp_point_cobros")
      .insert({
        tenant_id: tenantId,
        order_id: orden.id,
        external_reference: externalReference,
        terminal_id: `qr:${externalPosId}`,
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

    return NextResponse.json({ ok: true, cobroId: data.id, orderId: orden.id, qrData: orden.qrData })
  } catch (error) {
    console.error("[mp-point/qr POST]", error)
    if (error instanceof SinSucursalError) {
      return NextResponse.json(
        { ok: false, error: "Tu cuenta de Mercado Pago no tiene una sucursal. Creala desde la app de Mercado Pago (Tu negocio → Sucursales) y volvé a intentar." },
        { status: 409 },
      )
    }
    if (error instanceof MercadoPagoError) {
      const msg = error.status === 401
        ? "Mercado Pago rechazó el token de la veterinaria. Revisá la integración."
        : `Mercado Pago no generó el QR. (${detalleMP(error.detalle)})`
      return NextResponse.json({ ok: false, error: msg }, { status: 502 })
    }
    return NextResponse.json({ ok: false, error: "No se pudo generar el QR" }, { status: 500 })
  }
}
