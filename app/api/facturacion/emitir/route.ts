import { NextResponse } from "next/server"
import { autorizarStaff } from "@/lib/mp-point/auth"
import { emitirFacturaDeVenta, emitirNotaCredito, FacturacionError, getConfigFiscal } from "@/lib/facturacion/emitir"
import { WsaaError } from "@/lib/facturacion/wsaa"
import { WsfeError } from "@/lib/facturacion/wsfe"

/**
 * Emite comprobantes electrónicos.
 *
 * POST { tenantId, ventaId }          → factura de la venta (idempotente).
 * POST { tenantId, comprobanteId }    → nota de crédito que anula esa factura.
 * Auth: staff del tenant (facturar es trabajo de mostrador).
 *
 * Responde { ok, comprobante: { comprobanteId, estado, tipoCbte, numero, cae,
 * caeVto, observaciones } }. Un rechazo de ARCA se guarda igual (estado
 * `rechazado`) y vuelve con `ok: false` y los mensajes de ARCA tal cual.
 */
export async function POST(request: Request) {
  let p: { tenantId?: string; ventaId?: string; comprobanteId?: string }
  try {
    p = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }
  const auth = await autorizarStaff(request, p.tenantId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const tenantId = p.tenantId as string

  try {
    const cfg = await getConfigFiscal(auth.admin, tenantId)
    if (!cfg) {
      return NextResponse.json(
        { ok: false, error: "La factura electrónica no está configurada. Pedile al dueño que la active en Configuración → Integraciones." },
        { status: 409 },
      )
    }

    const r = p.comprobanteId
      ? await emitirNotaCredito(auth.admin, cfg, p.comprobanteId, auth.userId)
      : p.ventaId
        ? await emitirFacturaDeVenta(auth.admin, cfg, p.ventaId, auth.userId)
        : null
    if (!r) return NextResponse.json({ ok: false, error: "Falta ventaId o comprobanteId" }, { status: 400 })

    if (r.estado === "rechazado") {
      const motivo = r.observaciones.map((o) => `${o.code}: ${o.msg}`).join(" · ") || "ARCA rechazó el comprobante"
      return NextResponse.json({ ok: false, error: motivo, comprobante: r }, { status: 422 })
    }
    return NextResponse.json({ ok: true, comprobante: r })
  } catch (error) {
    if (error instanceof FacturacionError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status })
    }
    if (error instanceof WsaaError || error instanceof WsfeError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 502 })
    }
    console.error("[facturacion/emitir]", error)
    return NextResponse.json({ ok: false, error: "No se pudo emitir el comprobante" }, { status: 500 })
  }
}
