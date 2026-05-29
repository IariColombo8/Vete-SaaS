import { NextResponse } from "next/server"
import { canUseFeature } from "@/lib/firebase/firestore"
import { sendWhatsAppTemplate } from "@/lib/notifications/whatsapp"

/**
 * Notificación de confirmación de turno por WhatsApp.
 * Gated por el feature `whatsapp` del plan del tenant.
 *
 * Body: { tenantId, telefono, nombre, fecha, hora }
 *
 * Usa una plantilla aprobada (env `WHATSAPP_CONFIRMACION_TEMPLATE`,
 * default "confirmacion_turno"; idioma `WHATSAPP_TEMPLATE_LANG`, default "es_AR").
 * La plantilla debe tener 3 parámetros de body: {{1}} nombre, {{2}} fecha, {{3}} hora.
 */
export async function POST(request: Request) {
  let body: { tenantId?: string; telefono?: string; nombre?: string; fecha?: string; hora?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  const { tenantId, telefono, nombre, fecha, hora } = body
  if (!tenantId || !telefono) {
    return NextResponse.json({ ok: false, error: "Faltan tenantId o telefono" }, { status: 400 })
  }

  // Feature-gating por plan.
  const habilitado = await canUseFeature(tenantId, "whatsapp").catch(() => false)
  if (!habilitado) {
    return NextResponse.json({ ok: false, skipped: true, reason: "feature_no_disponible" })
  }

  const template = process.env.WHATSAPP_CONFIRMACION_TEMPLATE || "confirmacion_turno"
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "es_AR"
  const components = [
    {
      type: "body",
      parameters: [
        { type: "text", text: nombre || "Cliente" },
        { type: "text", text: fecha || "" },
        { type: "text", text: hora || "" },
      ],
    },
  ]

  const result = await sendWhatsAppTemplate(telefono, template, lang, components)
  const status = result.ok || result.skipped ? 200 : 502
  return NextResponse.json(result, { status })
}
