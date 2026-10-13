"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { track } from "@vercel/analytics"
import { useAuth } from "@/hooks/use-auth"
import { ArrowRight, LayoutDashboard } from "lucide-react"

const BOTON =
  "inline-flex items-center gap-2 rounded-2xl bg-coral hover:bg-coral-ink px-7 py-3.5 text-base font-semibold text-white shadow-xl shadow-coral/30 transition-all hover:scale-105"

/**
 * CTA principal del hero. Sale en el HTML del servidor como "Probá 10 días
 * gratis": antes arrancaba como un esqueleto hasta que Supabase resolvía la
 * sesión, así que el botón más importante de la landing aparecía recién
 * después de hidratar. Si hay sesión con panel, se reemplaza por "Ir a mi
 * panel" cuando se conoce el destino.
 */
export function HeroCta() {
  const { user } = useAuth({ diferido: true })
  const [panelHref, setPanelHref] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setPanelHref(null)
      return
    }
    let vigente = true
    import("@/lib/auth/resolveUserDashboard")
      .then(({ resolveUserDashboard }) => resolveUserDashboard(user.id))
      .then(({ redirectTo }) => {
        if (vigente) setPanelHref(redirectTo)
      })
    return () => {
      vigente = false
    }
  }, [user])

  if (user && panelHref) {
    return (
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <Link href={panelHref} className={BOTON}>
          <LayoutDashboard className="h-4 w-4" />
          Ir a mi panel
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start">
      <Link
        href="/registro"
        className={BOTON}
        onClick={() => track("hero_cta_click", { action: "registro" })}
      >
        Probá 10 días gratis
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}
