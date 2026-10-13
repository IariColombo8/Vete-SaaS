"use client"

import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

/**
 * Toaster global (sonner) cargado en un chunk aparte, fuera del JS inicial.
 *
 * En las superficies públicas del SaaS (landing, precios, blog) no se muestra
 * ningún toast, así que se monta recién cuando el navegador está ocioso. En
 * el resto (panel, reserva, login) se monta apenas carga el chunk: los toasts
 * ahí responden a acciones del usuario, que llegan bastante después.
 */
const Toaster = dynamic(() => import("@/components/ui/sonner").then((m) => m.Toaster), {
  ssr: false,
})

function esSuperficiePublica(pathname: string) {
  return pathname === "/" || pathname === "/pricing" || pathname.startsWith("/blog")
}

export function ToasterApp() {
  const pathname = usePathname()
  const publica = esSuperficiePublica(pathname)
  const [listo, setListo] = useState(!publica)

  useEffect(() => {
    if (listo) return
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(() => setListo(true), { timeout: 3000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = setTimeout(() => setListo(true), 500)
    return () => clearTimeout(id)
  }, [listo])

  return listo ? <Toaster richColors closeButton /> : null
}
