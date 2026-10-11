import "server-only"
import { SERVITEC } from "@/lib/marca"
import { formatPrecioPlan } from "@/lib/plans"

/**
 * Emails transaccionales del ciclo de vida del plan, enviados por el cron de
 * billing con la cuenta de Resend de VetPanel (`RESEND_API_KEY` / `EMAIL_FROM`).
 *
 * Van al dueño de la veterinaria, no a sus clientes: por eso no pasan por el
 * proveedor de email que cada tenant configuró para sus turnos.
 *
 * Si Resend no está configurado, `enviarEmailBilling` devuelve false y el cron
 * sigue: un aviso que no sale no puede frenar la conciliación de pagos.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails"

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

export async function enviarEmailBilling(params: {
  to: string
  subject: string
  html: string
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) return false

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [params.to], subject: params.subject, html: params.html }),
  })
  if (!res.ok) {
    console.error("[billing/email] Resend", res.status, await res.text())
    return false
  }
  return true
}

function layout(titulo: string, cuerpo: string, cta: { href: string; texto: string }): string {
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0f172a">
    <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#059669;margin:0 0 12px">VetPanel</p>
    <h1 style="font-size:22px;margin:0 0 16px">${titulo}</h1>
    <div style="font-size:15px;line-height:1.6;color:#334155">${cuerpo}</div>
    <p style="margin:28px 0">
      <a href="${cta.href}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">${cta.texto}</a>
    </p>
    <p style="font-size:12px;color:#64748b;margin-top:32px">
      VetPanel es un producto de ${SERVITEC.nombre} · <a href="${SERVITEC.url}" style="color:#64748b">${SERVITEC.dominio}</a>
    </p>
  </div>`
}

const planes = () =>
  `<p>Tenés dos planes para seguir, los dos se pagan con Mercado Pago y se cancelan cuando quieras:</p>
   <ul>
     <li><strong>Pro</strong> — ${formatPrecioPlan("pro")}/mes: todo lo que estuviste usando (turnos ilimitados, mostrador, caja, WhatsApp, factura electrónica, Point).</li>
     <li><strong>Básico</strong> — ${formatPrecioPlan("basico")}/mes: página pública, turnos (hasta 10 por mes), clientes, libreta e historia clínica.</li>
   </ul>`

export function emailTrialPorVencer(params: {
  nombreVeterinaria: string
  diasRestantes: number
  urlPlan: string
}): { subject: string; html: string } {
  const dias = params.diasRestantes === 1 ? "mañana" : `en ${params.diasRestantes} días`
  return {
    subject: `Tu prueba gratis de VetPanel Pro termina ${dias}`,
    html: layout(
      `Tu prueba de Pro termina ${dias}`,
      `<p>Hola, equipo de <strong>${params.nombreVeterinaria}</strong>.</p>
       <p>Estuviste probando el plan Pro completo. Cuando termine la prueba, el panel queda en solo lectura
       (nada se borra) hasta que elijas cómo seguir.</p>
       ${planes()}
       <p>Lo elegís vos, desde tu panel. No se cobra nada sin tu confirmación.</p>`,
      { href: params.urlPlan, texto: "Elegir mi plan" },
    ),
  }
}

export function emailTrialVencido(params: {
  nombreVeterinaria: string
  urlPlan: string
}): { subject: string; html: string } {
  return {
    subject: "Tu prueba de VetPanel Pro terminó: elegí tu plan",
    html: layout(
      "Tu prueba de Pro terminó",
      `<p>Hola, equipo de <strong>${params.nombreVeterinaria}</strong>.</p>
       <p>Tu panel quedó en modo solo lectura: tus turnos, clientes e historias clínicas están guardados y los
       vas a seguir viendo.</p>
       ${planes()}
       <p>Son dos clics desde tu panel.</p>`,
      { href: params.urlPlan, texto: "Reactivar mi panel" },
    ),
  }
}
