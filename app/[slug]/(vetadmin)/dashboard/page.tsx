"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSlug } from "@/context/slug-context"
import { DashboardCharts } from "@/components/admin/dashboard-charts"
import { getTenantConfig } from "@/lib/firebase/firestore"
import type { TenantConfig } from "@/lib/firebase/firestore"
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

  useEffect(() => {
    getTenantConfig(slug).then(setConfig)
  }, [slug])

  const origin = typeof window !== "undefined" ? window.location.origin : ""

  function copyLink(path: string) {
    navigator.clipboard.writeText(`${origin}${path}`)
    toast({ title: "Link copiado" })
  }

  const plan = config?.plan ?? "basico"
  const pi = planInfo[plan] ?? planInfo.basico

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
      desc: "Datos y enlaces de tu clinica",
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

        {/* Graficos */}
        <DashboardCharts tenantId={slug} onNavigateToTurnos={() => router.push(`/${slug}/turnoadmin`)} />
      </div>
      <Toaster />
    </>
  )
}
