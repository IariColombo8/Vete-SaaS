"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePaletaGraficos } from "@/components/admin/ventas/paleta";
import { getMetricasVentas, type MetricasVentas } from "@/lib/supabase/ventas";
import {
  claveDia,
  inicioVentana,
  primerDiaDelMes,
  resumenVentas,
  serieVentasUltimosDias,
  type PuntoVentas,
} from "@/lib/dashboard/metricas";
import { formatCantidad, formatCurrency, formatFechaISO } from "@/lib/format";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Receipt,
  ShoppingCart,
  Store,
  Trophy,
} from "lucide-react";

interface DashboardVentasProps {
  tenantId: string;
  onNavigateToVentas: () => void;
  onNavigateToPos: () => void;
}

const DIAS = 30;

/**
 * Sección de ventas del Dashboard: cuánto se vendió hoy, en el mes y en los
 * últimos 30 días, con el detalle día por día y lo que más se vendió. Las
 * métricas vienen de `getMetricasVentas` (solo ventas completadas); el corte
 * por hoy/mes/30 días se hace acá con `resumenVentas`.
 */
export function DashboardVentas({ tenantId, onNavigateToVentas, onNavigateToPos }: DashboardVentasProps) {
  const [metricas, setMetricas] = useState<MetricasVentas | null>(null);
  const [cargando, setCargando] = useState(true);
  const paleta = usePaletaGraficos();

  useEffect(() => {
    if (!tenantId) return;
    let activo = true;
    const hoy = new Date();
    // La ventana arranca en el día más lejano entre "hace 30 días" y el 1 del
    // mes, así una sola consulta alcanza para los tres cortes.
    const desde = [inicioVentana(DIAS, hoy), primerDiaDelMes(hoy)].sort()[0];
    getMetricasVentas(tenantId, desde, claveDia(hoy))
      .then((m) => { if (activo) setMetricas(m); })
      .catch((error) => console.error("Error cargando ventas del dashboard:", error))
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [tenantId]);

  if (cargando) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Cargando ventas">
        <Skeleton className="h-7 w-40" />
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[96px] rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-12">
          <Skeleton className="h-[300px] rounded-xl lg:col-span-8" />
          <Skeleton className="h-[300px] rounded-xl lg:col-span-4" />
        </div>
      </div>
    );
  }

  const hoy = new Date();
  const porDia = metricas?.porDia ?? [];
  const resumen = resumenVentas(porDia, hoy);
  const serie = serieVentasUltimosDias(porDia, DIAS, hoy);
  const claveHoy = claveDia(hoy);
  const topProductos = (metricas?.topProductos ?? []).slice(0, 5);
  const sinVentas = resumen.ultimos30.ventas === 0 && resumen.mes.ventas === 0;

  return (
    <section className="space-y-4" aria-label="Ventas">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Ventas</h2>
          <span className="text-xs text-muted-foreground">Solo ventas completadas</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onNavigateToVentas} className="gap-1">
          Ver todas <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiVenta
          icono={ShoppingCart}
          titulo="Hoy"
          valor={formatCurrency(resumen.hoy.total)}
          detalle={pluralVentas(resumen.hoy.ventas)}
        />
        <KpiVenta
          icono={CalendarDays}
          titulo="Este mes"
          valor={formatCurrency(resumen.mes.total)}
          detalle={pluralVentas(resumen.mes.ventas)}
        />
        <KpiVenta
          icono={Receipt}
          titulo="Ticket promedio"
          valor={formatCurrency(resumen.mes.ticketPromedio)}
          detalle="Por venta, este mes"
        />
        <KpiVenta
          icono={Trophy}
          titulo="Mejor día del mes"
          valor={resumen.mejorDiaMes ? formatCurrency(resumen.mejorDiaMes.total) : "—"}
          detalle={resumen.mejorDiaMes ? formatFechaISO(resumen.mejorDiaMes.fecha) : "Sin ventas todavía"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary shadow-sm">
                  <BarChart3 className="h-5 w-5 text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold text-foreground">Cuándo vendiste</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Facturación por día, últimos {DIAS} días
                  </CardDescription>
                </div>
              </div>
              <div className="px-3 py-1.5 rounded-full bg-accent text-primary text-xs font-bold whitespace-nowrap">
                {formatCurrency(resumen.ultimos30.total)} · {pluralVentas(resumen.ultimos30.ventas)}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {sinVentas ? (
              <VacioVentas onNavigateToPos={onNavigateToPos} />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={serie} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={paleta.grilla} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="etiqueta"
                    tick={{ fontSize: 11, fill: paleta.eje, fontWeight: 600 }}
                    axisLine={{ stroke: paleta.grilla }}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: paleta.eje, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                    tickFormatter={abreviarMonto}
                  />
                  <Tooltip content={<TooltipVentasDia />} cursor={{ fill: paleta.grilla, fillOpacity: 0.4 }} />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={28}>
                    {serie.map((p) => (
                      <Cell
                        key={p.clave}
                        fill={paleta.serie}
                        fillOpacity={p.clave === claveHoy ? 1 : 0.75}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary shadow-sm">
                <Trophy className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-foreground">Lo más vendido</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Por facturación, últimos {DIAS} días
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {topProductos.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Sin productos vendidos todavía.</p>
            ) : (
              <TopProductos productos={topProductos} />
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function KpiVenta({
  icono: Icono,
  titulo,
  valor,
  detalle,
}: {
  icono: typeof ShoppingCart;
  titulo: string;
  valor: string;
  detalle: string;
}) {
  return (
    <Card className="gap-1 py-3">
      <CardContent className="px-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Icono className="h-3.5 w-3.5" />
          {titulo}
        </div>
        <div className="mt-1 text-xl font-black text-foreground leading-tight tabular-nums truncate" title={valor}>
          {valor}
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">{detalle}</p>
      </CardContent>
    </Card>
  );
}

function TopProductos({ productos }: { productos: MetricasVentas["topProductos"] }) {
  const maximo = Math.max(...productos.map((p) => p.total), 1);
  return (
    <>
      {productos.map((p, i) => (
        <div key={p.nombre}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              <span className="mr-1.5 text-xs font-bold text-muted-foreground">{i + 1}.</span>
              {p.nombre}
            </span>
            <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
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
      ))}
    </>
  );
}

/** Tooltip propio: hacen falta dos datos del mismo punto (importe y cantidad). */
function TooltipVentasDia({ active, payload }: { active?: boolean; payload?: { payload: PuntoVentas }[] }) {
  const punto = payload?.[0]?.payload;
  if (!active || !punto) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-0.5 font-semibold text-popover-foreground">{formatFechaISO(punto.clave)}</p>
      <p className="tabular-nums font-bold text-popover-foreground">{formatCurrency(punto.total)}</p>
      <p className="text-muted-foreground">{pluralVentas(punto.ventas)}</p>
    </div>
  );
}

function VacioVentas({ onNavigateToPos }: { onNavigateToPos: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <p className="text-sm text-muted-foreground">Todavía no hay ventas en los últimos {DIAS} días.</p>
      <Button size="sm" onClick={onNavigateToPos} className="gap-1">
        <ShoppingCart className="h-4 w-4" /> Ir al mostrador
      </Button>
    </div>
  );
}

function pluralVentas(n: number): string {
  return `${formatCantidad(n)} ${n === 1 ? "venta" : "ventas"}`;
}

/** "$1.2M" / "$350k" para el eje: con el monto completo el eje se come el gráfico. */
function abreviarMonto(valor: number): string {
  if (valor >= 1_000_000) return `$${(valor / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (valor >= 1_000) return `$${Math.round(valor / 1_000)}k`;
  return `$${valor}`;
}
