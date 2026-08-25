import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getTenantConfig } from "@/lib/supabase/queries";
import { getGmailCredentials } from "@/lib/supabase/email-credentials";
import { crearEventoCalendar } from "@/lib/google/calendar";

/**
 * Crea un evento en Google Calendar al confirmar un turno.
 * Summary: "[TURNO] Mascota - Dueño"
 * Recordatorio: 14 horas antes (popup + email).
 *
 * Dos caminos posibles, según cómo esté conectado el tenant:
 *  - OAuth propio (tenant_email_credentials, misma conexión que Gmail): usa
 *    el calendario de esa cuenta directamente. `calendarId` del tenant, o
 *    "primary" si no especificó uno. Si viene `duenoEmail`, se lo invita al
 *    evento (Google le manda el mail de invitación con opción de agregarlo
 *    a SU calendario).
 *  - Service account global (env vars): requiere que el dueño comparta SU
 *    calendario con el email de la service account. Queda como fallback para
 *    tenants que no conectaron su cuenta de Google. Sin invitado: una
 *    service account sin domain-wide delegation no puede invitar attendees.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, mascotaNombre, duenoNombre, motivo, fecha, hora, servicio, duenoEmail } = body as {
      tenantId?: string;
      mascotaNombre?: string;
      duenoNombre?: string;
      motivo?: string;
      fecha?: string;
      hora?: string;
      servicio?: string;
      duenoEmail?: string;
    };

    if (!fecha || !hora) {
      return NextResponse.json(
        { error: "Falta fecha u hora" },
        { status: 400 }
      );
    }

    const [y, m, d] = fecha.split("-").map(Number);
    const [hh, mm] = hora.split(":").map(Number);
    const startDate = new Date(y, m - 1, d, hh, mm, 0);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

    const summary = `[TURNO] ${mascotaNombre ?? "Mascota"} - ${duenoNombre ?? "Dueño"}`;
    const description = [motivo, servicio].filter(Boolean).join(" · ") || "Turno veterinaria";
    const timeZone = "America/Argentina/Buenos_Aires";

    const tenantConfig = tenantId ? await getTenantConfig(tenantId) : null;
    const oauthCredenciales = tenantId ? await getGmailCredentials(tenantId) : null;

    // Camino 1: el tenant conectó su propia cuenta de Google (Gmail + Calendar).
    if (oauthCredenciales?.refreshToken) {
      try {
        const evento = await crearEventoCalendar(
          {
            clientId: oauthCredenciales.clientId,
            clientSecret: oauthCredenciales.clientSecret,
            refreshToken: oauthCredenciales.refreshToken,
          },
          {
            calendarId: tenantConfig?.calendarId || "primary",
            summary,
            description,
            startDateTime: startDate.toISOString(),
            endDateTime: endDate.toISOString(),
            timeZone,
            attendeeEmail: duenoEmail,
            attendeeName: duenoNombre,
          },
        );
        return NextResponse.json(evento);
      } catch (err) {
        console.error("Error creando evento vía OAuth del tenant:", err);
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Error al crear evento" },
          { status: 500 }
        );
      }
    }

    // Camino 2 (fallback): service account global + calendario compartido.
    const clientEmail = process.env.GOOGLE_CALENDAR_CLIENT_EMAIL ?? process.env.CLIENT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_CALENDAR_PRIVATE_KEY ?? process.env.PRIVATE_KEY;
    const calendarId = tenantConfig?.calendarId
      ?? process.env.GOOGLE_CALENDAR_CALENDAR_ID
      ?? process.env.CALENDAR_ID;

    if (!clientEmail || !privateKeyRaw || !calendarId) {
      console.error("Faltan variables de Google Calendar:", { clientEmail: !!clientEmail, privateKey: !!privateKeyRaw, calendarId: !!calendarId });
      return NextResponse.json(
        { error: "Configuración de calendario incompleta. Conectá tu cuenta de Google en Configuración, o configurá el Calendar ID." },
        { status: 503 }
      );
    }

    const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });

    const calendar = google.calendar({ version: "v3", auth });

    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary,
        description,
        start: { dateTime: startDate.toISOString(), timeZone },
        end: { dateTime: endDate.toISOString(), timeZone },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 1560 },
            { method: "email", minutes: 1560 },
          ],
        },
      },
    });

    return NextResponse.json({ id: res.data.id, htmlLink: res.data.htmlLink });
  } catch (err) {
    console.error("Error creando evento en Google Calendar:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al crear evento" },
      { status: 500 }
    );
  }
}
