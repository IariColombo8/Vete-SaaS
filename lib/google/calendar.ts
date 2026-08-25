import "server-only"
import { google } from "googleapis"

/**
 * Crear eventos en Google Calendar usando el OAuth del propio tenant (misma
 * conexión que Gmail, ver lib/google/gmail.ts). Reemplaza, para tenants
 * conectados, al enfoque anterior de service account + calendario compartido.
 */

export interface CalendarCredentials {
  clientId: string
  clientSecret: string
  refreshToken: string
}

interface CrearEventoInput {
  calendarId: string
  summary: string
  description: string
  startDateTime: string
  endDateTime: string
  timeZone: string
  /** Email del dueño de la mascota: se lo invita al evento y Google le manda la invitación. */
  attendeeEmail?: string
  attendeeName?: string
}

export async function crearEventoCalendar(
  credenciales: CalendarCredentials,
  evento: CrearEventoInput,
): Promise<{ id?: string | null; htmlLink?: string | null }> {
  const oauth2Client = new google.auth.OAuth2(credenciales.clientId, credenciales.clientSecret)
  oauth2Client.setCredentials({ refresh_token: credenciales.refreshToken })

  const calendar = google.calendar({ version: "v3", auth: oauth2Client })

  const res = await calendar.events.insert({
    calendarId: evento.calendarId,
    // Sin esto, Google guarda la invitación pero no le manda el email al invitado.
    sendUpdates: evento.attendeeEmail ? "all" : "none",
    requestBody: {
      summary: evento.summary,
      description: evento.description,
      start: { dateTime: evento.startDateTime, timeZone: evento.timeZone },
      end: { dateTime: evento.endDateTime, timeZone: evento.timeZone },
      attendees: evento.attendeeEmail
        ? [{ email: evento.attendeeEmail, displayName: evento.attendeeName }]
        : undefined,
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 1560 },
          { method: "email", minutes: 1560 },
        ],
      },
    },
  })

  return { id: res.data.id, htmlLink: res.data.htmlLink }
}
