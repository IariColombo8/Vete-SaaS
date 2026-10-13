import type { Metadata } from "next"

// Área del cliente (sus turnos y mascotas): privada, fuera de Google.
export const metadata: Metadata = {
  title: "Mi cuenta — VetPanel",
  robots: { index: false, follow: false },
}

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  return children
}
