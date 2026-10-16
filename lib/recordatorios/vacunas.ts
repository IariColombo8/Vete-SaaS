import { telefonoWhatsApp } from "@/lib/telefono"

/**
 * Reglas de los recordatorios de vacunas, puras y testeadas. Las usan el cron
 * (`app/api/cron/recordatorios`) y la tarjeta del Dashboard.
 *
 * Los días se cuentan en hora de Argentina: el cron corre a las 12 UTC y la
 * fecha de la próxima dosis es un `date` local de la veterinaria.
 */

/** Días antes de la próxima dosis en que el cron manda el WhatsApp. */
export const DIAS_AVISO_DEFAULT = 7
/** Pasados estos días de vencida, el cron ya no la manda sola (queda en el panel). */
export const DIAS_GRACIA_CRON = 3
/** Intentos del cron antes de rendirse con un recordatorio que falla. */
export const MAX_INTENTOS = 3

/** Fecha de Argentina (UTC-3, sin horario de verano) como "AAAA-MM-DD". */
export function fechaArgentina(ahora: Date): string {
  return new Date(ahora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** Suma días a una fecha "AAAA-MM-DD" (sin zonas horarias de por medio). */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Días desde `hoy` hasta `fecha` (negativo si ya pasó). */
export function diasHasta(fecha: string, hoy: string): number {
  const ms = Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

/** Rango de fechas de próxima dosis que el cron procesa en un día. */
export function rangoCron(ahora: Date, diasAviso = DIAS_AVISO_DEFAULT): { desde: string; hasta: string } {
  const hoy = fechaArgentina(ahora)
  return { desde: sumarDias(hoy, -DIAS_GRACIA_CRON), hasta: sumarDias(hoy, diasAviso) }
}

/** "15/11" a partir de "2026-11-15". */
export function fechaCorta(fecha: string): string {
  const [, mes, dia] = fecha.split("-")
  return `${dia}/${mes}`
}

/** "vence hoy" / "vence mañana" / "vence en 5 días" / "venció hace 3 días". */
export function textoVencimiento(fecha: string, hoy: string): string {
  const dias = diasHasta(fecha, hoy)
  if (dias === 0) return "vence hoy"
  if (dias === 1) return "vence mañana"
  if (dias > 1) return `vence en ${dias} días`
  if (dias === -1) return "venció ayer"
  return `venció hace ${-dias} días`
}

export interface DatosMensajeRecordatorio {
  clienteNombre?: string
  mascotaNombre: string
  vacuna: string
  tipo: "vacuna" | "desparasitacion"
  fecha: string
  veterinaria: string
  /** URL para sacar turno (`https://.../{slug}/turno`). */
  urlTurno?: string
}

/** Mensaje del aviso manual por wa.me. */
export function mensajeRecordatorio(d: DatosMensajeRecordatorio, hoy: string): string {
  const nombre = d.clienteNombre?.trim().split(/\s+/)[0]
  const saludo = nombre ? `¡Hola ${nombre}!` : "¡Hola!"
  const que = d.tipo === "desparasitacion" ? `la desparasitación (${d.vacuna})` : `la vacuna ${d.vacuna}`
  const vencida = diasHasta(d.fecha, hoy) < 0
  const cuando = vencida
    ? `A ${d.mascotaNombre} le tocaba ${que} el ${fechaCorta(d.fecha)}.`
    : `Te recordamos que a ${d.mascotaNombre} le toca ${que} el ${fechaCorta(d.fecha)}.`

  return [
    saludo,
    cuando,
    d.urlTurno ? `Podés sacar turno acá: ${d.urlTurno}` : "Escribinos para coordinar el turno.",
    "",
    d.veterinaria,
  ].join("\n")
}

/** URL de wa.me lista para abrir. Sin teléfono usable, WhatsApp pide el contacto. */
export function linkRecordatorio(telefono: string | undefined, d: DatosMensajeRecordatorio, hoy: string): string {
  const numero = telefonoWhatsApp(telefono)
  const texto = encodeURIComponent(mensajeRecordatorio(d, hoy))
  return numero ? `https://wa.me/${numero}?text=${texto}` : `https://wa.me/?text=${texto}`
}
