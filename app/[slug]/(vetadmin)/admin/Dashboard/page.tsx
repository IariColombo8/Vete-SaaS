"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSlug } from "@/context/slug-context"
import { DashboardCharts } from "@/components/admin/dashboard-charts"
import { getTenantConfig, getTurnosDelMes } from "@/lib/supabase/queries"
import type { TenantConfig } from "@/lib/supabase/queries"
import { getPlanLimits, planAllows } from "@/lib/plans"
import { UpgradePlanButton } from "@/components/billing/upgrade-plan-button"
import { DashboardTour } from "@/components/admin/dashboard-tour"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  LayoutDashboard,
  Calendar,
  FileText,
  Users,
  Settings,
  ExternalLink,
  Copy,
  Globe,
  CalendarPlus,
  Stethoscope,
  Link2,
  ShoppingCart,
  Package,
  Receipt,
  ChevronDown,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"

const planInfo: Record<string, { label: string; color: string }> = {
  basico: { label: "Basico (10 turnos/mes)", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  plus:   { label: "Plus",                   color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  pro:    { label: "Pro",                    color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
}

export default function DashboardPage() {
  const slug = useSlug()
  const router = useRouter()
  const { toast } = useToast()
  const [config, setConfig] = useState<TenantConfig | null>(null)
  const [turnosMes, setTurnosMes] = useState<number | null>(null)
  const [accesosAbiertos, setAccesosAbiertos] = useState(true)
  const [enlacesAbiertos, setEnlacesAbiertos] = useState(true)

  useEffect(() => {
    Promise.all([getTenantConfig(slug), getTurnosDelMes(slug)]).then(([cfg, count]) => {
      setConfig(cfg)
      setTurnosMes(count)
    })
  }, [slug])

  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://vetpanel.app"

  function copyLink(path: string) {
    navigator.clipboard.writeText(`${BASE_URL}${path}`)
    toast({ title: "Link copiado" })
  }

  const plan = config?.plan ?? "basico"
  const pi = planInfo[plan] ?? planInfo.basico
  const maxTurnos = getPlanLimits(plan).maxTurnosMes

  const puedeVenderYProductos = planAllows(plan, "productos")
  const puedeVentas = planAllows(plan, "ventas")

  const sections = [
    {
      href: `/${slug}`,
      label: "Mi pagina publica",
      desc: "Lo que ven tus clientes",
      icon: Globe,
      color: "bg-teal-50 dark:bg-teal-900/20",
      iconColor: "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400",
      external: true,
    },
    {
      href: `/${slug}/turno`,
      label: "Link para sacar turno",
      desc: "Compartilo con tus clientes",
      icon: CalendarPlus,
      color: "bg-emerald-50 dark:bg-emerald-900/20",
      iconColor: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400",
      external: true,
    },
    {
      href: `/${slug}/admin/Turnos`,
      label: "Administrar turnos",
      desc: "Gestiona y aprueba turnos",
      icon: Calendar,
      color: "bg-indigo-50 dark:bg-indigo-900/20",
      iconColor: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400",
      external: false,
    },
    {
      href: `/${slug}/admin/Libreta`,
      label: "Libreta sanitaria",
      desc: "Historial clinico de mascotas",
      icon: FileText,
      color: "bg-amber-50 dark:bg-amber-900/20",
      iconColor: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
      external: false,
    },
    {
      href: `/${slug}/admin/Clientes`,
      label: "Clientes",
      desc: "Duenos y mascotas registrados",
      icon: Users,
      color: "bg-pink-50 dark:bg-pink-900/20",
      iconColor: "bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-400",
      external: false,
    },
    ...(puedeVenderYProductos
      ? [
          {
            href: `/${slug}/admin/Productos`,
            label: "Productos",
            desc: "Catalogo, stock y ofertas",
            icon: Package,
            color: "bg-orange-50 dark:bg-orange-900/20",
            iconColor: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400",
            external: false,
          },
        ]
      : []),
    ...(puedeVentas
      ? [
          {
            href: `/${slug}/admin/Vender`,
            label: "Punto de venta",
            desc: "Mostrador para cobrar y emitir remitos",
            icon: ShoppingCart,
            color: "bg-cyan-50 dark:bg-cyan-900/20",
            iconColor: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400",
            external: false,
          },
          {
            href: `/${slug}/admin/Ventas`,
            label: "Ventas",
            desc: "Historial de remitos y metricas de caja",
            icon: Receipt,
            color: "bg-violet-50 dark:bg-violet-900/20",
            iconColor: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
            external: false,
          },
        ]
      : []),
    {
      href: `/${slug}/admin/Configuracion`,
      label: "Configuracion",
      desc: "Datos de tu clinica y turnos",
      icon: Settings,
      color: "bg-slate-50 dark:bg-slate-800/50",
      iconColor: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
      external: false,
    },
  ]

  return (
    <>
      <Suspense fallback={null}>
        <DashboardTour slug={slug} />
      </Suspense>
      <div className="space-y-6">
        {/* Encabezado con plan */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
              <Stethoscope className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{config?.nombre || slug}</h1>
              <p className="text-xs text-muted-foreground font-mono">/{slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2" data-tour="plan">
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${pi.color}`}>
              Plan {pi.label}
            </span>
            {config?.status === "pausado" && (
              <Badge variant="destructive" className="text-xs">Pausada</Badge>
            )}
          </div>
        </div>

        {/* Uso del plan — visible cuando el plan tiene límite mensual */}
        {maxTurnos !== null && turnosMes !== null && (() => {
          const alcanzado = turnosMes >= maxTurnos
          const cercaDelTope = turnosMes >= maxTurnos * 0.7
          const restantes = Math.max(maxTurnos - turnosMes, 0)
          const porcentaje = Math.min(Math.round((turnosMes / maxTurnos) * 100), 100)
          return (
            <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-4 text-sm
              ${alcanzado
                ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
                : cercaDelTope
                ? "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"
                : "bg-slate-50 border-slate-200 dark:bg-slate-800/50 dark:border-slate-700"
              }`}
            >
              <div>
                <p className={`font-semibold ${alcanzado ? "text-red-700 dark:text-red-400" : "text-slate-700 dark:text-slate-300"}`}>
                  {alcanzado
                    ? "Límite del plan alcanzado"
                    : `Turnos este mes: ${turnosMes} / ${maxTurnos}`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {alcanzado
                    ? "No se pueden agendar más turnos este mes. Mejorá tu plan para ampliar el límite."
                    : `Te quedan ${restantes} turno${restantes === 1 ? "" : "s"} disponibles en el plan ${pi.label}.`}
                </p>
                <div className="mt-2">
                  <UpgradePlanButton tenantId={slug} planActual={plan} />
                </div>
              </div>
              <div className="shrink-0 w-24">
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${alcanzado ? "bg-red-500" : cercaDelTope ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${porcentaje}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-right mt-1">{porcentaje}%</p>
              </div>
            </div>
          )
        })()}

        {/* Accesos rapidos */}
        <Collapsible open={accesosAbiertos} onOpenChange={setAccesosAbiertos} data-tour="accesos">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 mb-3 group">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Accesos rapidos
            </h2>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {sections.map(({ href, label, desc, icon: Icon, color, iconColor, external }) => (
                <Card
                  key={href}
                  className={`border hover:border-emerald-400/50 hover:shadow-md transition-all cursor-pointer ${color}`}
                  onClick={() => external ? window.open(href, "_blank") : router.push(href)}
                  title={desc}
                >
                  <CardContent className="p-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${iconColor}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{label}</p>
                        <p className="text-xs text-muted-foreground truncate">{desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {external && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={e => { e.stopPropagation(); copyLink(href) }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={e => {
                          e.stopPropagation()
                          external ? window.open(href, "_blank") : router.push(href)
                        }}
                      >
                        {external
                          ? <ExternalLink className="h-3 w-3" />
                          : <LayoutDashboard className="h-3 w-3" />
                        }
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Tus enlaces */}
        <Collapsible open={enlacesAbiertos} onOpenChange={setEnlacesAbiertos} data-tour="enlaces">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 mb-3 group">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Link2 className="h-3.5 w-3.5" />
              Tus enlaces
            </h2>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-1.5">
              {[
                { label: "Pagina publica", path: `/${slug}`, help: "Es la que ven tus clientes al buscarte" },
                { label: "Link para sacar turno", path: `/${slug}/turno`, help: "Mandaselo a un cliente para que reserve solo" },
                { label: "Panel admin", path: `/${slug}/admin/Dashboard`, help: "Acceso directo a este panel" },
                ...(puedeVenderYProductos
                  ? [{ label: "Productos", path: `/${slug}/admin/Productos`, help: "Catalogo y stock de tu comercio" }]
                  : []),
                ...(puedeVentas
                  ? [
                      { label: "Punto de venta", path: `/${slug}/admin/Vender`, help: "Mostrador para cobrar en el momento" },
                      { label: "Ventas", path: `/${slug}/admin/Ventas`, help: "Historial de remitos emitidos" },
                    ]
                  : []),
              ].map(({ label, path, help }) => (
                <div key={path} className="flex items-center gap-2" title={help}>
                  <span className="text-xs text-muted-foreground w-32 shrink-0 truncate">{label}</span>
                  <code className="flex-1 rounded bg-muted px-2.5 py-1 text-xs font-mono truncate">{BASE_URL}{path}</code>
                  <Button variant="outline" size="icon" className="h-7 w-7 shrink-0"
                    onClick={() => copyLink(path)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <a href={path} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="icon" className="h-7 w-7 shrink-0">
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Graficos */}
        <div data-tour="metricas">
          <DashboardCharts tenantId={slug} onNavigateToTurnos={() => router.push(`/${slug}/admin/Turnos`)} />
        </div>
      </div>
      <Toaster />
    </>
  )
}
