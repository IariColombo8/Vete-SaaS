import type { Metadata } from "next"

// Área privada del dueño de la mascota: fuera de Google (robots.txt ya la
// excluye; el noindex evita que la URL aparezca igual, sin contenido).
export const metadata: Metadata = {
  title: "Historia clínica de mi mascota — VetPanel",
  robots: { index: false, follow: false },
}

export default function MiHistoriaLayout({ children }: { children: React.ReactNode }) {
  return children
}
