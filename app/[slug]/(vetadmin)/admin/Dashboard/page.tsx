"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSlug } from "@/context/slug-context"
import { DashboardCharts } from "@/components/admin/dashboard-charts"
import { DashboardVentas } from "@/components/admin/dashboard-ventas"
import { getTenantConfig, getTurnosDelMes } from "@/lib/supabase/queries"
import type { TenantConfig } from "@/lib/supabase/queries"
import { getPlanLimits, planAllows } from "@/lib/plans"
import { UpgradePlanButton } from "@/components/billing/upgrade-plan-button"
import { getEstadoBilling } from "@/components/billing/use-billing"
import { Ayuda } from "@/components/ui/ayuda"
import { Badge } from "@/components/ui/badge"
import { Stethoscope } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { EncabezadoPagina } from "@/components/admin/encabezado-pagina"

const planInfo: Record<string, { label: string; color: string }> = {
  basico: { label: "Básico",                 color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
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

  // Vuelta del checkout de Mercado Pago (`back_url` = Dashboard?billing=ok).
  // El webhook puede tardar: se sincroniza el estado real antes de festejar.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("billing") !== "ok") return
    router.replace(`/${slug}/admin/Dashboard`)
    getEstadoBilling(slug, true)
      .then((estado) => {
        if (estado.suscripcion?.status === "authorized") {
          toast({ title: "¡Suscripción activa!", description: "Tu veterinaria ya está en el plan Pro." })
          getTenantConfig(slug).then(setConfig)
        } else {
          toast({
            title: "Pago en proceso",
            description: "Mercado Pago todavía no confirmó el pago. Revisá el estado en Configuración → Plan.",
          })
        }
      })
      .catch(() => {
        toast({ title: "No se pudo verificar el pago", description: "Revisá Configuración → Plan.", variant: "destructive" })
      })
  }, [slug, router, toast])

  const plan = config?.plan ?? "basico"
  const pi = planInfo[plan] ?? planInfo.basico
  const maxTurnos = getPlanLimits(plan).maxTurnosMes
  // Hasta que carga la config no se sabe el plan: la sección aparece recién
  // entonces, en vez de mostrarse y desaparecer.
  const mostrarVentas = config !== null && planAllows(plan, "ventas")

  return (
    <>
      <div className="space-y-6">
        <EncabezadoPagina
          icono={Stethoscope}
          titulo={config?.nombre || slug}
          descripcion="Resumen de la actividad de tu clínica"
          acciones={
            <div className="flex items-center gap-2" data-tour="plan">
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${pi.color}`}>
                Plan {pi.label}
              </span>
              {config?.status === "pausado" && (
                <Badge variant="destructive" className="text-xs">Pausada</Badge>
              )}
            </div>
          }
        />

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
                <p className={`flex items-center gap-1.5 font-semibold ${alcanzado ? "text-red-700 dark:text-red-400" : "text-slate-700 dark:text-slate-300"}`}>
                  {alcanzado
                    ? "Límite del plan alcanzado"
                    : `Turnos este mes: ${turnosMes} / ${maxTurnos}`}
                  <Ayuda tema="dashboard.usoPlan" />
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

        {/* Graficos */}
        <div data-tour="metricas">
          <DashboardCharts tenantId={slug} onNavigateToTurnos={() => router.push(`/${slug}/admin/Turnos`)} />
        </div>

        {mostrarVentas && (
          <DashboardVentas
            tenantId={slug}
            onNavigateToVentas={() => router.push(`/${slug}/admin/Ventas`)}
            onNavigateToPos={() => router.push(`/${slug}/admin/Vender`)}
          />
        )}
      </div>
      <Toaster />
    </>
  )
}
