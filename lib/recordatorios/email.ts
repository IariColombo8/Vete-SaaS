import { diasHasta, type DatosMensajeRecordatorio } from "./vacunas"

/**
 * Email del recordatorio de vacuna al dueño de la mascota. Puro (sin
 * dependencias de servidor) para poder testearlo; lo envía el cron por
 * `lib/email/enviar-cliente.ts`.
 */

export interface DatosEmailRecordatorio extends DatosMensajeRecordatorio {
  /** Logo de la veterinaria (URL absoluta), ya escalado. */
  logoUrl?: string
  telefonoVeterinaria?: string
  direccionVeterinaria?: string
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

/** "23 de diciembre" a partir de "2026-12-23". */
export function fechaLarga(fecha: string): string {
  const [, mes, dia] = fecha.split("-").map(Number)
  return `${dia} de ${MESES[mes - 1]}`
}

export function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function asuntoRecordatorio(d: DatosEmailRecordatorio, hoy: string): string {
  const que = d.tipo === "desparasitacion" ? "desparasitación" : "vacuna"
  return diasHasta(d.fecha, hoy) < 0
    ? `${d.mascotaNombre}: quedó pendiente la ${que} ${d.vacuna} — ${d.veterinaria}`
    : `Recordatorio: ${que} ${d.vacuna} de ${d.mascotaNombre} — ${d.veterinaria}`
}

export function htmlRecordatorio(d: DatosEmailRecordatorio, hoy: string): string {
  const e = escapeHtml
  const nombre = d.clienteNombre?.trim().split(/\s+/)[0]
  const saludo = nombre ? `Hola <strong>${e(nombre)}</strong>,` : "Hola,"
  const que = d.tipo === "desparasitacion"
    ? `la desparasitación <strong>${e(d.vacuna)}</strong>`
    : `la vacuna <strong>${e(d.vacuna)}</strong>`
  const vencida = diasHasta(d.fecha, hoy) < 0
  const cuerpo = vencida
    ? `a <strong>${e(d.mascotaNombre)}</strong> le tocaba ${que} el <strong>${fechaLarga(d.fecha)}</strong>. Si todavía no la aplicó, te esperamos para ponerla al día.`
    : `te recordamos que a <strong>${e(d.mascotaNombre)}</strong> le toca ${que} el <strong>${fechaLarga(d.fecha)}</strong>.`

  const contacto = [d.telefonoVeterinaria, d.direccionVeterinaria].filter(Boolean).map((x) => e(x as string)).join(" · ")
  const logo = d.logoUrl
    ? `<img src="${e(d.logoUrl)}" alt="${e(d.veterinaria)}" width="56" height="56" style="width:56px;height:56px;object-fit:contain;display:block;border-radius:12px;background:#fff;" />`
    : ""
  const boton = d.urlTurno
    ? `<div style="text-align:center;margin-top:28px;">
            <a href="${e(d.urlTurno)}" target="_blank" rel="noopener"
               style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:10px;">
              Sacar turno
            </a>
          </div>`
    : ""

  return `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;background:#f4f6f8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
    <div style="max-width:540px;margin:0 auto;padding:40px 16px;">
      <div style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,0.08);">
        <div style="background:linear-gradient(135deg,#0d9488 0%,#0891b2 55%,#0e7490 100%);padding:28px 32px;">
          <table width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="vertical-align:middle;">
                <p style="margin:0 0 6px;color:rgba(255,255,255,0.8);font-size:12px;letter-spacing:.06em;text-transform:uppercase;">Recordatorio</p>
                <h1 style="margin:0;color:#fff;font-size:21px;line-height:1.3;">${e(d.veterinaria)}</h1>
              </td>
              <td align="right" style="vertical-align:middle;" width="64">${logo}</td>
            </tr>
          </table>
        </div>
        <div style="padding:32px;">
          <p style="margin:0;color:#334155;font-size:15px;line-height:1.7;">${saludo} ${cuerpo}</p>
          ${boton}
          <p style="margin:28px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">
            Si ya la aplicaste, ignorá este mensaje. Por cualquier consulta, respondé este email${contacto ? ` o contactanos: ${contacto}` : ""}.
          </p>
        </div>
      </div>
      <p style="text-align:center;color:#94a3b8;font-size:12px;margin:24px 0 0;">
        🐾 Enviado por <a href="https://vetpanel.com.ar" target="_blank" rel="noopener" style="color:#0f766e;font-weight:600;text-decoration:none;">VetPanel</a> en nombre de ${e(d.veterinaria)}
      </p>
    </div>
  </body>
</html>`
}
