/** Genera el link de "Agregar a Google Calendar" (calendar/render?action=TEMPLATE) para el botón del email de confirmación. */

interface DatosEventoCalendar {
  fecha: string // yyyy-MM-dd
  hora: string // HH:mm
  duracionMin?: number
  titulo: string
  descripcion?: string
  direccion?: string
}

/** Argentina es UTC-3 fijo (sin horario de verano desde 2009). */
const OFFSET_ARGENTINA_HORAS = 3

function formatUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}

/** Convierte fecha/hora local de Buenos Aires a un Date en UTC. */
function localArgentinaToUtc(fecha: string, hora: string, minutosExtra = 0): Date {
  const [y, m, d] = fecha.split("-").map(Number)
  const [hh, mm] = hora.split(":").map(Number)
  return new Date(Date.UTC(y, m - 1, d, hh + OFFSET_ARGENTINA_HORAS, mm + minutosExtra, 0))
}

export function generarLinkGoogleCalendar(datos: DatosEventoCalendar): string {
  const inicio = formatUtc(localArgentinaToUtc(datos.fecha, datos.hora))
  const fin = formatUtc(localArgentinaToUtc(datos.fecha, datos.hora, datos.duracionMin ?? 60))

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: datos.titulo,
    dates: `${inicio}/${fin}`,
  })
  if (datos.descripcion) params.set("details", datos.descripcion)
  if (datos.direccion) params.set("location", datos.direccion)

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
