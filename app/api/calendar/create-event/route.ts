import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

/**
 * Crea un evento en Google Calendar al confirmar un turno.
 * Summary: "[TURNO] Mascota - Dueño"
 * Recordatorio: 14 horas antes (popup + email).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mascotaNombre, duenoNombre, motivo, fecha, hora, servicio } = body as {
      mascotaNombre?: string;
      duenoNombre?: string;
      motivo?: string;
      fecha?: string;
      hora?: string;
      servicio?: string;
    };

    if (!fecha || !hora) {
      return NextResponse.json(
        { error: "Falta fecha u hora" },
        { status: 400 }
      );
    }

    const clientEmail = process.env.GOOGLE_CALENDAR_CLIENT_EMAIL ?? process.env.CLIENT_EMAIL;
    const calendarId = process.env.GOOGLE_CALENDAR_CALENDAR_ID ?? process.env.CALENDAR_ID;
    const privateKeyRaw = process.env.GOOGLE_CALENDAR_PRIVATE_KEY ?? process.env.PRIVATE_KEY;

    if (!clientEmail || !privateKeyRaw || !calendarId) {
      console.error("Faltan variables de Google Calendar:", { clientEmail: !!clientEmail, privateKey: !!privateKeyRaw, calendarId: !!calendarId });
      return NextResponse.json(
        { error: "Configuración de calendario incompleta (CLIENT_EMAIL, PRIVATE_KEY y CALENDAR_ID)" },
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

    const [y, m, d] = fecha.split("-").map(Number);
    const [hh, mm] = hora.split(":").map(Number);
    const startDate = new Date(y, m - 1, d, hh, mm, 0);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

    const summary = `[TURNO] ${mascotaNombre ?? "Mascota"} - ${duenoNombre ?? "Dueño"}`;
    const description = [motivo, servicio].filter(Boolean).join(" · ") || "Turno veterinaria";

    const event = {
      summary,
      description,
      start: {
        dateTime: startDate.toISOString(),
        timeZone: "America/Argentina/Buenos_Aires",
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: "America/Argentina/Buenos_Aires",
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 1560 },
          { method: "email", minutes: 1560 },
        ],
      },
    };

    const res = await calendar.events.insert({
      calendarId,
      requestBody: event,
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
