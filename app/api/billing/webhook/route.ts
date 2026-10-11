import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/supabase/admin"
import { getPreapproval, verificarFirmaWebhook } from "@/lib/billing/mercadopago"
import { aplicarEstadoPreapproval } from "@/lib/billing/aplicar-estado"

/**
 * Webhook de Mercado Pago para suscripciones (preapproval).
 *
 * MP notifica cambios de estado. Verificamos la firma (`x-signature`) y el
 * estado real consultando la API (no confiamos en el payload). La regla de
 * qué hace cada estado con el plan vive en `aplicarEstadoPreapproval`.
 *
 * Configurar en el panel de Mercado Pago → Webhooks: URL
 * `https://www.vetpanel.com.ar/api/billing/webhook`, evento "Planes y
 * suscripciones". La clave secreta que muestra ahí va en `MP_WEBHOOK_SECRET`.
 *
 * Siempre respondemos 200 ante notificaciones que no nos interesan: si no, MP
 * reintenta indefinidamente.
 */
export async function POST(request: Request) {
  const admin = getAdminDb()
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Supabase Admin no configurado" }, { status: 503 })
  }

  const url = new URL(request.url)
  let body: { type?: string; action?: string; data?: { id?: string } } = {}
  try {
    body = await request.json()
  } catch {
    // Algunas notificaciones viejas vienen solo con query params.
  }

  const tipo = body.type || body.action || url.searchParams.get("type") || url.searchParams.get("topic") || ""
  const preapprovalId = body.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id")
  if (!preapprovalId || !tipo.includes("preapproval")) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const firmaOk = verificarFirmaWebhook({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId: url.searchParams.get("data.id") ?? preapprovalId,
  })
  if (firmaOk === false) {
    console.warn("[billing/webhook] Firma inválida para preapproval", preapprovalId)
    return NextResponse.json({ ok: false, error: "Firma inválida" }, { status: 401 })
  }
  if (firmaOk === null && process.env.NODE_ENV === "production") {
    // Sin secreto no hay forma de saber que la notificación es de MP. Como
    // igual consultamos el estado real a la API, el riesgo es bajo, pero se
    // avisa para que no quede sin configurar.
    console.warn("[billing/webhook] MP_WEBHOOK_SECRET no configurado: la firma no se valida")
  }

  try {
    const info = await getPreapproval(preapprovalId)
    if (!info) return NextResponse.json({ ok: true, ignored: true })

    const resultado = await aplicarEstadoPreapproval(admin, info, "webhook")
    if (!resultado) return NextResponse.json({ ok: true, ignored: true })
    return NextResponse.json({ ok: true, ...resultado })
  } catch (error) {
    console.error("[billing/webhook] Error:", error)
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 })
  }
}
