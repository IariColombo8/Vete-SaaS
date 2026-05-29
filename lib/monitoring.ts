import * as Sentry from "@sentry/nextjs"

/**
 * Reporta un error a Sentry (si está configurado) y lo loguea.
 * Úsalo en bloques catch de rutas/acciones críticas.
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  console.error("[error]", error, context ?? "")
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined)
  } catch {
    // Sentry no inicializado: el console.error ya dejó registro.
  }
}
