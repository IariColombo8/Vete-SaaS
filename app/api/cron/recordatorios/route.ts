import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/firebase/admin"
import { planAllows } from "@/lib/plans"
import { sendWhatsAppTemplate } from "@/lib/notifications/whatsapp"

/**
 * Cron diario: recordatorios por WhatsApp (vía Admin SDK, bypassa reglas).
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

  const adminDb = getAdminDb()
  if (!adminDb) {
    return NextResponse.json({ ok: false, error: "Firebase Admin no configurado" }, { status: 503 })
  }

  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "es_AR"
  const turnoTemplate = process.env.WHATSAPP_REMINDER_TEMPLATE || "recordatorio_turno"
  const vacunaTemplate = process.env.WHATSAPP_VACUNA_TEMPLATE || "recordatorio_vacuna"
  const fechaTurnos = addDaysISO(1)
  const diasVacuna = Number(process.env.RECORDATORIO_VACUNA_DIAS ?? 7)
  const fechaVacunas = addDaysISO(diasVacuna)

  let turnosEnviados = 0
  let vacunasEnviadas = 0
  let tenantsProcesados = 0

  try {
    const tenantsSnap = await adminDb.collection("veterinarias").get()

    for (const tenantDoc of tenantsSnap.docs) {
      const slug = tenantDoc.id
      const cfgSnap = await adminDb.doc(`veterinarias/${slug}/config/datos`).get()
      const plan = (cfgSnap.data()?.plan as string) ?? "basico"
      if (!planAllows(plan, "whatsapp")) continue
      tenantsProcesados++

      // 1. Recordatorios de turnos de mañana
      const turnosSnap = await adminDb
        .collection(`veterinarias/${slug}/turnos`)
        .where("turno.fecha", "==", fechaTurnos)
        .where("estado", "in", ["pendiente", "confirmado"])
        .get()

      for (const t of turnosSnap.docs) {
        const data = t.data()
        const telefono = data.cliente?.telefono
        if (!telefono) continue
        const components = [
          {
            type: "body",
            parameters: [
              { type: "text", text: data.cliente?.nombre || "Cliente" },
              { type: "text", text: data.turno?.hora || "" },
            ],
          },
        ]
        const r = await sendWhatsAppTemplate(telefono, turnoTemplate, lang, components)
        if (r.ok) turnosEnviados++
      }

      // 2. Recordatorios de vacunas (solo si el plan lo permite)
      if (planAllows(plan, "recordatoriosVacunas")) {
        const vacSnap = await adminDb
          .collection(`veterinarias/${slug}/recordatoriosVacunas`)
          .where("fecha", "==", fechaVacunas)
          .where("enviado", "==", false)
          .get()

        for (const v of vacSnap.docs) {
          const data = v.data()
          if (!data.telefono) continue
          const components = [
            {
              type: "body",
              parameters: [
                { type: "text", text: data.mascotaNombre || "tu mascota" },
                { type: "text", text: data.vacuna || "" },
              ],
            },
          ]
          const r = await sendWhatsAppTemplate(data.telefono, vacunaTemplate, lang, components)
          if (r.ok) {
            vacunasEnviadas++
            await v.ref.update({ enviado: true, enviadoAt: new Date().toISOString() })
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      tenantsProcesados,
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
