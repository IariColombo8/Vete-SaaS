"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Calendar, ClipboardList, ExternalLink, FileText, Gift, HandCoins, LayoutDashboard, Lock, LogOut, Landmark, Package,
  Receipt, Settings, ShoppingCart, Stethoscope, Store, Users, Wallet,
} from "lucide-react"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton,
  SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar"
import { canAccessSection, type AdminSection } from "@/lib/auth/permissions"
import type { UserRole } from "@/lib/supabase/queries"
import { planAllows, type Feature } from "@/lib/plans"
import { contarPedidosPendientes } from "@/lib/supabase/pedidos"

interface Props {
  slug: string
  vetNombre: string
  role: UserRole | null
  /** Plan del tenant; con él se marcan las secciones que el plan no incluye. */
  plan?: string
  onSalir: () => void
}

interface ItemNav {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  section: AdminSection
  /** Feature que exige la pantalla (la misma que usa su FeatureGate). */
  feature?: Feature
}

/**
 * Cuatro bloques, uno por tipo de trabajo:
 * - Clínica: atender animales.
 * - Comercio: el mostrador, en el orden del día (vender → pedidos web → caja →
 *   ventas → cobrar cuentas → reponer productos).
 * - Online: lo que ve el cliente desde afuera (página, catálogo, promos).
 * - Administración: lo del dueño (gastos, configuración).
 * Cada grupo lleva su título; colapsado, los títulos se ocultan solos y
 * quedan los iconos separados por bloque.
 */
function gruposNav(slug: string): { titulo: string; tour?: string; items: ItemNav[] }[] {
  return [
    {
      titulo: "Clínica",
      items: [
        { href: `/${slug}/admin/Dashboard`,       label: "Dashboard", icon: LayoutDashboard, section: "dashboard" },
        { href: `/${slug}/admin/Turnos`,          label: "Turnos",    icon: Calendar,        section: "turnos" },
        { href: `/${slug}/admin/Libreta`,         label: "Libreta",   icon: FileText,        section: "libreta" },
        { href: `/${slug}/admin/Clientes`,        label: "Clientes",  icon: Users,           section: "clientes" },
      ],
    },
    {
      titulo: "Comercio",
      tour: "comercio",
      items: [
        { href: `/${slug}/admin/Vender`,          label: "Punto de venta",   icon: ShoppingCart, section: "pos",             feature: "ventas" },
        { href: `/${slug}/admin/Pedidos`,         label: "Pedidos",          icon: ClipboardList, section: "pedidos",       feature: "ventas" },
        { href: `/${slug}/admin/Caja`,            label: "Caja",             icon: Wallet,       section: "caja",            feature: "ventas" },
        { href: `/${slug}/admin/Ventas`,          label: "Ventas",           icon: Receipt,      section: "ventas",          feature: "ventas" },
        { href: `/${slug}/admin/CuentaCorriente`, label: "Cuenta corriente", icon: Landmark,     section: "cuentaCorriente", feature: "ventas" },
        { href: `/${slug}/admin/Productos`,       label: "Productos",        icon: Package,      section: "productos",       feature: "productos" },
      ],
    },
    {
      titulo: "Online",
      tour: "online",
      items: [
        { href: `/${slug}/admin/TiendaVirtual`, label: "Tienda virtual",   icon: Store, section: "tiendaVirtual" },
        { href: `/${slug}/admin/PromosSorteos`, label: "Promos y sorteos", icon: Gift,  section: "promosSorteos", feature: "promosSorteos" },
      ],
    },
    {
      titulo: "Administración",
      tour: "administracion",
      items: [
        { href: `/${slug}/admin/Gastos`,        label: "Gastos",        icon: HandCoins, section: "gastos",        feature: "ventas" },
        { href: `/${slug}/admin/Configuracion`, label: "Configuración", icon: Settings,  section: "configuracion" },
      ],
    },
  ]
}

export function VetAdminSidebar({ slug, vetNombre, role, plan, onSalir }: Props) {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()
  const pendientes = usePedidosPendientes(slug, canAccessSection(role, "pedidos") && planAllows(plan, "ventas"))

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
              <Link href={`/${slug}/admin/Dashboard`} onClick={cerrarEnMobile}>
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
                {grupo.items.map(({ href, label, icon: Icon, feature }) => {
                  const activo = pathname === href || pathname.startsWith(href + "/")
                  // La sección sigue siendo navegable (su FeatureGate explica
                  // qué incluye y lleva a los planes); el candado avisa antes
                  // de entrar, para que no parezca un link roto.
                  // Mismo criterio que FeatureGate: sin plan se toma Básico.
                  const bloqueada = !!feature && !planAllows(plan, feature)
                  return (
                    <SidebarMenuItem key={href}>
                      {/* `tooltip` es lo que hace usable el modo colapsado:
                          con solo el icono a la vista, el nombre aparece al pasar. */}
                      <SidebarMenuButton asChild isActive={activo} tooltip={bloqueada ? `${label} · Plan Pro` : label}>
                        <Link href={href} onClick={cerrarEnMobile}>
                          <Icon
                            className={
                              activo ? "text-sidebar-primary" : undefined
                            }
                          />
                          <span className={bloqueada ? "text-sidebar-foreground/60" : undefined}>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {!bloqueada && href.endsWith("/Pedidos") && pendientes > 0 && (
                        <SidebarMenuBadge
                          className="bg-coral text-white"
                          aria-label={`${pendientes} pedidos pendientes`}
                        >
                          {pendientes}
                        </SidebarMenuBadge>
                      )}
                      {bloqueada && (
                        <SidebarMenuBadge
                          className="gap-0.5 bg-warning-soft text-warning-soft-foreground"
                          aria-label="Disponible en el plan Pro"
                        >
                          <Lock className="h-2.5 w-2.5" />
                          Pro
                        </SidebarMenuBadge>
                      )}
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

/** Pedidos web sin empezar, para el número junto a "Pedidos". Se refresca cada minuto. */
function usePedidosPendientes(slug: string, activo: boolean): number {
  const [cantidad, setCantidad] = useState(0)
  useEffect(() => {
    if (!activo) return
    let vigente = true
    const contar = () => contarPedidosPendientes(slug).then((n) => { if (vigente) setCantidad(n) })
    contar()
    const t = setInterval(contar, 60_000)
    return () => {
      vigente = false
      clearInterval(t)
    }
  }, [slug, activo])
  return cantidad
}
