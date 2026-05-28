"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
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
        <div className="h-12 w-44 rounded-xl bg-white/10 animate-pulse" />
        <div className="h-12 w-36 rounded-xl bg-white/5 animate-pulse" />
      </div>
    )
  }

  // Logueado → botón "Ir a mi panel"
  if (user && panelHref) {
    return (
      <button
        onClick={() => router.push(panelHref!)}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 px-7 py-3.5 text-base font-semibold text-white shadow-xl shadow-emerald-500/25 transition-all hover:scale-105 hover:shadow-emerald-500/40"
      >
        <LayoutDashboard className="h-4 w-4" />
        Ir a mi panel
      </button>
    )
  }

  // No logueado → Registrate + Iniciar sesión
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <Link href="/registro">
        <button className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 px-7 py-3.5 text-base font-semibold text-white shadow-xl shadow-emerald-500/25 transition-all hover:scale-105 hover:shadow-emerald-500/40">
          Registrate gratis
          <ArrowRight className="h-4 w-4" />
        </button>
      </Link>
      <Link href="/login">
        <button className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 px-7 py-3.5 text-base font-semibold text-slate-200 transition-all hover:border-slate-600">
          Iniciar sesion
        </button>
      </Link>
    </div>
  )
}
