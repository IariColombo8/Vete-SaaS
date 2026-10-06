import type { Historia, LibretaPublica } from "@/lib/supabase/types"

/** Máximo de atenciones que se publican en la libreta del QR. */
export const MAX_HISTORIAS_PUBLICAS = 30

/**
 * Atenciones que puede ver cualquiera que escanee el QR de la mascota.
 * Mismo filtro de privacidad que el PDF (lib/pdf/libreta-pdf.ts): una nota
 * marcada `esPrivada` es solo para el staff y no sale de la clínica.
 * Se filtra ANTES de recortar al máximo, si no las privadas ocupan el cupo.
 */
export function resumenHistoriasPublicas(historias: Historia[]): LibretaPublica["historias"] {
  return historias
    .filter((h) => h.esPrivada !== true && h.tipoVisita !== "turno_programado")
    .slice(0, MAX_HISTORIAS_PUBLICAS)
    .map((h) => ({
      fecha: h.fechaAtencion ?? "",
      motivo: h.motivo ?? "Consulta",
      diagnostico: h.diagnostico,
      tratamiento: h.tratamiento,
    }))
}
