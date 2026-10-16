import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/supabase/admin"
import { planAllows } from "@/lib/plans"
import { cargarPlanesServidor } from "@/lib/planes-servidor"
import { sendWhatsAppTemplate } from "@/lib/notifications/whatsapp"
import { enviarEmailCliente } from "@/lib/email/enviar-cliente"
import { asuntoRecordatorio, htmlRecordatorio } from "@/lib/recordatorios/email"
import {
  DIAS_AVISO_DEFAULT,
  MAX_INTENTOS,
  fechaArgentina,
  rangoCron,
  sumarDias,
} from "@/lib/recordatorios/vacunas"
import { imagenSupabase } from "@/lib/imagenes"
import { APP_URL } from "@/lib/seo/sitio"

/**
 * Cron diario de recordatorios (service_role, bypassa RLS).
 *
 *  1. Turnos de mañana → WhatsApp (plantilla de Meta). Solo si hay
 *     WHATSAPP_TOKEN/PHONE_NUMBER_ID; sin eso es un no-op. La API de Meta se
 *     descartó por costo (cobra por mensaje): queda por si se retoma.
 *  2. Vacunas/desparasitaciones con próxima dosis dentro de
 *     `RECORDATORIO_VACUNA_DIAS` días (default 7) → **email** al dueño. Toma
 *     un RANGO (desde hace 3 días hasta dentro de N), no una fecha exacta: si
 *     el cron no corrió algún día, lo que quedó atrás sale igual. Los
 *     recordatorios los crea un trigger desde la historia (060/062).
 *
 * El punto 2 es para tenants con el feature `recordatoriosVacunas` (Pro). Los
 * demás, y los clientes sin email, avisan a mano desde el Dashboard (wa.me).
 * El email sale por el Gmail de la veterinaria si lo conectó, si no por
 * Resend con reply_to a su email (ver lib/email/enviar-cliente.ts).
 *
 * Seguridad: header `Authorization: Bearer <CRON_SECRET>` (lo envía Vercel Cron).
 */

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get("authorization") === `Bearer ${secret}`
}

interface FilaRecordatorio {
  id: string
  tenant_id: string
  mascota_nombre: string | null
  vacuna: string
  tipo: "vacuna" | "desparasitacion" | null
  fecha: string
  intentos: number
  clientes: { nombre: string | null; email: string | null } | null
}

interface DatosVeterinaria {
  nombre: string
  email?: string
  telefono?: string
  direccion?: string
  logo?: string
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
  const hoy = fechaArgentina(ahora)
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "es_AR"
  const turnoTemplate = process.env.WHATSAPP_REMINDER_TEMPLATE || "recordatorio_turno"
  const fechaTurnos = sumarDias(hoy, 1)
  const diasVacuna = Number(process.env.RECORDATORIO_VACUNA_DIAS ?? DIAS_AVISO_DEFAULT)
  const rango = rangoCron(ahora, diasVacuna)

  let turnosEnviados = 0
  let vacunasEnviadas = 0
  let vacunasFallidas = 0

  try {
    const { data: tenants, error: errTenants } = await admin
      .from("tenants")
      .select("slug, plan, nombre, email, telefono, direccion, logo")
    if (errTenants) throw errTenants

    const conWhatsapp = (tenants ?? []).filter((t) => planAllows(t.plan, "whatsapp"))
    const conVacunas = (tenants ?? []).filter((t) => planAllows(t.plan, "recordatoriosVacunas"))

    // 1. Turnos de mañana por WhatsApp (no-op sin configuración de Meta)
    if (conWhatsapp.length > 0) {
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
    }

    // 2. Vacunas por vencer (y vencidas hace pocos días) → email
    if (conVacunas.length > 0) {
      const veterinarias = new Map<string, DatosVeterinaria>(
        conVacunas.map((t) => [
          t.slug as string,
          {
            nombre: (t.nombre as string) || (t.slug as string),
            email: (t.email as string) || undefined,
            telefono: (t.telefono as string) || undefined,
            direccion: (t.direccion as string) || undefined,
            logo: (t.logo as string) || undefined,
          },
        ]),
      )

      const { data: vacunas, error: errVacunas } = await admin
        .from("recordatorios_vacunas")
        .select("id, tenant_id, mascota_nombre, vacuna, tipo, fecha, intentos, clientes(nombre, email)")
        .in("tenant_id", conVacunas.map((t) => t.slug))
        .in("estado", ["pendiente", "fallido"])
        .lt("intentos", MAX_INTENTOS)
        .gte("fecha", rango.desde)
        .lte("fecha", rango.hasta)
        .returns<FilaRecordatorio[]>()
      if (errVacunas) throw errVacunas

      for (const v of vacunas ?? []) {
        const vet = veterinarias.get(v.tenant_id) ?? { nombre: v.tenant_id }
        const destino = v.clientes?.email?.trim()

        if (!destino) {
          // Sin email no tiene sentido reintentar: queda en el Dashboard para avisar por wa.me.
          vacunasFallidas++
          await actualizar(admin, v.id, { estado: "fallido", intentos: MAX_INTENTOS, ultimo_error: "Sin email" })
          continue
        }

        const datos = {
          clienteNombre: v.clientes?.nombre ?? undefined,
          mascotaNombre: v.mascota_nombre || "tu mascota",
          vacuna: v.vacuna,
          tipo: v.tipo ?? "vacuna",
          fecha: v.fecha,
          veterinaria: vet.nombre,
          urlTurno: `${APP_URL}/${v.tenant_id}/turno`,
          logoUrl: vet.logo ? imagenSupabase(vet.logo, 144) : undefined,
          telefonoVeterinaria: vet.telefono,
          direccionVeterinaria: vet.direccion,
        }
        const r = await enviarEmailCliente(v.tenant_id, {
          to: destino,
          subject: asuntoRecordatorio(datos, hoy),
          html: htmlRecordatorio(datos, hoy),
          remitente: vet.nombre,
          replyTo: vet.email,
        })

        // Sin ningún proveedor de email configurado no se gasta un intento.
        if (r.skipped) continue

        if (r.ok) {
          vacunasEnviadas++
          await actualizar(admin, v.id, {
            estado: "enviado", canal: "email", enviado_at: new Date().toISOString(),
            intentos: v.intentos + 1, ultimo_error: null,
          })
        } else {
          vacunasFallidas++
          await actualizar(admin, v.id, {
            estado: "fallido", intentos: v.intentos + 1, ultimo_error: r.error ?? "Error desconocido",
          })
        }
      }
    }

    return NextResponse.json({
      ok: true,
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

async function actualizar(
  admin: NonNullable<ReturnType<typeof getAdminDb>>,
  id: string,
  cambios: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from("recordatorios_vacunas").update(cambios).eq("id", id)
  if (error) console.error("[cron/recordatorios] No se pudo actualizar el recordatorio", id, error.message)
}
