"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSlug } from "@/context/slug-context"
import { DashboardCharts } from "@/components/admin/dashboard-charts"
import { getTenantConfig, getTurnosDelMes } from "@/lib/firebase/firestore"
import type { TenantConfig } from "@/lib/firebase/firestore"
import { getPlanLimits } from "@/lib/plans"
import { UpgradePlanButton } from "@/components/billing/upgrade-plan-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
      href: `/${slug}/turnoadmin`,
      label: "Administrar turnos",
      desc: "Gestiona y aprueba turnos",
      icon: Calendar,
      color: "bg-indigo-50 dark:bg-indigo-900/20",
      iconColor: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400",
      external: false,
    },
    {
      href: `/${slug}/libretasanitaria`,
      label: "Libreta sanitaria",
      desc: "Historial clinico de mascotas",
      icon: FileText,
      color: "bg-amber-50 dark:bg-amber-900/20",
      iconColor: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
      external: false,
    },
    {
      href: `/${slug}/clientes`,
      label: "Clientes",
      desc: "Duenos y mascotas registrados",
      icon: Users,
      color: "bg-pink-50 dark:bg-pink-900/20",
      iconColor: "bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-400",
      external: false,
    },
    {
      href: `/${slug}/configuracion`,
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
          <div className="flex items-center gap-2">
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
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Accesos rapidos
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sections.map(({ href, label, desc, icon: Icon, color, iconColor, external }) => (
              <Card
                key={href}
                className={`border hover:border-emerald-400/50 hover:shadow-md transition-all cursor-pointer ${color}`}
                onClick={() => external ? window.open(href, "_blank") : router.push(href)}
              >
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${iconColor}`}>
                      <Icon className="h-4 w-4" />
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
                        className="h-7 w-7"
                        onClick={e => { e.stopPropagation(); copyLink(href) }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={e => {
                        e.stopPropagation()
                        external ? window.open(href, "_blank") : router.push(href)
                      }}
                    >
                      {external
                        ? <ExternalLink className="h-3.5 w-3.5" />
                        : <LayoutDashboard className="h-3.5 w-3.5" />
                      }
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Tus enlaces */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <Link2 className="h-3.5 w-3.5" />
            Tus enlaces
          </h2>
          <div className="space-y-2">
            {[
              { label: "Pagina publica", path: `/${slug}` },
              { label: "Link para sacar turno", path: `/${slug}/turno` },
              { label: "Panel admin", path: `/${slug}/admin` },
            ].map(({ label, path }) => (
              <div key={path} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-36 shrink-0">{label}</span>
                <code className="flex-1 rounded bg-muted px-3 py-1.5 text-sm font-mono truncate">{BASE_URL}{path}</code>
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
                  onClick={() => copyLink(path)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <a href={path} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Graficos */}
        <DashboardCharts tenantId={slug} onNavigateToTurnos={() => router.push(`/${slug}/turnoadmin`)} />
      </div>
      <Toaster />
    </>
  )
}
