import type { Metadata } from "next"

// La página es "use client" y no puede exportar metadata: sin este layout
// heredaba el título de la landing (título duplicado) y no llevaba noindex.
// robots.txt ya la excluye, pero una URL bloqueada igual puede aparecer en
// Google sin contenido; el noindex en la página lo evita.
export const metadata: Metadata = {
  title: "Iniciar sesión — VetPanel",
  description: "Ingresá al panel de tu veterinaria en VetPanel.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/login" },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
