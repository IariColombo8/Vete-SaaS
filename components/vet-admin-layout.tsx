"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { getUserRole, getUsuarioData, signOut } from "@/lib/supabase/auth"
import { getTenantConfig } from "@/lib/supabase/queries"
import {
  LayoutDashboard, Calendar, FileText, Users, Settings,
  ExternalLink, LogOut, Loader2, Stethoscope
} from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import type React from "react"
import type { UserRole } from "@/lib/supabase/queries"
import { canAccessSection, type AdminSection } from "@/lib/auth/permissions"

interface Props {
  slug: string
  children: React.ReactNode
}

/** Mapea una ruta del panel a su sección para el control de acceso. */
function sectionFromPath(pathname: string, slug: string): AdminSection | null {
  if (pathname.startsWith(`/${slug}/configuracion`)) return "configuracion"
  if (pathname.startsWith(`/${slug}/turnoadmin`)) return "turnos"
  if (pathname.startsWith(`/${slug}/libretasanitaria`)) return "libreta"
  if (pathname.startsWith(`/${slug}/clientes`)) return "clientes"
  if (pathname.startsWith(`/${slug}/admin`)) return "dashboard"
  return null
}

export function VetAdminLayout({ slug, children }: Props) {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [vetNombre, setVetNombre] = useState<string>("")
  const [role, setRole] = useState<UserRole | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.push("/login"); return }

    Promise.all([
      getUserRole(user.id),
      getUsuarioData(user.id),
      getTenantConfig(slug),
    ]).then(([userRole, userData, config]) => {
      const userTenantId = userData?.tenantId as string | undefined
      // Acceso: superadmin, o pertenece al tenant (veterinario/empleado con tenantId === slug)
      const perteneceAlTenant = userTenantId === slug && (userRole === "veterinario" || userRole === "empleado")
      const isOwner = perteneceAlTenant || userRole === "superadmin"
      if (!isOwner) { router.push("/"); return }
      setRole(userRole)
      // Guard de sección: empleado no accede a configuración
      const section = sectionFromPath(pathname, slug)
      if (section && !canAccessSection(userRole, section)) {
        router.push(`/${slug}/admin`)
        return
      }
      setVetNombre(config?.nombre || slug)
      setChecking(false)
    })
  }, [user, authLoading, slug, router, pathname])

  if (authLoading || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const navItems = ([
    { href: `/${slug}/admin`,            label: "Dashboard",     icon: LayoutDashboard, section: "dashboard" as const },
    { href: `/${slug}/turnoadmin`,       label: "Turnos",        icon: Calendar,        section: "turnos" as const },
    { href: `/${slug}/libretasanitaria`, label: "Libreta",       icon: FileText,        section: "libreta" as const },
    { href: `/${slug}/clientes`,         label: "Clientes",      icon: Users,           section: "clientes" as const },
    { href: `/${slug}/configuracion`,    label: "Configuracion", icon: Settings,        section: "configuracion" as const },
  ]).filter((item) => canAccessSection(role, item.section))

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
