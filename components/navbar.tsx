"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import { signOut } from "@/lib/firebase/auth"
import { resolveUserDashboard } from "@/lib/auth/resolveUserDashboard"
import { useRouter, usePathname } from "next/navigation"
import { Menu, X, Stethoscope, LayoutDashboard, Shield } from "lucide-react"
import { useState, useEffect } from "react"
import type { UserRole } from "@/lib/firebase/firestore"

// ─── SaaS Navbar (mostrado solo en "/") ─────────────────────────────────────
function SaasNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user } = useAuth()
  const [role, setRole] = useState<UserRole | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)

  const [dashboardHref, setDashboardHref] = useState<string | null>(null)

  useEffect(() => {
    if (!user) { setRole(null); setTenantId(null); setDashboardHref(null); return }
    resolveUserDashboard(user.uid).then(({ role: r, tenantId: t, redirectTo }) => {
      setRole(r)
      setTenantId(t)
      setDashboardHref(r === "usuario" ? null : redirectTo)
    })
  }, [user])

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/20">
              <Stethoscope className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">
              Vet<span className="text-emerald-400">Panel</span>
            </span>
          </Link>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-6">
            <a href="#caracteristicas" className="text-sm text-slate-300 hover:text-white transition-colors">
              Características
            </a>
            <a href="#precios" className="text-sm text-slate-300 hover:text-white transition-colors">
              Precios
            </a>
            <div className="flex items-center gap-2 ml-4">
              {user ? (
                <>
                  {dashboardHref && (
                    <Link href={dashboardHref}>
                      <Button size="sm" variant="ghost" className="text-slate-300 hover:text-white hover:bg-white/10">
                        <LayoutDashboard className="h-4 w-4 mr-1.5" />
                        Mi Panel
                      </Button>
                    </Link>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-slate-400 hover:text-white hover:bg-white/10"
                    onClick={() => signOut()}
                  >
                    Cerrar Sesión
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/login">
                    <Button size="sm" variant="ghost" className="text-slate-300 hover:text-white hover:bg-white/10">
                      Iniciar sesion
                    </Button>
                  </Link>
                  <Link href="/registro">
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-semibold shadow-lg shadow-emerald-500/25 border-0"
                    >
                      Registrate →
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Mobile toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden text-slate-300 hover:text-white hover:bg-white/10"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {mobileOpen && (
          <div className="border-t border-white/10 py-4 md:hidden flex flex-col gap-2">
            <a
              href="#caracteristicas"
              className="px-3 py-2 text-sm text-slate-300 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              Características
            </a>
            <a
              href="#precios"
              className="px-3 py-2 text-sm text-slate-300 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              Precios
            </a>
            {user ? (
              <>
                {dashboardHref && (
                  <Link href={dashboardHref} onClick={() => setMobileOpen(false)}>
                    <Button size="sm" variant="ghost" className="w-full justify-start text-slate-300">
                      Mi Panel
                    </Button>
                  </Link>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start text-slate-400"
                  onClick={() => { signOut(); setMobileOpen(false) }}
                >
                  Cerrar Sesión
                </Button>
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => setMobileOpen(false)}>
                  <Button size="sm" variant="ghost" className="w-full justify-start text-slate-300">
                    Iniciar sesion
                  </Button>
                </Link>
                <Link href="/registro" onClick={() => setMobileOpen(false)}>
                  <Button
                    size="sm"
                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold border-0"
                  >
                    Registrate →
                  </Button>
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}

// ─── Superadmin Navbar ───────────────────────────────────────────────────────
function SuperAdminNavbar() {
  const router = useRouter()
  const handleSignOut = async () => {
    await signOut()
    router.push("/")
  }

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl shadow-sm">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/superadmin" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 shadow-md">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <div>
              <span className="text-sm font-bold">VetPanel</span>
              <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                SUPER ADMIN
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/superadmin">
              <Button variant="ghost" size="sm">Panel</Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground">
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}

// ─── Navbar para páginas públicas de veterinaria (/[slug]/turno, etc.) ──────
function VetPublicNavbar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()
  const [tenant, setTenant] = useState<{ nombre: string; logo?: string } | null>(null)

  const slugMatch = pathname.match(/^\/([^/]+)/)
  const slug = slugMatch ? slugMatch[1] : ""

  useEffect(() => {
    if (!slug) return
    import("@/lib/firebase/firestore").then(({ getTenantConfig }) => {
      getTenantConfig(slug).then(cfg => {
        if (cfg) setTenant({ nombre: cfg.nombre || slug, logo: cfg.logo })
      })
    })
  }, [slug])

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/90 backdrop-blur-xl shadow-sm">
      <div className="container max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between">
          <button onClick={() => router.push(`/${slug}`)} className="flex items-center gap-2.5">
            {tenant?.logo
              ? <img src={tenant.logo} alt="Logo" className="h-8 w-8 rounded-lg object-contain" />
              : <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                  <Stethoscope className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
            }
            <span className="font-bold text-sm">{tenant?.nombre ?? ""}</span>
          </button>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => router.push(`/${slug}/turno`)}
            >
              Sacar turno
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}

// ─── Exportación principal: elige el navbar según la ruta ───────────────────
export function Navbar() {
  const pathname = usePathname()

  if (pathname === "/" || pathname === "/pricing") return <SaasNavbar />
  if (pathname.startsWith("/superadmin")) return <SuperAdminNavbar />

  // Vet admin pages have their own nav via VetAdminLayout
  const isVetAdmin = /^\/[^/]+(\/admin|\/turnoadmin|\/libretasanitaria|\/clientes|\/configuracion|\/onboarding)/.test(pathname)
  if (isVetAdmin) return null

  // Public vet page has its own full-page hero/footer design
  const isVetPublicHome = /^\/[^/]+$/.test(pathname)
  if (isVetPublicHome) return null

  // Vet-specific public routes (/[slug]/turno, etc.)
  const isVetPublicRoute = /^\/[^/]+\//.test(pathname) &&
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/registro") &&
    !pathname.startsWith("/mis-turnos") &&
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/superadmin")
  if (isVetPublicRoute) return <VetPublicNavbar />

  return <SaasNavbar />
}
