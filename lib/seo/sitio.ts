/**
 * Datos del sitio para SEO. La URL sale de NEXT_PUBLIC_APP_URL, con el mismo
 * fallback que ya usaban el layout, el blog y las páginas de cada veterinaria.
 */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.vetpanel.com.ar").replace(/\/$/, "")

export const SITIO = {
  nombre: "VetPanel",
  titulo: "VetPanel — Software de gestión para veterinarias",
  descripcion:
    "Turnos online, historia clínica digital, libreta sanitaria con QR, recordatorios por WhatsApp y punto de venta. Tu veterinaria con su propia página, lista en minutos. Probá 10 días gratis, sin tarjeta.",
  imagen: "/metadato.png",
} as const

/** Rutas privadas o personales: no tienen que aparecer en Google. */
export const RUTAS_NO_INDEXABLES = [
  "/api/",
  "/superadmin",
  "/login",
  "/*/admin",
  "/*/onboarding",
  "/*/libreta/",
  "/*/mi-historia",
  "/*/cliente",
] as const
