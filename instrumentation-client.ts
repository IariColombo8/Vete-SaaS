import type * as SentryTipo from "@sentry/nextjs"

/**
 * Monitoreo de errores en el navegador.
 *
 * El SDK de Sentry es el chunk más pesado de todo el sitio (~150 KB
 * comprimidos, ~1 s de CPU en un celular) y se ejecutaba antes de que la
 * página fuera interactiva, en todas las rutas, incluso sin DSN configurado.
 * Ahora se importa en diferido, cuando el navegador queda ocioso, y solo si
 * hay DSN. Los errores que ocurran antes de que termine de inicializar se
 * guardan en una cola y se envían apenas el SDK está listo: no se pierden.
 */
type Sdk = typeof SentryTipo

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

let sdk: Sdk | null = null
const pendientes: unknown[] = []

function capturarError(e: ErrorEvent) {
  pendientes.push(e.error ?? e.message)
}
function capturarRechazo(e: PromiseRejectionEvent) {
  pendientes.push(e.reason)
}

function cargarSentry() {
  import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    })
    window.removeEventListener("error", capturarError)
    window.removeEventListener("unhandledrejection", capturarRechazo)
    for (const error of pendientes) Sentry.captureException(error)
    pendientes.length = 0
    sdk = Sentry
  })
}

if (dsn && typeof window !== "undefined") {
  window.addEventListener("error", capturarError)
  window.addEventListener("unhandledrejection", capturarRechazo)
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(cargarSentry, { timeout: 5000 })
  } else {
    setTimeout(cargarSentry, 2000)
  }
}

/** Next lo llama en cada navegación; se reenvía al SDK si ya cargó. */
export function onRouterTransitionStart(
  ...args: Parameters<Sdk["captureRouterTransitionStart"]>
) {
  sdk?.captureRouterTransitionStart(...args)
}
