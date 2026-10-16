import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/supabase/admin"
import { planAllows } from "@/lib/plans"
import { cargarPlanesServidor } from "@/lib/planes-servidor"
import { sendWhatsAppTemplate } from "@/lib/notifications/whatsapp"
import {
  DIAS_AVISO_DEFAULT,
  MAX_INTENTOS,
  fechaArgentina,
  fechaCorta,
  rangoCron,
  sumarDias,
} from "@/lib/recordatorios/vacunas"

/**
 * Cron diario: recordatorios por WhatsApp (service_role, bypassa RLS).
 *
 *  1. Turnos de mañana (estado pendiente/confirmado) → recordatorio de turno.
 *  2. Vacunas/desparasitaciones con próxima dosis dentro de
 *     `RECORDATORIO_VACUNA_DIAS` días (default 7) → recordatorio. Toma un
 *     RANGO (desde hace 3 días hasta dentro de N), no una fecha exacta: si el
 *     cron no corrió algún día, lo que quedó atrás sale igual. Los
 *     recordatorios los crea un trigger desde la historia (060).
 *
 * Solo procesa tenants con el feature `whatsapp` (y `recordatoriosVacunas`
 * para el punto 2). Los demás avisan a mano desde el Dashboard con wa.me.
 * Seguridad: header `Authorization: Bearer <CRON_SECRET>` (lo envía Vercel Cron).
 *
 * Plantillas (env), idioma `WHATSAPP_TEMPLATE_LANG`:
 *  - `WHATSAPP_REMINDER_TEMPLATE` (turno): {{1}} nombre, {{2}} hora.
 *  - `WHATSAPP_VACUNA_TEMPLATE_V2` (vacuna, recomendada): {{1}} dueño,
 *    {{2}} mascota, {{3}} vacuna, {{4}} fecha (dd/mm), {{5}} veterinaria, y un
 *    botón URL dinámico `https://www.vetpanel.com.ar/{{1}}` (Meta solo acepta la
 *    variable al final; el sufijo que se manda es `{slug}/turno`).
 *  - Sin la V2 se usa `WHATSAPP_VACUNA_TEMPLATE` (la vieja): {{1}} mascota, {{2}} vacuna.
 */

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get("authorization") === `Bearer ${secret}`
}

interface FilaRecordatorio {
  id: string
  tenant_id: string
  telefono: string | null
  mascota_nombre: string | null
  vacuna: string
  fecha: string
  intentos: number
  clientes: { nombre: string | null; telefono: string | null } | null
}

function componentesVacuna(r: FilaRecordatorio, veterinaria: string, slug: string, v2: boolean): unknown[] {
  if (!v2) {
    return [{
      type: "body",
      parameters: [
        { type: "text", text: r.mascota_nombre || "tu mascota" },
        { type: "text", text: r.vacuna },
      ],
    }]
  }
  const nombre = (r.clientes?.nombre ?? "").trim().split(/\s+/)[0] || "¡hola"
  return [
    {
      type: "body",
      parameters: [
        { type: "text", text: nombre },
        { type: "text", text: r.mascota_nombre || "tu mascota" },
        { type: "text", text: r.vacuna },
        { type: "text", text: fechaCorta(r.fecha) },
        { type: "text", text: veterinaria },
      ],
    },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: `${slug}/turno` }] },
  ]
}

export async function GET(request: Request) {
  await cargarPlanesServidor({ fresco: true })
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 })
  }

  const admin = getAdminDb()
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Supabase Admin no configurado" }, { status: 503 })
  }

  const ahora = new Date()
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "es_AR"
  const turnoTemplate = process.env.WHATSAPP_REMINDER_TEMPLATE || "recordatorio_turno"
  const vacunaTemplateV2 = process.env.WHATSAPP_VACUNA_TEMPLATE_V2
  const vacunaTemplate = vacunaTemplateV2 || process.env.WHATSAPP_VACUNA_TEMPLATE || "recordatorio_vacuna"
  const fechaTurnos = sumarDias(fechaArgentina(ahora), 1)
  const diasVacuna = Number(process.env.RECORDATORIO_VACUNA_DIAS ?? DIAS_AVISO_DEFAULT)
  const rango = rangoCron(ahora, diasVacuna)

  let turnosEnviados = 0
  let vacunasEnviadas = 0
  let vacunasFallidas = 0

  try {
    const { data: tenants, error: errTenants } = await admin
      .from("tenants")
      .select("slug, plan, nombre")
    if (errTenants) throw errTenants

    const conWhatsapp = (tenants ?? []).filter((t) => planAllows(t.plan, "whatsapp"))
    const conVacunas = conWhatsapp.filter((t) => planAllows(t.plan, "recordatoriosVacunas"))

    if (conWhatsapp.length === 0) {
      return NextResponse.json({
        ok: true, tenantsProcesados: 0, turnosEnviados: 0, vacunasEnviadas: 0,
        fechaTurnos, rangoVacunas: rango,
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

    // 2. Vacunas por vencer (y vencidas hace pocos días) de los tenants con ese feature
    if (conVacunas.length > 0) {
      const nombres = new Map(conVacunas.map((t) => [t.slug as string, (t.nombre as string) || (t.slug as string)]))

      const { data: vacunas, error: errVacunas } = await admin
        .from("recordatorios_vacunas")
        .select("id, tenant_id, telefono, mascota_nombre, vacuna, fecha, intentos, clientes(nombre, telefono)")
        .in("tenant_id", conVacunas.map((t) => t.slug))
        .in("estado", ["pendiente", "fallido"])
        .lt("intentos", MAX_INTENTOS)
        .gte("fecha", rango.desde)
        .lte("fecha", rango.hasta)
        .returns<FilaRecordatorio[]>()
      if (errVacunas) throw errVacunas

      for (const v of vacunas ?? []) {
        // El teléfono actual del cliente; la copia del recordatorio solo de respaldo.
        const telefono = v.clientes?.telefono || v.telefono
        const r = telefono
          ? await sendWhatsAppTemplate(
              telefono, vacunaTemplate, lang,
              componentesVacuna(v, nombres.get(v.tenant_id) ?? v.tenant_id, v.tenant_id, Boolean(vacunaTemplateV2)),
            )
          : { ok: false, error: "Sin teléfono" }

        if (r.ok) vacunasEnviadas++
        else vacunasFallidas++

        // Sin configuración de WhatsApp (`skipped`) no se gasta un intento.
        if (!r.ok && "skipped" in r && r.skipped) continue

        const { error: errUpdate } = await admin
          .from("recordatorios_vacunas")
          .update(r.ok
            ? { estado: "enviado", canal: "whatsapp", enviado_at: new Date().toISOString(), intentos: v.intentos + 1, ultimo_error: null }
            : {
                estado: "fallido",
                // Sin teléfono no tiene sentido reintentar: queda en el panel para avisar a mano.
                intentos: telefono ? v.intentos + 1 : MAX_INTENTOS,
                ultimo_error: r.error ?? "Error desconocido",
              })
          .eq("id", v.id)
        if (errUpdate) console.error("[cron/recordatorios] No se pudo actualizar el recordatorio", v.id, errUpdate.message)
      }
    }

    return NextResponse.json({
      ok: true,
      tenantsProcesados: conWhatsapp.length,
      turnosEnviados,
      vacunasEnviadas,
      vacunasFallidas,
      fechaTurnos,
      rangoVacunas: rango,
    })
  } catch (error) {
    console.error("[cron/recordatorios] Error:", error)
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 })
  }
}
