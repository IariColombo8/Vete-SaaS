"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { LayoutDashboard, List, Loader2, Receipt, ShoppingBag, TrendingUp, Wallet } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { HistorialVentas } from "./ventas/historial-ventas"
import { MiniResumen } from "./ventas/mini-resumen"
import { VentasCharts } from "./ventas/ventas-charts"
import { getMetricasVentas, getVentas, type MetricasVentas } from "@/lib/supabase/ventas"
import { getTenantConfig } from "@/lib/supabase/queries"
import { formatCurrency } from "@/lib/format"
import type { EmisorRemito } from "@/lib/ventas/remito"
import type { Venta } from "@/lib/supabase/types"

interface Props {
  tenantId: string
}

type Rango = "hoy" | "7d" | "30d" | "mes"
type Vista = "historial" | "dashboard"

const RANGOS: { id: Rango; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "7d", label: "7 días" },
  { id: "30d", label: "30 días" },
  { id: "mes", label: "Este mes" },
]

/** YYYY-MM-DD en hora local: `toISOString()` corre el día en Argentina. */
function aISO(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")
  return `${fecha.getFullYear()}-${mes}-${dia}`
}

function rangoFechas(rango: Rango): { desde: string; hasta: string } {
  const hoy = new Date()
  const hasta = aISO(hoy)

  if (rango === "mes") {
    return { desde: aISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta }
  }

  const dias = rango === "hoy" ? 0 : rango === "7d" ? 6 : 29
  const desde = new Date(hoy)
  desde.setDate(desde.getDate() - dias)
  return { desde: aISO(desde), hasta }
}

/**
 * Dashboard de ventas: métricas del período e historial de remitos.
 *
 * Todo cuelga del mismo rango de fechas, así que cambiar el filtro recarga las
 * dos cosas a la vez y nunca se ve una tarjeta de "este mes" arriba de una
 * tabla de "hoy". El arqueo de caja vive en `/caja`.
 */
export function VentasManagement({ tenantId }: Props) {
  const [vista, setVista] = useState<Vista>("historial")
  const [rango, setRango] = useState<Rango>("hoy")
  const [metricas, setMetricas] = useState<MetricasVentas | null>(null)
  const [ventas, setVentas] = useState<Venta[]>([])
  const [cargando, setCargando] = useState(true)
  const [emisor, setEmisor] = useState<EmisorRemito>({ nombre: "" })

  const { desde, hasta } = useMemo(() => rangoFechas(rango), [rango])

  const cargar = useCallback(() => {
    setCargando(true)

    Promise.all([
      getMetricasVentas(tenantId, desde, hasta),
      getVentas(tenantId, { desde, hasta, porPagina: 100 }),
    ])
      .then(([m, v]) => {
        setMetricas(m)
        setVentas(v.ventas)
      })
      .catch(() => toast.error("No se pudieron cargar las ventas"))
      .finally(() => setCargando(false))
  }, [tenantId, desde, hasta])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    getTenantConfig(tenantId)
      .then((config) =>
        setEmisor({
          nombre: config?.nombre || "VetPanel",
          direccion: config?.direccion,
          telefono: config?.telefono,
          email: config?.email,
          logoUrl: config?.logo,
        }),
      )
      .catch(() => setEmisor({ nombre: "VetPanel" }))
  }, [tenantId])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-gradient-to-br from-emerald-50 via-sky-50/60 to-transparent p-4 dark:from-emerald-950/30 dark:via-sky-950/10">
        <div className="flex items-center gap-3">
          <div className="hidden rounded-xl bg-emerald-600 p-2.5 text-white shadow-sm sm:flex">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Ventas</h1>
            <p className="text-sm text-muted-foreground">
              Facturación, productos más vendidos e historial de remitos
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-0.5 rounded-lg border bg-background p-0.5 shadow-sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVista("historial")}
              className={cn(
                "gap-1.5",
                vista === "historial" && "bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white",
              )}
            >
              <List className="h-3.5 w-3.5" />
              Historial
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVista("dashboard")}
              className={cn(
                "gap-1.5",
                vista === "dashboard" && "bg-sky-600 text-white hover:bg-sky-700 hover:text-white",
              )}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </Button>
          </div>

          <div className="flex gap-1.5">
            {RANGOS.map(({ id, label }) => (
              <Button
                key={id}
                variant={rango === id ? "default" : "outline"}
                size="sm"
                onClick={() => setRango(id)}
                className={rango === id ? "bg-amber-500 text-white hover:bg-amber-600" : ""}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {vista === "dashboard" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Tarjeta
              icono={<TrendingUp className="h-4 w-4" />}
              color="emerald"
              titulo="Facturación"
              valor={metricas ? formatCurrency(metricas.facturacion) : "—"}
              cargando={cargando}
            />
            <Tarjeta
              icono={<Receipt className="h-4 w-4" />}
              color="sky"
              titulo="Ventas"
              valor={metricas ? String(metricas.cantidadVentas) : "—"}
              cargando={cargando}
            />
            <Tarjeta
              icono={<Wallet className="h-4 w-4" />}
              color="amber"
              titulo="Ticket promedio"
              valor={metricas ? formatCurrency(metricas.ticketPromedio) : "—"}
              cargando={cargando}
            />
          </div>

          {metricas && !cargando && <VentasCharts metricas={metricas} />}
        </div>
      ) : (
        // El arqueo de caja vive en su propia sección (/caja): es lo primero y
        // lo último que hace el mostrador, no algo que se busque en un dashboard.
        <Card className="overflow-hidden border-t-4 border-t-emerald-500">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-emerald-600" />
              Historial de ventas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!cargando && ventas.length > 0 && <MiniResumen ventas={ventas} />}
            <HistorialVentas
              ventas={ventas}
              emisor={emisor}
              cargando={cargando}
              onCambio={cargar}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

const COLORES_TARJETA = {
  emerald: {
    icono: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
    borde: "border-t-emerald-500",
  },
  sky: {
    icono: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400",
    borde: "border-t-sky-500",
  },
  amber: {
    icono: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    borde: "border-t-amber-500",
  },
} as const

function Tarjeta({
  icono,
  color,
  titulo,
  valor,
  cargando,
}: {
  icono: React.ReactNode
  color: keyof typeof COLORES_TARJETA
  titulo: string
  valor: string
  cargando: boolean
}) {
  return (
    <Card className={cn("border-t-4 transition-shadow hover:shadow-md", COLORES_TARJETA[color].borde)}>
      <CardContent className="flex items-start gap-3 p-4">
        <div className={cn("rounded-lg p-2", COLORES_TARJETA[color].icono)}>{icono}</div>
        <div>
          <p className="mb-1 text-sm text-muted-foreground">{titulo}</p>
          {cargando ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <p className="text-2xl font-bold tabular-nums">{valor}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
