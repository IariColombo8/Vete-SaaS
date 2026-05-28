"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { getUserRole, getUsuarioData, signOut } from "@/lib/firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import {
  LayoutDashboard, Calendar, FileText, Users, Settings,
  ExternalLink, LogOut, Loader2, Stethoscope
} from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import type React from "react"

interface Props {
  slug: string
  children: React.ReactNode
}

export function VetAdminLayout({ slug, children }: Props) {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [vetNombre, setVetNombre] = useState<string>("")

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.push("/login"); return }

    Promise.all([
      getUserRole(user.uid),
      getUsuarioData(user.uid),
      getDoc(doc(db, "veterinarias", slug, "config", "datos")),
    ]).then(([role, userData, cfgSnap]) => {
      const userTenantId = userData?.tenantId as string | undefined
      const isOwner = userTenantId === slug || role === "superadmin"
      if (!isOwner) { router.push("/"); return }
      setVetNombre(cfgSnap.exists() ? (cfgSnap.data().nombre || slug) : slug)
      setChecking(false)
    })
  }, [user, authLoading, slug, router])

  if (authLoading || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const navItems = [
    { href: `/${slug}/admin`,            label: "Dashboard",    icon: LayoutDashboard },
    { href: `/${slug}/turnoadmin`,       label: "Turnos",       icon: Calendar },
    { href: `/${slug}/libretasanitaria`, label: "Libreta",      icon: FileText },
    { href: `/${slug}/clientes`,         label: "Clientes",     icon: Users },
    { href: `/${slug}/configuracion`,    label: "Configuracion", icon: Settings },
  ]

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Admin Nav */}
      <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between gap-4">
            {/* Brand */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <Stethoscope className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="font-bold text-sm hidden sm:block truncate max-w-[140px]">{vetNombre || slug}</span>
              <span className="text-xs font-mono text-muted-foreground hidden md:block">· {slug}</span>
            </div>

            {/* Nav links */}
            <nav className="flex items-center gap-0.5 overflow-x-auto">
              {navItems.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/")
                return (
                  <Link key={href} href={href}>
                    <Button
                      variant={active ? "default" : "ghost"}
                      size="sm"
                      className={`text-xs h-8 gap-1.5 ${active ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{label}</span>
                    </Button>
                  </Link>
                )
              })}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <Link href={`/${slug}`} target="_blank">
                <Button variant="ghost" size="sm" className="text-xs h-8 gap-1.5 text-muted-foreground">
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Mi página</span>
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-8 gap-1.5 text-muted-foreground"
                onClick={async () => { await signOut(); router.push("/") }}
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Salir</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  )
}
