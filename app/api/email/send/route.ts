import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/supabase/admin"
import { getGmailCredentialsConFallback, getEmailJsCredentials } from "@/lib/supabase/email-credentials"
import { enviarEmailGmail } from "@/lib/google/gmail"
import { enviarEmailJs } from "@/lib/email/emailjs"
import { generarLinkGoogleCalendar } from "@/lib/email/google-calendar-link"

/**
 * Envío de emails server-side. Dos proveedores posibles, elegidos por tenant:
 *
 *  - Resend (default): API key global del proyecto (`RESEND_API_KEY` / `EMAIL_FROM`).
 *  - Gmail API: el tenant conectó su propia cuenta de Gmail (OAuth, ver
 *    app/api/gmail/auth y app/api/gmail/callback). Credenciales en
 *    `tenant_email_credentials`, nunca en el bundle del cliente.
 *  - EmailJS: el tenant tiene su propia cuenta de EmailJS (Service ID,
 *    Template ID, Public/Private Key). Mismo lugar de credenciales.
 *
 * `tenants.email_provider` decide cuál. Si el tenant no eligió explícitamente
 * "emailjs" (ni tiene su propio "gmail" ya conectado), se usa Gmail con la
 * cuenta compartida de VetPanel como fallback (`getGmailCredentialsConFallback`).
 * Solo cae a Resend si falta `tenantId` o el tenant no existe.
 *
 * Si falta la config del proveedor elegido, responde 200 con
 * `{ ok: false, skipped: true }` para no romper el flujo de reserva (el email
 * es best-effort).
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails"

interface TurnoEmailData {
  nombre_y_apellido: string
  fecha: string
  hora: string
  direccion: string
  nombre_mascota: string
  tipo_mascota: string
  servicio_requerido: string
  email: string
  /** Nombre de la veterinaria, para personalizar el asunto/cuerpo. */
  veterinaria?: string
  /** Logo de la veterinaria, para el header del email. */
  logoUrl?: string
  /** Duración del servicio en minutos, para el link de "Agregar a Google Calendar". Default 60. */
  duracionMin?: number
  /** Slug del tenant, para resolver el proveedor de email configurado. */
  tenantId?: string
  /** true: este email es la notificación al veterinario de un turno nuevo, no la confirmación al cliente. */
  paraVeterinario?: boolean
}

/** Logo genérico de VetPanel, para cuando el tenant no cargó el suyo propio. */
const DEFAULT_LOGO_URL = "https://vetpanel.com.ar/logo.png"

async function resolverProveedor(tenantId?: string): Promise<"resend" | "gmail" | "emailjs"> {
  if (!tenantId) return "resend"
  const admin = getAdminDb()
  if (!admin) return "resend"

  const { data } = await admin
    .from("tenants")
    .select("email_provider")
    .eq("slug", tenantId)
    .maybeSingle()

  if (!data) return "resend"
  if (data.email_provider === "emailjs") return "emailjs"
  // "gmail" propio o "resend" (default de la columna): en ambos casos se
  // resuelve por Gmail, con fallback a la cuenta compartida si el tenant no
  // conectó la suya.
  return "gmail"
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function buildConfirmacionHtml(data: TurnoEmailData, calendarLink: string): string {
  const vet = data.veterinaria ? escapeHtml(data.veterinaria) : "tu veterinaria"
  const item = (icon: string, label: string, value: string) =>
    value
      ? `<tr>
          <td style="padding:10px 0;border-bottom:1px solid #eef2f6;" width="36">
            <div style="width:28px;height:28px;border-radius:8px;background:#ecfdf5;text-align:center;line-height:28px;font-size:14px;">${icon}</div>
          </td>
          <td style="padding:10px 0 10px 10px;border-bottom:1px solid #eef2f6;">
            <div style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(label)}</div>
            <div style="color:#0f172a;font-size:15px;font-weight:600;">${escapeHtml(value)}</div>
          </td>
        </tr>`
      : ""

  const logoSrc = data.logoUrl || DEFAULT_LOGO_URL
  const logo = `<img src="${escapeHtml(logoSrc)}" alt="${vet}" width="72" height="72" style="width:72px;height:72px;object-fit:contain;display:block;" />`

  const esVeterinario = Boolean(data.paraVeterinario)
  const titulo = esVeterinario ? "Nuevo turno reservado" : "Turno confirmado"
  const encabezado = esVeterinario ? "Nuevo turno 🐾" : "¡Nos vemos pronto! 🐶🐱"
  const saludo = esVeterinario
    ? `<strong>${escapeHtml(data.nombre_y_apellido)}</strong> reservó un turno. Te dejamos el resumen abajo. 📅`
    : `Hola <strong>${escapeHtml(data.nombre_y_apellido)}</strong>, tu turno quedó reservado. Te dejamos el resumen abajo. 📅`

  return `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;background:#f4f6f8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
    <div style="max-width:540px;margin:0 auto;padding:40px 16px;">
      <div style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,0.08);">
        <div style="background:linear-gradient(135deg,#0d9488 0%,#0891b2 55%,#0e7490 100%);padding:32px;">
          <table width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="vertical-align:middle;">
                <p style="margin:0 0 6px;color:rgba(255,255,255,0.8);font-size:12px;letter-spacing:.06em;text-transform:uppercase;">${titulo}</p>
                <h1 style="margin:0;color:#fff;font-size:22px;line-height:1.3;">${encabezado}</h1>
              </td>
              <td align="right" style="vertical-align:middle;" width="80">${logo}</td>
            </tr>
          </table>
          <p style="margin:16px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">${vet}</p>
        </div>

        <div style="padding:32px;">
          <p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.6;">
            ${saludo}
          </p>

          <table style="width:100%;border-collapse:collapse;">
            ${item("📆", "Fecha", data.fecha)}
            ${item("🕐", "Hora", data.hora)}
            ${item("🐾", "Mascota", `${data.nombre_mascota}${data.tipo_mascota ? ` · ${data.tipo_mascota}` : ""}`)}
            ${item("🩺", "Servicio", data.servicio_requerido)}
            ${item("📍", "Dirección", data.direccion)}
          </table>

          <div style="text-align:center;margin-top:28px;">
            <a href="${calendarLink}" target="_blank" rel="noopener"
               style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;
                      font-size:14px;font-weight:600;padding:12px 24px;border-radius:10px;">
              📅 Agregar a Google Calendar
            </a>
          </div>

          <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">
            ${esVeterinario
              ? "Este turno ya quedó agendado en tu panel de VetPanel."
              : "¿Necesitás reprogramar o cancelar? Respondé este email o contactá directamente a la veterinaria."}
          </p>
        </div>
      </div>

      <div style="text-align:center;margin-top:24px;">
        <p style="color:#94a3b8;font-size:12px;margin:0;">
          🐾 Hecho desde <a href="https://vetpanel.com.ar" target="_blank" rel="noopener" style="color:#0f766e;font-weight:600;text-decoration:none;">VetPanel</a>
        </p>
      </div>
    </div>
  </body>
</html>`
}

export async function POST(request: Request) {
  let data: TurnoEmailData
  try {
    data = (await request.json()) as TurnoEmailData
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  if (!data?.email) {
    return NextResponse.json({ ok: false, error: "Falta el email del destinatario" }, { status: 400 })
  }

  const subject = data.paraVeterinario
    ? `Nuevo turno: ${data.nombre_y_apellido} — ${data.fecha} ${data.hora}`
    : data.veterinaria
      ? `Turno confirmado en ${data.veterinaria} — ${data.fecha} ${data.hora}`
      : `Turno confirmado — ${data.fecha} ${data.hora}`

  const calendarLink = generarLinkGoogleCalendar({
    fecha: data.fecha,
    hora: data.hora,
    duracionMin: data.duracionMin,
    titulo: `Turno · ${data.nombre_mascota || "mascota"} (${data.servicio_requerido || "consulta"})`,
    descripcion: `Turno en ${data.veterinaria || "la veterinaria"} para ${data.nombre_mascota || "tu mascota"}.`,
    direccion: data.direccion,
  })

  const proveedor = await resolverProveedor(data.tenantId)

  if (proveedor === "emailjs") {
    const credenciales = await getEmailJsCredentials(data.tenantId!)
    if (!credenciales) {
      console.warn(`[email] Tenant ${data.tenantId} tiene proveedor "emailjs" pero no configuró sus credenciales — email omitido`)
      return NextResponse.json({ ok: false, skipped: true })
    }

    try {
      await enviarEmailJs(credenciales, {
        nombre_y_apellido: data.nombre_y_apellido,
        fecha: data.fecha,
        hora: data.hora,
        direccion: data.direccion ?? "",
        nombre_mascota: data.nombre_mascota,
        tipo_mascota: data.tipo_mascota,
        servicio_requerido: data.servicio_requerido,
        email: data.email,
      })
      return NextResponse.json({ ok: true })
    } catch (error) {
      console.error("[email] Error enviando vía EmailJS:", error)
      return NextResponse.json({ ok: false, error: "No se pudo enviar el email" }, { status: 502 })
    }
  }

  if (proveedor === "gmail") {
    const credenciales = await getGmailCredentialsConFallback(data.tenantId!)
    if (!credenciales?.refreshToken || !credenciales.senderEmail) {
      console.warn(`[email] Tenant ${data.tenantId}: ni cuenta propia ni cuenta compartida disponibles — email omitido`)
      return NextResponse.json({ ok: false, skipped: true })
    }

    try {
      await enviarEmailGmail(
        {
          clientId: credenciales.clientId,
          clientSecret: credenciales.clientSecret,
          refreshToken: credenciales.refreshToken,
          senderEmail: credenciales.senderEmail,
        },
        { to: data.email, subject, html: buildConfirmacionHtml(data, calendarLink) },
      )
      return NextResponse.json({ ok: true })
    } catch (error) {
      console.error("[email] Error enviando vía Gmail API:", error)
      return NextResponse.json({ ok: false, error: "No se pudo enviar el email" }, { status: 502 })
    }
  }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM

  // No configurado → no-op para no bloquear la reserva.
  if (!apiKey || !from) {
    console.warn("[email] RESEND_API_KEY o EMAIL_FROM no configurados — email omitido")
    return NextResponse.json({ ok: false, skipped: true })
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [data.email],
        subject,
        html: buildConfirmacionHtml(data, calendarLink),
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      console.error("[email] Resend respondió con error:", res.status, detail)
      return NextResponse.json({ ok: false, error: "No se pudo enviar el email" }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[email] Error enviando email:", error)
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 })
  }
}
