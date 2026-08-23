"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
  Area,
  AreaChart,
  RadialBarChart,
  RadialBar as RadialBarBase,
} from "recharts";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RadialBar = RadialBarBase as any;
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { subscribeTurnos, getClientesBasic } from "@/lib/supabase/queries";
import type { Turno, Cliente } from "@/lib/supabase/queries";
import {
  Calendar,
  TrendingUp,
  CheckCircle2,
  Clock,
  Activity,
  PawPrint,
  Users,
  Heart,
  AlertCircle,
  DollarSign,
  CalendarDays,
  Sparkles,
  ExternalLink,
} from "lucide-react";

interface DashboardChartsProps {
  tenantId: string;
  onNavigateToTurnos?: (fecha?: string) => void;
}

export function DashboardCharts({ tenantId, onNavigateToTurnos }: DashboardChartsProps) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendientesDialogOpen, setPendientesDialogOpen] = useState(false);

  useEffect(() => {
    if (!tenantId) return;

    // Clientes: carga puntual (cambian poco). Turnos: suscripción real-time.
    getClientesBasic(tenantId)
      .then(setClientes)
      .catch((error) => console.error("Error cargando clientes:", error));

    const unsubscribe = subscribeTurnos(
      tenantId,
      (data) => { setTurnos(data); setLoading(false); },
      (error) => {
        console.error("Error en suscripción de turnos:", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [tenantId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="relative">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-slate-200 dark:border-slate-700 border-t-indigo-500" />
          <div className="absolute inset-0 h-16 w-16 animate-ping rounded-full border-4 border-indigo-400 opacity-20" />
        </div>
      </div>
    );
  }

  // Datos procesados
  const turnosPorDia = turnos.reduce((acc, turno) => {
    if (turno.turno?.fecha) {
      const fecha = turno.turno.fecha;
      acc[fecha] = (acc[fecha] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const turnosPorDiaData = Object.entries(turnosPorDia)
    .map(([fecha, cantidad]) => ({
      fecha: new Date(fecha + "T00:00:00").toLocaleDateString("es-AR", {
        month: "short",
        day: "numeric",
      }),
      cantidad,
      fullDate: fecha,
    }))
    .slice(-30);

  const mascotasPorTipo = turnos.reduce((acc, turno) => {
    if (turno.mascota?.tipo) {
      const tipo = turno.mascota.tipo;
      acc[tipo] = (acc[tipo] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const mascotasPorTipoData = Object.entries(mascotasPorTipo)
    .map(([tipo, cantidad]) => ({
      tipo: tipo
        .toLowerCase()
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
      cantidad,
    }))
    .sort((a, b) => b.cantidad - a.cantidad); // Ordenar por cantidad descendente

  const estadosTurnos = {
    pendiente: turnos.filter((t) => t.estado === "pendiente").length,
    completado: turnos.filter((t) => t.estado === "completado").length,
    cancelado: turnos.filter((t) => t.estado === "cancelado").length,
  };

  // Nuevas métricas
  const mascotasUnicas = new Set(
    turnos.filter((t) => t.mascota?.nombre).map((t) => t.mascota.nombre)
  ).size;
  const totalClientes = clientes?.length || 0; // Total de clientes en Firestore

  // Turnos pendientes para el modal
  const turnosPendientes = (turnos || [])
    .filter((t) => t?.estado === "pendiente")
    .sort((a, b) => {
      const fechaA = a?.turno?.fecha || "";
      const fechaB = b?.turno?.fecha || "";
      if (fechaA !== fechaB) return fechaA.localeCompare(fechaB);
      return (a?.turno?.hora || "").localeCompare(b?.turno?.hora || "");
    });

  // Turnos por mes
  const turnosPorMes = turnos.reduce((acc, turno) => {
    if (turno.turno?.fecha) {
      const mes = new Date(turno.turno.fecha + "T00:00:00").toLocaleDateString(
        "es-AR",
        { month: "short" }
      );
      acc[mes] = (acc[mes] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const turnosPorMesData = Object.entries(turnosPorMes)
    .map(([mes, cantidad]) => ({
      mes: mes.charAt(0).toUpperCase() + mes.slice(1),
      cantidad,
    }))
    .slice(-6);

  // Horarios más populares - Generar todas las horas del horario de atención (08:00 a 20:00)
  const horasDisponibles = Array.from({ length: 13 }, (_, i) => {
    const hora = 8 + i;
    return `${hora.toString().padStart(2, "0")}:00`;
  });

  const turnosPorHorario = turnos.reduce((acc, turno) => {
    if (turno.turno?.hora) {
      const hora = turno.turno.hora.split(":")[0] + ":00";
      acc[hora] = (acc[hora] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  // Crear array completo con todas las horas, incluso si no tienen turnos
  const turnosPorHorarioData = horasDisponibles.map((hora) => ({
    hora,
    cantidad: turnosPorHorario[hora] || 0,
  }));

  const estadosTurnosData = [
    {
      estado: "Completados",
      cantidad: estadosTurnos.completado,
      fill: "#10b981",
    },
    {
      estado: "Pendientes",
      cantidad: estadosTurnos.pendiente,
      fill: "#f59e0b",
    },
    {
      estado: "Cancelados",
      cantidad: estadosTurnos.cancelado,
      fill: "#6366f1",
    },
  ];

  // Radial chart data
  const radialData = [
    { name: "Completados", value: estadosTurnos.completado, fill: "#10b981" },
    { name: "Pendientes", value: estadosTurnos.pendiente, fill: "#f59e0b" },
    { name: "Cancelados", value: estadosTurnos.cancelado, fill: "#6366f1" },
  ];

  const PIE_COLORS = [
    "#8884d8",
    "#82ca9d",
    "#ffc658",
    "#ff8042",
    "#8dd1e1",
    "#d084d0",
    "#ffb347",
  ];

  const totalTurnos = turnos.length;
  const tasaCompletado =
    totalTurnos > 0
      ? ((estadosTurnos.completado / totalTurnos) * 100).toFixed(1)
      : 0;
  const tasaCancelacion =
    totalTurnos > 0
      ? ((estadosTurnos.cancelado / totalTurnos) * 100).toFixed(1)
      : 0;
  const promedioTurnosDia = (
    totalTurnos / Object.keys(turnosPorDia).length || 0
  ).toFixed(1);

  // Servicios más solicitados (top 6)
  const turnosPorServicio = turnos.reduce((acc, turno) => {
    const servicio = (turno.servicio || "").trim();
    if (servicio) acc[servicio] = (acc[servicio] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const serviciosTopData = Object.entries(turnosPorServicio)
    .map(([servicio, cantidad]) => ({
      servicio: servicio.charAt(0).toUpperCase() + servicio.slice(1),
      cantidad,
    }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 6);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border border-slate-200 dark:border-slate-600 rounded-2xl shadow-2xl p-4">
          <p className="text-sm font-bold text-slate-900 dark:text-white mb-1">
            {label}
          </p>
          {payload.map((entry: any, index: number) => (
            <p
              key={index}
              className="text-xs text-slate-600 dark:text-slate-300"
            >
              {entry.name}:{" "}
              <span className="font-bold" style={{ color: entry.color }}>
                {entry.value}
              </span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-2 sm:p-3 lg:p-6">
      {/* Header con glassmorphism */}
      <div className="mb-2 sm:mb-4 lg:mb-6 relative">
        <div className="absolute inset-0 bg-slate-200/50 dark:bg-slate-800/50 blur-3xl" />
        <div className="relative backdrop-blur-xl bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl lg:rounded-2xl p-2 sm:p-3 lg:p-6 shadow-2xl">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 lg:p-3 rounded-lg sm:rounded-xl bg-slate-700 dark:bg-slate-600 shadow-xl">
              <Sparkles
                className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 text-white"
                strokeWidth={2}
              />
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-sm sm:text-xl lg:text-3xl font-black text-slate-900 dark:text-slate-100 truncate">
                Dashboard Veterinario
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm sm:text-base">
                Panel de análisis y métricas en tiempo real
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Premium */}
      <div className="grid gap-4 sm:gap-5 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 mb-8">
        {/* Total Turnos */}
        <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-white/90 to-white/70 dark:from-slate-900/90 dark:to-slate-900/70 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg">
                <Calendar className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <div className="px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/50">
                <TrendingUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900 dark:text-white mb-1">
              {totalTurnos}
            </div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Total Turnos
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-500 mt-1">
              Todos los registros
            </p>
          </CardContent>
        </Card>

        {/* Pendientes */}
        <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-white/90 to-white/70 dark:from-slate-900/90 dark:to-slate-900/70 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 shadow-lg">
                <Clock className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <div className="px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/50">
                <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900 dark:text-white mb-1">
              {estadosTurnos.pendiente}
            </div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Pendientes
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-500 mt-1">
              Por atender
            </p>
            {estadosTurnos.pendiente > 0 && turnosPendientes && turnosPendientes.length > 0 && (
              <>
                <button
                  className="mt-2 text-[10px] text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 underline font-medium"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendientesDialogOpen(true);
                  }}
                >
                  Ver detalles
                </button>
                <Dialog open={pendientesDialogOpen} onOpenChange={setPendientesDialogOpen}>
                  <DialogContent className="sm:max-w-2xl border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl">
                    <DialogHeader>
                      <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                        Turnos pendientes
                      </DialogTitle>
                      <DialogDescription className="text-xs text-slate-600 dark:text-slate-400">
                        {turnosPendientes?.length || 0} pendientes ordenados por fecha
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                      {!turnosPendientes || turnosPendientes.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-6">
                          No hay turnos pendientes
                        </p>
                      ) : (
                        turnosPendientes.map((turno) => {
                          const fechaStr = turno.turno?.fecha || "";
                          const horaStr = turno.turno?.hora || "";
                          const fecha = fechaStr
                            ? new Date(fechaStr + "T00:00:00").toLocaleDateString("es-AR", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "—";
                          return (
                            <div
                              key={turno.id}
                              className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                  {turno.mascota?.nombre || "Sin nombre"} · {turno.cliente?.nombre || "Cliente"}
                                </p>
                                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                                  {fecha} {horaStr && `· ${horaStr}`}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2 text-xs shrink-0"
                                onClick={() => {
                                  if (onNavigateToTurnos) {
                                    onNavigateToTurnos(turno.turno?.fecha);
                                  }
                                  setPendientesDialogOpen(false);
                                }}
                              >
                                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                Ver detalles
                              </Button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </CardContent>
        </Card>

        {/* Completados */}
        <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-white/90 to-white/70 dark:from-slate-900/90 dark:to-slate-900/70 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg">
                <CheckCircle2
                  className="h-5 w-5 text-white"
                  strokeWidth={2.5}
                />
              </div>
              <div className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/50">
                <Heart className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900 dark:text-white mb-1">
              {estadosTurnos.completado}
            </div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Completados
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-500 mt-1">
              Exitosamente
            </p>
          </CardContent>
        </Card>

        {/* Tasa de Éxito */}
        <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-white/90 to-white/70 dark:from-slate-900/90 dark:to-slate-900/70 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 shadow-lg">
                <TrendingUp className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <div className="px-2.5 py-1 rounded-full bg-violet-100 dark:bg-violet-900/50">
                <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900 dark:text-white mb-1">
              {tasaCompletado}%
            </div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Tasa de Éxito
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-500 mt-1">
              Completados
            </p>
          </CardContent>
        </Card>

        {/* Mascotas Únicas */}
        <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-white/90 to-white/70 dark:from-slate-900/90 dark:to-slate-900/70 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105">
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-rose-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="p-3 rounded-xl bg-gradient-to-br from-pink-500 to-pink-600 shadow-lg">
                <PawPrint className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <div className="px-2.5 py-1 rounded-full bg-pink-100 dark:bg-pink-900/50">
                <Heart className="h-3.5 w-3.5 text-pink-600 dark:text-pink-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900 dark:text-white mb-1">
              {mascotasUnicas}
            </div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Mascotas
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-500 mt-1">
              Únicas registradas
            </p>
          </CardContent>
        </Card>

        {/* Clientes Únicos */}
        <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-white/90 to-white/70 dark:from-slate-900/90 dark:to-slate-900/70 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg">
                <Users className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <div className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/50">
                <Activity className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900 dark:text-white mb-1">
              {totalClientes}
            </div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Clientes
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-500 mt-1">
              Activos totales
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid Principal */}
      <div className="grid gap-6 lg:grid-cols-12 mb-6">
        {/* Turnos por Día - Línea suave */}
        <Card className="lg:col-span-8 border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl hover:shadow-3xl transition-all duration-500">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
                  <Activity className="h-5 w-5 text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold text-slate-900 dark:text-white">
                    Evolución de Turnos
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-600 dark:text-slate-400">
                    Últimos 30 días con actividad
                  </CardDescription>
                </div>
              </div>
              <div className="px-3 py-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold">
                {promedioTurnosDia} turnos/día
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart
                data={turnosPorDiaData}
                margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="colorCantidad"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  strokeOpacity={0.3}
                  vertical={false}
                />
                <XAxis
                  dataKey="fecha"
                  tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                  axisLine={{ stroke: "#cbd5e1", strokeWidth: 1 }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                  axisLine={{ stroke: "#cbd5e1", strokeWidth: 1 }}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="cantidad"
                  stroke="#6366f1"
                  strokeWidth={3}
                  fill="url(#colorCantidad)"
                  dot={{
                    fill: "#6366f1",
                    strokeWidth: 2,
                    r: 4,
                    stroke: "#fff",
                  }}
                  activeDot={{
                    r: 7,
                    fill: "#6366f1",
                    stroke: "#fff",
                    strokeWidth: 3,
                    filter: "drop-shadow(0 2px 4px rgba(99, 102, 241, 0.4))",
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Estado de Turnos - Radial */}
        <Card className="lg:col-span-4 border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl hover:shadow-3xl transition-all duration-500">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
                <CheckCircle2
                  className="h-5 w-5 text-white"
                  strokeWidth={2.5}
                />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-slate-900 dark:text-white">
                  Estados
                </CardTitle>
                <CardDescription className="text-xs text-slate-600 dark:text-slate-400">
                  Distribución actual
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height={240}>
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="30%"
                outerRadius="100%"
                data={radialData}
                startAngle={90}
                endAngle={-270}
              >
                <RadialBar
                  minAngle={15}
                  background={{ fill: "#f1f5f9" }}
                  clockWise
                  dataKey="value"
                  cornerRadius={10}
                />
                <Tooltip content={<CustomTooltip />} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-3 mt-4 w-full">
              <div className="text-center p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                  {estadosTurnos.completado}
                </div>
                <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                  Completados
                </div>
              </div>
              <div className="text-center p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                <div className="text-xl font-black text-amber-600 dark:text-amber-400">
                  {estadosTurnos.pendiente}
                </div>
                <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                  Pendientes
                </div>
              </div>
              <div className="text-center p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
                <div className="text-xl font-black text-indigo-600 dark:text-indigo-400">
                  {estadosTurnos.cancelado}
                </div>
                <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                  Cancelados
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Segunda fila de gráficos */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Tipos de Mascotas - Donut mejorado */}
        <Card className="lg:col-span-4 border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl hover:shadow-3xl transition-all duration-500">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 shadow-lg">
                <PawPrint className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-slate-900 dark:text-white">
                  Tipos de Mascotas
                </CardTitle>
                <CardDescription className="text-xs text-slate-600 dark:text-slate-400">
                  Por especie
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col justify-center">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={mascotasPorTipoData}
                  dataKey="cantidad"
                  nameKey="tipo"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  innerRadius={60}
                  paddingAngle={5}
                  minAngle={15}
                >
                  {mascotasPorTipoData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                      stroke="none"
                      style={{
                        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))",
                      }}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  layout="vertical"
                  verticalAlign="middle"
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ fontSize: "13px", fontWeight: 600 }}
                  formatter={(value: string, entry: any) => {
                    const data = mascotasPorTipoData.find((d) => d.tipo === value);
                    const total = mascotasPorTipoData.reduce(
                      (sum, d) => sum + d.cantidad,
                      0
                    );
                    const percent =
                      data && total > 0
                        ? ((data.cantidad / total) * 100).toFixed(0)
                        : "0";
                    return `${value}: ${percent}%`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Turnos por Mes - Barras */}
        <Card className="lg:col-span-4 border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl hover:shadow-3xl transition-all duration-500">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg">
                <CalendarDays
                  className="h-5 w-5 text-white"
                  strokeWidth={2.5}
                />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-slate-900 dark:text-white">
                  Por Mes
                </CardTitle>
                <CardDescription className="text-xs text-slate-600 dark:text-slate-400">
                  Últimos 6 meses
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={turnosPorMesData}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  strokeOpacity={0.3}
                  vertical={false}
                />
                <XAxis
                  dataKey="mes"
                  tick={{ fontSize: 11, fill: "#64748b", fontWeight: 700 }}
                  axisLine={{ stroke: "#cbd5e1" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                  axisLine={{ stroke: "#cbd5e1" }}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="cantidad"
                  fill="url(#barGradient)"
                  radius={[10, 10, 0, 0]}
                  barSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Horarios Populares */}
        <Card className="lg:col-span-4 border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl hover:shadow-3xl transition-all duration-500">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg">
                <Clock className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-slate-900 dark:text-white">
                  Horarios Populares
                </CardTitle>
                <CardDescription className="text-xs text-slate-600 dark:text-slate-400">
                  Distribución horaria
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart
                data={turnosPorHorarioData}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="horarioGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                    <stop offset="50%" stopColor="#38bdf8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#7dd3fc" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  strokeOpacity={0.3}
                  vertical={false}
                />
                <XAxis
                  dataKey="hora"
                  tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }}
                  axisLine={{ stroke: "#cbd5e1" }}
                  tickLine={false}
                  interval={1}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                  axisLine={{ stroke: "#cbd5e1" }}
                  tickLine={false}
                  domain={[0, "dataMax + 1"]}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="cantidad"
                  stroke="#0ea5e9"
                  strokeWidth={3}
                  fill="url(#horarioGradient)"
                  dot={{
                    fill: "#0ea5e9",
                    strokeWidth: 2,
                    r: 4,
                    stroke: "#fff",
                  }}
                  activeDot={{
                    r: 6,
                    fill: "#0ea5e9",
                    stroke: "#fff",
                    strokeWidth: 2,
                    filter: "drop-shadow(0 2px 4px rgba(14, 165, 233, 0.4))",
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tercera fila: servicios top + métricas clave */}
      <div className="grid gap-6 lg:grid-cols-12 mt-6">
        {/* Servicios más solicitados */}
        <Card className="lg:col-span-8 border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg">
                <Sparkles className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-slate-900 dark:text-white">
                  Servicios más solicitados
                </CardTitle>
                <CardDescription className="text-xs text-slate-600 dark:text-slate-400">
                  Top servicios por cantidad de turnos
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {serviciosTopData.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-12">
                Sin datos de servicios todavía.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={serviciosTopData}
                  layout="vertical"
                  margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.3} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }} axisLine={{ stroke: "#cbd5e1" }} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="servicio" width={110} tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="cantidad" fill="#f59e0b" radius={[0, 8, 8, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Métricas clave */}
        <Card className="lg:col-span-4 border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg">
                <TrendingUp className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-slate-900 dark:text-white">
                  Métricas clave
                </CardTitle>
                <CardDescription className="text-xs text-slate-600 dark:text-slate-400">
                  Tasas sobre el total de turnos
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Tasa de éxito</span>
              </div>
              <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{tasaCompletado}%</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Tasa de cancelación</span>
              </div>
              <span className="text-xl font-black text-rose-600 dark:text-rose-400">{tasaCancelacion}%</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Promedio diario</span>
              </div>
              <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">{promedioTurnosDia}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
