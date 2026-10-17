"use client"

import type React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Banknote, BarChart3, ExternalLink, Layers, LogOut, RefreshCw, Shield, Stethoscope, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar"

export type SeccionSuperadmin = "veterinarias" | "pagos" | "usuarios" | "planes" | "metricas"

export const SECCIONES: { id: SeccionSuperadmin; label: string; descripcion: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "veterinarias", label: "Veterinarias", descripcion: "Clientes de la plataforma, su plan, su uso y lo que pagan", icon: Stethoscope },
  { id: "pagos",        label: "Pagos",        descripcion: "Quién pagó el mes y registro de pagos en efectivo",           icon: Banknote },
  { id: "usuarios",     label: "Usuarios",     descripcion: "Todas las cuentas y cuánto usa cada una el panel",            icon: Users },
  { id: "planes",       label: "Planes",       descripcion: "Catálogo de planes: precios, límites y secciones",            icon: Layers },
  { id: "metricas",     label: "Métricas",     descripcion: "Ingreso mensual y proyección al ritmo actual",                icon: BarChart3 },
]

interface Props {
  seccion: SeccionSuperadmin
  onSeccion: (s: SeccionSuperadmin) => void
  /** Avisos por sección (p. ej. pagos atrasados), como número en el menú. */
  avisos?: Partial<Record<SeccionSuperadmin, number>>
  cargando: boolean
  onActualizar: () => void
  onSalir: () => void
  children: React.ReactNode
}

/**
 * Armazón del superadmin: el mismo sidebar colapsable que el panel de las
 * veterinarias (estado en cookie, Ctrl/Cmd+B) y un encabezado fijo con el
 * título de la sección. Reemplaza al navbar global y a las solapas.
 */
export function SuperadminShell({ seccion, onSeccion, avisos, cargando, onActualizar, onSalir, children }: Props) {
  const actual = SECCIONES.find((s) => s.id === seccion) ?? SECCIONES[0]
  return (
    <SidebarProvider>
      <MenuSuperadmin seccion={seccion} onSeccion={onSeccion} avisos={avisos} onSalir={onSalir} />
      <SidebarInset className="bg-slate-50 dark:bg-slate-950">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold">{actual.label}</h1>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">{actual.descripcion}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onActualizar} disabled={cargando} className="gap-1.5">
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
        </header>
        <main className="min-w-0 flex-1 space-y-6 px-4 py-6 sm:px-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function MenuSuperadmin({
  seccion, onSeccion, avisos, onSalir,
}: Pick<Props, "seccion" | "onSeccion" | "avisos" | "onSalir">) {
  const router = useRouter()
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="VetPanel · Superadmin" onClick={() => onSeccion("veterinarias")}>
              <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white">
                <Shield className="size-4" />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">VetPanel</span>
                <span className="truncate text-xs text-muted-foreground">Superadmin</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {SECCIONES.map(({ id, label, icon: Icon }) => {
                const aviso = avisos?.[id] ?? 0
                return (
                  <SidebarMenuItem key={id}>
                    <SidebarMenuButton
                      isActive={seccion === id}
                      tooltip={label}
                      onClick={() => {
                        onSeccion(id)
                        // En mobile el menú tapa la pantalla: se cierra al elegir.
                        if (isMobile) setOpenMobile(false)
                      }}
                    >
                      <Icon className={seccion === id ? "text-sidebar-primary" : undefined} />
                      <span>{label}</span>
                    </SidebarMenuButton>
                    {aviso > 0 && (
                      <SidebarMenuBadge className="bg-warning-soft text-warning-soft-foreground">{aviso}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Ir al sitio">
              <Link href="/" target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                <span>Ir al sitio</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Cerrar sesión"
              onClick={async () => {
                await onSalir()
                router.push("/")
              }}
            >
              <LogOut />
              <span>Salir</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
