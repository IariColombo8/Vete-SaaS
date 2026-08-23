import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/supabase/admin"
import { planAllows } from "@/lib/plans"
import { sendWhatsAppTemplate } from "@/lib/notifications/whatsapp"

/**
 * Cron diario: recordatorios por WhatsApp (service_role, bypassa RLS).
 *
 *  1. Turnos de mañana (estado pendiente/confirmado) → recordatorio de turno.
 *  2. Vacunas que vencen en `RECORDATORIO_VACUNA_DIAS` días (default 7) →
 *     recordatorio de vacuna (marca `enviado` para no repetir).
 *
 * Solo procesa tenants con el feature `whatsapp` habilitado.
 * Seguridad: header `Authorization: Bearer <CRON_SECRET>` (lo envía Vercel Cron).
 *
 * Plantillas (env): `WHATSAPP_REMINDER_TEMPLATE` (turno, params nombre+hora),
 * `WHATSAPP_VACUNA_TEMPLATE` (vacuna, params nombre+vacuna). Idioma `WHATSAPP_TEMPLATE_LANG`.
 *
 * Nota: en Firestore esto hacía 1 + 3N lecturas (una tanda por tenant). Acá son
 * 3 queries en total, filtrando por la lista de tenants habilitados.
 */

function addDaysISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get("authorization") === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 })
  }

  const admin = getAdminDb()
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Supabase Admin no configurado" }, { status: 503 })
  }

  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "es_AR"
  const turnoTemplate = process.env.WHATSAPP_REMINDER_TEMPLATE || "recordatorio_turno"
  const vacunaTemplate = process.env.WHATSAPP_VACUNA_TEMPLATE || "recordatorio_vacuna"
  const fechaTurnos = addDaysISO(1)
  const diasVacuna = Number(process.env.RECORDATORIO_VACUNA_DIAS ?? 7)
  const fechaVacunas = addDaysISO(diasVacuna)

  let turnosEnviados = 0
  let vacunasEnviadas = 0

  try {
    const { data: tenants, error: errTenants } = await admin
      .from("tenants")
      .select("slug, plan")
    if (errTenants) throw errTenants

    const conWhatsapp = (tenants ?? []).filter((t) => planAllows(t.plan, "whatsapp"))
    const conVacunas = conWhatsapp.filter((t) => planAllows(t.plan, "recordatoriosVacunas"))

    if (conWhatsapp.length === 0) {
      return NextResponse.json({
        ok: true, tenantsProcesados: 0, turnosEnviados: 0, vacunasEnviadas: 0,
        fechaTurnos, fechaVacunas,
      })
    }

    // 1. Turnos de mañana, de todos los tenants habilitados
    const { data: turnos, error: errTurnos } = await admin
      .from("turnos")
      .select("cliente_nombre, cliente_telefono, hora")
      .in("tenant_id", conWhatsapp.map((t) => t.slug))
      .eq("fecha", fechaTurnos)
      .in("estado", ["pendiente", "confirmado"])
    if (errTurnos) throw errTurnos

    for (const turno of turnos ?? []) {
      if (!turno.cliente_telefono) continue
      const components = [
        {
          type: "body",
          parameters: [
            { type: "text", text: turno.cliente_nombre || "Cliente" },
            { type: "text", text: turno.hora || "" },
          ],
        },
      ]
      const r = await sendWhatsAppTemplate(turno.cliente_telefono, turnoTemplate, lang, components)
      if (r.ok) turnosEnviados++
    }

    // 2. Vacunas que vencen, de los tenants con ese feature
    if (conVacunas.length > 0) {
      const { data: vacunas, error: errVacunas } = await admin
        .from("recordatorios_vacunas")
        .select("id, telefono, mascota_nombre, vacuna")
        .in("tenant_id", conVacunas.map((t) => t.slug))
        .eq("fecha", fechaVacunas)
        .eq("enviado", false)
      if (errVacunas) throw errVacunas

      for (const v of vacunas ?? []) {
        if (!v.telefono) continue
        const components = [
          {
            type: "body",
            parameters: [
              { type: "text", text: v.mascota_nombre || "tu mascota" },
              { type: "text", text: v.vacuna || "" },
            ],
          },
        ]
        const r = await sendWhatsAppTemplate(v.telefono, vacunaTemplate, lang, components)
        if (r.ok) {
          vacunasEnviadas++
          await admin.from("recordatorios_vacunas").update({ enviado: true }).eq("id", v.id)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      tenantsProcesados: conWhatsapp.length,
      turnosEnviados,
      vacunasEnviadas,
      fechaTurnos,
      fechaVacunas,
    })
  } catch (error) {
    console.error("[cron/recordatorios] Error:", error)
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 })
  }
}
