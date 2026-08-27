"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { HelpCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import { getUserRole, getUsuarioData, signOut } from "@/lib/supabase/auth"
import { getTenantConfig } from "@/lib/supabase/queries"
import { VetAdminSidebar } from "@/components/vet-admin-sidebar"
import {
  SidebarInset, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import type React from "react"
import type { UserRole } from "@/lib/supabase/queries"
import { canAccessSection, type AdminSection } from "@/lib/auth/permissions"
import { getTrialStatus } from "@/lib/plans"
import { ReadOnlyProvider } from "@/lib/auth/read-only-context"
import { TrialExpiredBanner } from "@/components/admin/trial-expired-banner"

interface Props {
  slug: string
  children: React.ReactNode
}

/** Mapea una ruta del panel a su sección para el control de acceso. */
function sectionFromPath(pathname: string, slug: string): AdminSection | null {
  const base = `/${slug}/admin/`
  if (!pathname.startsWith(base)) return null
  const resto = pathname.slice(base.length)
  if (resto.startsWith("Configuracion")) return "configuracion"
  if (resto.startsWith("Turnos")) return "turnos"
  if (resto.startsWith("Libreta")) return "libreta"
  if (resto.startsWith("Clientes")) return "clientes"
  if (resto.startsWith("Productos")) return "productos"
  if (resto.startsWith("Vender")) return "pos"
  if (resto.startsWith("Ventas")) return "ventas"
  if (resto.startsWith("Caja")) return "caja"
  if (resto.startsWith("CuentaCorriente")) return "cuentaCorriente"
  if (resto.startsWith("Dashboard")) return "dashboard"
  return null
}

/** Título de la barra superior, para saber dónde se está con el menú plegado. */
const TITULOS: Record<AdminSection, string> = {
  dashboard: "Dashboard",
  turnos: "Turnos",
  libreta: "Libreta sanitaria",
  clientes: "Clientes",
  productos: "Productos y stock",
  pos: "Punto de venta",
  ventas: "Ventas",
  caja: "Caja",
  cuentaCorriente: "Cuenta corriente",
  promosSorteos: "Promos y sorteos",
  configuracion: "Configuración",
}

export function VetAdminLayout({ slug, children }: Props) {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [vetNombre, setVetNombre] = useState<string>("")
  const [trialVencido, setTrialVencido] = useState(false)
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
        router.push(`/${slug}/admin/Dashboard`)
        return
      }
      setVetNombre(config?.nombre || slug)
      setTrialVencido(getTrialStatus(config ?? {}).vencido)
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

  const section = sectionFromPath(pathname, slug)

  return (
    // `SidebarProvider` recuerda el estado en una cookie, así que el menú queda
    // como lo dejó el usuario entre recargas y entre páginas. Ctrl/Cmd+B lo
    // pliega y despliega sin tocar el mouse.
    <ReadOnlyProvider readOnly={trialVencido}>
      <SidebarProvider>
        <VetAdminSidebar
          slug={slug}
          vetNombre={vetNombre}
          role={role}
          onSalir={async () => {
            await signOut()
            router.push("/")
          }}
        />

        <SidebarInset className="bg-slate-50 dark:bg-slate-950">
          {trialVencido && <TrialExpiredBanner />}
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 h-4" />
            <h1 className="truncate text-sm font-semibold flex-1">
              {section ? TITULOS[section] : (vetNombre || slug)}
            </h1>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => router.push(`/${slug}/admin/Dashboard?tour=1`)}
            >
              <HelpCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Ayuda</span>
            </Button>
          </header>

          {/* Sin `container mx-auto`: con el sidebar plegado el contenido tiene que
              aprovechar el ancho que se liberó, sobre todo el mostrador. */}
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </ReadOnlyProvider>
  )
}
