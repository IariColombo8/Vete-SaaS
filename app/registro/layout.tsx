import type { Metadata } from "next"
import { SITIO } from "@/lib/seo/sitio"

// La página es "use client" y no puede exportar metadata: sin este layout
// heredaba el título genérico del sitio y Google la tomaba como copia de la home.
const titulo = "Probá VetPanel 10 días gratis — Registro"
const descripcion =
  "Registrá tu veterinaria en VetPanel y en minutos tenés turnos online, historia clínica y libreta sanitaria digital. 10 días de prueba gratis, sin tarjeta."

export const metadata: Metadata = {
  title: { absolute: titulo },
  description: descripcion,
  alternates: { canonical: "/registro" },
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: "/registro",
    siteName: SITIO.nombre,
    title: titulo,
    description: descripcion,
    images: [{ url: SITIO.imagen, width: 1200, height: 630, alt: "VetPanel — software para veterinarias" }],
  },
}

export default function RegistroLayout({ children }: { children: React.ReactNode }) {
  return children
}
