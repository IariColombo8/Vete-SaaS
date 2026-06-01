"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { track } from "@vercel/analytics"
import { useAuth } from "@/hooks/use-auth"
import { resolveUserDashboard } from "@/lib/auth/resolveUserDashboard"
import { ArrowRight, LayoutDashboard } from "lucide-react"

export function HeroCta() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [panelHref, setPanelHref] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) { setChecking(false); return }

    resolveUserDashboard(user.uid).then(({ redirectTo }) => {
      setPanelHref(redirectTo)
      setChecking(false)
    })
  }, [user, authLoading])

  // Skeleton mientras carga
  if (authLoading || checking) {
    return (
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="h-[52px] w-44 rounded-2xl bg-coral/15 animate-pulse" />
        <div className="h-[52px] w-36 rounded-2xl bg-ink/5 animate-pulse" />
      </div>
    )
  }

  // Logueado → botón "Ir a mi panel" + demo
  if (user && panelHref) {
    return (
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <button
          onClick={() => router.push(panelHref!)}
          className="inline-flex items-center gap-2 rounded-2xl bg-coral hover:bg-coral-ink px-7 py-3.5 text-base font-semibold text-white shadow-xl shadow-coral/30 transition-all hover:scale-105"
        >
          <LayoutDashboard className="h-4 w-4" />
          Ir a mi panel
        </button>
        <Link
          href="/demo"
          className="inline-flex items-center gap-2 rounded-2xl border border-warm-border bg-white hover:bg-cream-deep px-7 py-3.5 text-base font-semibold text-ink transition-all hover:border-coral/30"
        >
          Ver demo en vivo
        </Link>
      </div>
    )
  }

  // No logueado → Registrate + Ver demo
  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start">
      <Link href="/registro" onClick={() => track("hero_cta_click", { action: "registro" })}>
        <button className="inline-flex items-center gap-2 rounded-2xl bg-coral hover:bg-coral-ink px-7 py-3.5 text-base font-semibold text-white shadow-xl shadow-coral/30 transition-all hover:scale-105">
          Registrate gratis
          <ArrowRight className="h-4 w-4" />
        </button>
      </Link>
      <Link
        href="/demo"
        onClick={() => track("demo_click", { from: "hero" })}
        className="inline-flex items-center gap-2 rounded-2xl border border-warm-border bg-white hover:bg-cream-deep px-7 py-3.5 text-base font-semibold text-ink transition-all hover:border-coral/30"
      >
        Ver demo en vivo
      </Link>
    </div>
  )
}
