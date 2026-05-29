import { NextResponse } from "next/server"
import { getTenantsFull, getTurnosByDateRange } from "@/lib/firebase/firestore"
import { planAllows } from "@/lib/plans"
import { sendWhatsAppTemplate } from "@/lib/notifications/whatsapp"

/**
 * Cron: recordatorios de turnos 24 h antes vía WhatsApp.
 *
 * Pensado para ejecutarse una vez al día (ver `vercel.json`). Recorre los
 * tenants con el feature `whatsapp` habilitado, busca los turnos pendientes
 * de mañana y envía un recordatorio por plantilla a cada cliente.
 *
 * Seguridad: requiere header `Authorization: Bearer <CRON_SECRET>`.
 * Vercel Cron envía este header automáticamente si `CRON_SECRET` está seteado.
 *
 * Plantilla: env `WHATSAPP_REMINDER_TEMPLATE` (default "recordatorio_turno"),
 * idioma `WHATSAPP_TEMPLATE_LANG` (default "es_AR"). Params de body:
 * {{1}} nombre, {{2}} hora.
 */

/** Fecha de mañana en formato YYYY-MM-DD (zona del servidor). */
function tomorrowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = request.headers.get("authorization")
  return auth === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 })
  }

  const template = process.env.WHATSAPP_REMINDER_TEMPLATE || "recordatorio_turno"
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "es_AR"
  const fecha = tomorrowISO()

  let enviados = 0
  let omitidos = 0
  let tenantsProcesados = 0

  try {
    const tenants = await getTenantsFull()
    const habilitados = tenants.filter((t) => planAllows(t.plan, "whatsapp"))

    for (const tenant of habilitados) {
      tenantsProcesados++
      const turnos = await getTurnosByDateRange(tenant.slug, fecha, fecha).catch(() => [])
      for (const turno of turnos) {
        const telefono = turno.cliente?.telefono
        if (!telefono) { omitidos++; continue }
        const components = [
          {
            type: "body",
            parameters: [
              { type: "text", text: turno.cliente?.nombre || "Cliente" },
              { type: "text", text: turno.turno?.hora || "" },
            ],
          },
        ]
        const result = await sendWhatsAppTemplate(telefono, template, lang, components)
        if (result.ok) enviados++
        else omitidos++
      }
    }

    return NextResponse.json({ ok: true, fecha, tenantsProcesados, enviados, omitidos })
  } catch (error) {
    console.error("[cron/recordatorios] Error:", error)
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 })
  }
}
