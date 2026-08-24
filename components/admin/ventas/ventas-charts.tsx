"use client"

import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { usePaletaGraficos } from "./paleta"
import { formatCantidad, formatCurrency, formatFechaISO } from "@/lib/format"
import { MEDIOS_PAGO, type MedioPago } from "@/lib/supabase/types"
import type { MetricasVentas } from "@/lib/supabase/ventas"

interface Props {
  metricas: MetricasVentas
}

export function VentasCharts({ metricas }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <SerieDiaria metricas={metricas} />
      <div className="grid gap-4">
        <ComposicionMedioPago metricas={metricas} />
        <TopProductos metricas={metricas} />
      </div>
    </div>
  )
}

/** Facturación por día. Una sola serie, así que no lleva leyenda: el título la nombra. */
function SerieDiaria({ metricas }: Props) {
  const paleta = usePaletaGraficos()

  const datos = metricas.porDia.map((d) => ({
    ...d,
    // Etiqueta corta: con "23/08" alcanza y entran muchos más días en el eje.
    etiqueta: formatFechaISO(d.fecha).slice(0, 5),
  }))

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Facturación por día</CardTitle>
        <CardDescription>Solo ventas completadas</CardDescription>
      </CardHeader>
      <CardContent>
        {datos.length === 0 ? (
          <VacioGrafico />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="gradVentas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={paleta.serie} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={paleta.serie} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              {/* Solo líneas horizontales: las verticales compiten con el área. */}
              <CartesianGrid stroke={paleta.grilla} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="etiqueta"
                stroke={paleta.eje}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={16}
              />
              <YAxis
                stroke={paleta.eje}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={(v: number) => formatCurrency(v)}
              />
              <Tooltip
                cursor={{ stroke: paleta.eje, strokeWidth: 1 }}
                content={<TooltipDia />}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke={paleta.serie}
                strokeWidth={2}
                fill="url(#gradVentas)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Composición por medio de pago.
 *
 * Barras horizontales con etiqueta y monto siempre visibles, no una torta: con
 * cuatro categorías la torta obliga a comparar ángulos, y las etiquetas directas
 * hacen que el color deje de ser el único portador de la identidad.
 */
function ComposicionMedioPago({ metricas }: Props) {
  const paleta = usePaletaGraficos()
  const maximo = Math.max(...metricas.porMedioPago.map((m) => m.total), 1)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Cómo pagaron</CardTitle>
        <CardDescription>Participación sobre el total facturado</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {metricas.porMedioPago.length === 0 ? (
          <VacioGrafico />
        ) : (
          metricas.porMedioPago.map(({ medio, total }) => (
            <div key={medio}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: paleta.medios[medio] }}
                    aria-hidden
                  />
                  {etiquetaMedio(medio)}
                </span>
                <span className="tabular-nums font-medium">{formatCurrency(total)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max((total / maximo) * 100, 2)}%`,
                    backgroundColor: paleta.medios[medio],
                  }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function TopProductos({ metricas }: Props) {
  const maximo = Math.max(...metricas.topProductos.map((p) => p.total), 1)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Lo que más se vendió</CardTitle>
        <CardDescription>Por facturación en el período</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {metricas.topProductos.length === 0 ? (
          <VacioGrafico />
        ) : (
          metricas.topProductos.map((p) => (
            <div key={p.nombre}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{p.nombre}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatCantidad(p.cantidad)} · {formatCurrency(p.total)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.max((p.total / maximo) * 100, 2)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

/** Punto de la serie diaria, tal como lo arma `SerieDiaria`. */
interface PuntoDia {
  fecha: string
  total: number
  ventas: number
}

/**
 * Tooltip propio en vez de los `formatter` de recharts: los tipos genéricos de
 * la librería no dejan leer el payload completo sin pelearse con el compilador,
 * y acá hacen falta dos datos del mismo punto (importe y cantidad de ventas).
 */
function TooltipDia({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: PuntoDia }[]
}) {
  const punto = payload?.[0]?.payload
  if (!active || !punto) return null

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-0.5 font-medium">{formatFechaISO(punto.fecha)}</p>
      <p className="tabular-nums">{formatCurrency(punto.total)}</p>
      <p className="text-muted-foreground">
        {punto.ventas} {punto.ventas === 1 ? "venta" : "ventas"}
      </p>
    </div>
  )
}

function etiquetaMedio(medio: MedioPago): string {
  return MEDIOS_PAGO.find((m) => m.id === medio)?.label ?? medio
}

function VacioGrafico() {
  return (
    <div className="py-10 text-center text-sm text-muted-foreground">
      No hay ventas en este período
    </div>
  )
}
