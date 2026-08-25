import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/supabase/admin"
import { getGmailCredentials, getEmailJsCredentials } from "@/lib/supabase/email-credentials"
import { enviarEmailGmail } from "@/lib/google/gmail"
import { enviarEmailJs } from "@/lib/email/emailjs"

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
 * `tenants.email_provider` decide cuál. Si falta `tenantId` en el body, o el
 * tenant no existe, se asume Resend (compatibilidad con el flujo anterior).
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
  /** Slug del tenant, para resolver el proveedor de email configurado. */
  tenantId?: string
}

async function resolverProveedor(tenantId?: string): Promise<"resend" | "gmail" | "emailjs"> {
  if (!tenantId) return "resend"
  const admin = getAdminDb()
  if (!admin) return "resend"

  const { data } = await admin
    .from("tenants")
    .select("email_provider")
    .eq("slug", tenantId)
    .maybeSingle()

  if (data?.email_provider === "gmail" || data?.email_provider === "emailjs") return data.email_provider
  return "resend"
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function buildConfirmacionHtml(data: TurnoEmailData): string {
  const vet = data.veterinaria ? escapeHtml(data.veterinaria) : "tu veterinaria"
  const row = (label: string, value: string) =>
    value
      ? `<tr>
          <td style="padding:8px 0;color:#64748b;font-size:14px;">${escapeHtml(label)}</td>
          <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:600;text-align:right;">${escapeHtml(value)}</td>
        </tr>`
      : ""

  return `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;background:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:32px 16px;">
      <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <div style="background:linear-gradient(135deg,#10b981,#0d9488);padding:28px 32px;">
          <h1 style="margin:0;color:#fff;font-size:20px;">Turno confirmado ✓</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${vet}</p>
        </div>
        <div style="padding:28px 32px;">
          <p style="margin:0 0 20px;color:#334155;font-size:15px;">
            Hola <strong>${escapeHtml(data.nombre_y_apellido)}</strong>, registramos tu turno con éxito.
          </p>
          <table style="width:100%;border-collapse:collapse;">
            ${row("Fecha", data.fecha)}
            ${row("Hora", data.hora)}
            ${row("Mascota", data.nombre_mascota)}
            ${row("Tipo", data.tipo_mascota)}
            ${row("Servicio", data.servicio_requerido)}
            ${row("Dirección", data.direccion)}
          </table>
          <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.5;">
            Si necesitás reprogramar o cancelar, respondé este email o contactá a la veterinaria.
          </p>
        </div>
      </div>
      <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:16px;">
        Enviado por VetPanel
      </p>
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

  const subject = data.veterinaria
    ? `Turno confirmado en ${data.veterinaria} — ${data.fecha} ${data.hora}`
    : `Turno confirmado — ${data.fecha} ${data.hora}`

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
    const credenciales = await getGmailCredentials(data.tenantId!)
    if (!credenciales?.refreshToken || !credenciales.senderEmail) {
      console.warn(`[email] Tenant ${data.tenantId} tiene proveedor "gmail" pero no conectó su cuenta — email omitido`)
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
        { to: data.email, subject, html: buildConfirmacionHtml(data) },
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
        html: buildConfirmacionHtml(data),
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
