"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Calendar, ExternalLink, FileText, LayoutDashboard, LogOut, Landmark, Package,
  Receipt, Settings, ShoppingCart, Stethoscope, Users, Wallet,
} from "lucide-react"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar"
import { canAccessSection, type AdminSection } from "@/lib/auth/permissions"
import type { UserRole } from "@/lib/supabase/queries"

interface Props {
  slug: string
  vetNombre: string
  role: UserRole | null
  onSalir: () => void
}

interface ItemNav {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  section: AdminSection
}

/**
 * El panel hace dos trabajos distintos —atender animales y vender mercadería— y
 * mezclarlos en una lista sola hacía que "Turnos" y "Vender" parecieran lo
 * mismo. Cada grupo lleva su título; colapsado, los títulos se ocultan solos y
 * quedan los iconos separados por bloque.
 */
function gruposNav(slug: string): { titulo: string; tour?: string; items: ItemNav[] }[] {
  return [
    {
      titulo: "Clínica",
      items: [
        { href: `/${slug}/admin`,            label: "Dashboard", icon: LayoutDashboard, section: "dashboard" },
        { href: `/${slug}/turnoadmin`,       label: "Turnos",    icon: Calendar,        section: "turnos" },
        { href: `/${slug}/libretasanitaria`, label: "Libreta",   icon: FileText,        section: "libreta" },
        { href: `/${slug}/clientes`,         label: "Clientes",  icon: Users,           section: "clientes" },
      ],
    },
    {
      titulo: "Comercio",
      tour: "comercio",
      items: [
        { href: `/${slug}/pos`,             label: "Vender",     icon: ShoppingCart, section: "pos" },
        { href: `/${slug}/productos`,       label: "Productos",  icon: Package,      section: "productos" },
        { href: `/${slug}/ventas`,          label: "Ventas",     icon: Receipt,      section: "ventas" },
        { href: `/${slug}/caja`,            label: "Caja",       icon: Wallet,       section: "caja" },
        { href: `/${slug}/cuenta-corriente`, label: "Cta Cte",   icon: Landmark,     section: "cuentaCorriente" },
      ],
    },
    {
      titulo: "Cuenta",
      tour: "cuenta",
      items: [
        { href: `/${slug}/configuracion`, label: "Configuración", icon: Settings, section: "configuracion" },
      ],
    },
  ]
}

export function VetAdminSidebar({ slug, vetNombre, role, onSalir }: Props) {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()

  // Un grupo cuyos items no pasan el filtro de rol desaparece entero, así no
  // queda un título suelto sin nada debajo.
  const grupos = gruposNav(slug)
    .map((grupo) => ({
      ...grupo,
      items: grupo.items.filter((item) => canAccessSection(role, item.section)),
    }))
    .filter((grupo) => grupo.items.length > 0)

  // En mobile el sidebar es un panel que tapa la pantalla: si no se cierra al
  // navegar, el usuario aterriza en la página nueva sin poder verla.
  const cerrarEnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={vetNombre || slug}>
              <Link href={`/${slug}/admin`} onClick={cerrarEnMobile}>
                <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                  <Stethoscope className="size-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">
                    {vetNombre || slug}
                  </span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {slug}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {grupos.map((grupo) => (
          <SidebarGroup key={grupo.titulo} data-tour={grupo.tour}>
            <SidebarGroupLabel>{grupo.titulo}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {grupo.items.map(({ href, label, icon: Icon }) => {
                  const activo = pathname === href || pathname.startsWith(href + "/")
                  return (
                    <SidebarMenuItem key={href}>
                      {/* `tooltip` es lo que hace usable el modo colapsado:
                          con solo el icono a la vista, el nombre aparece al pasar. */}
                      <SidebarMenuButton asChild isActive={activo} tooltip={label}>
                        <Link href={href} onClick={cerrarEnMobile}>
                          <Icon
                            className={
                              activo ? "text-emerald-600 dark:text-emerald-400" : undefined
                            }
                          />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Ver mi página pública">
              <Link href={`/${slug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                <span>Mi página</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onSalir} tooltip="Cerrar sesión">
              <LogOut />
              <span>Salir</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
