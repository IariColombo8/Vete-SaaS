// Guardar como: components/admin/turnos-management.tsx

"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarIcon, Loader2, Download } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { createHistoria, updateTurno } from "@/lib/supabase/queries";
import type { Turno } from "@/lib/supabase/queries";
import { descargarTurnosCSV } from "@/lib/export/turnos-csv";

import { useTurnosManagement } from "@/hooks/turnos/useTurnosManagement";
import { CalendarView } from "./calendar-view";
import { TimelineView } from "./timeline-view";
import { GridView } from "./grid-view";
import { TurnoDetailsModal } from "./TurnoDetailsModal";
import { EditTurnoModal } from "./EditTurnoModal";
import { BlockDateModal } from "./BlockDateModal";
import { StatsCard } from "./StatsCard";
import { NextAppointmentCard } from "./NextAppointmentCard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TurnosManagementProps {
  tenantId: string;
  targetDate?: string;
}

export default function TurnosManagement({ tenantId, targetDate }: TurnosManagementProps) {
  const {
    turnos,
    loading,
    selectedTurno,
    setSelectedTurno,
    mascotaDetails,
    setMascotaDetails,
    loadingMascota,
    blockedDates,
    selectedDate,
    setSelectedDate,
    fetchMascotaDetails,
    handleToggleBlockDate,
    handleToggleSingleDate,
    handleToggleDateRange,
    handleConfirm,
    handleMarkCompleted,
    handleCancel,
    handleDelete,
    handleSaveEdit,
    fetchTurnos,
  } = useTurnosManagement(tenantId);

  const { toast } = useToast();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [blockDateDialogOpen, setBlockDateDialogOpen] = useState(false);
  const [editData, setEditData] = useState({ fecha: "", hora: "" });
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [singleDateBlock, setSingleDateBlock] = useState<string>("");
  const [dateRangeStart, setDateRangeStart] = useState<string>("");
  const [dateRangeEnd, setDateRangeEnd] = useState<string>("");
  const [viewMode, setViewMode] = useState<"timeline" | "grid">("timeline");
  const [timelineMode, setTimelineMode] = useState<"date" | "full">("date");
  const [gridMode, setGridMode] = useState<"date" | "full">("date");
  const [pendientesDialogOpen, setPendientesDialogOpen] = useState(false);

  const [generateHistoriaTurno, setGenerateHistoriaTurno] = useState<Turno | null>(null);
  const [formNotaRapida, setFormNotaRapida] = useState({
    diagnostico: "",
    tratamiento: "",
    pesoActual: "",
    temperatura: "",
    observaciones: "",
  });
  const [savingNota, setSavingNota] = useState(false);

  useEffect(() => {
    if (!targetDate) return;
    setSelectedDate(targetDate);
    setCurrentMonth(new Date(targetDate + "T00:00:00"));
  }, [targetDate, setSelectedDate]);

  const turnosPendientes = (turnos || [])
    .filter((t) => t?.estado === "pendiente")
    .sort((a, b) => {
      const fechaA = a?.turno?.fecha || "";
      const fechaB = b?.turno?.fecha || "";
      if (fechaA !== fechaB) return fechaA.localeCompare(fechaB);
      return (a?.turno?.hora || "").localeCompare(b?.turno?.hora || "");
    });

  useEffect(() => {
    if (generateHistoriaTurno) {
      const motivo = generateHistoriaTurno.mascota?.motivo ?? "Consulta";
      setFormNotaRapida((f) => ({ ...f, diagnostico: motivo, tratamiento: "", pesoActual: "", temperatura: "", observaciones: "" }));
    }
  }, [generateHistoriaTurno]);

  const handleViewDetails = (turno: Turno) => {
    setSelectedTurno(turno);
    if (turno.mascotaId && turno.clienteId) {
      fetchMascotaDetails(turno.clienteId, turno.mascotaId);
    }
    setDetailsDialogOpen(true);
  };

  const handleEdit = (turno: Turno) => {
    setSelectedTurno(turno);
    setEditData({
      fecha: turno.turno.fecha,
      hora: turno.turno.hora,
    });
    setEditDialogOpen(true);
    setDetailsDialogOpen(false);
  };

  const closeDetailsModal = () => {
    setDetailsDialogOpen(false);
    setSelectedTurno(null);
    setMascotaDetails(null);
  };

  const handleGenerateHistoria = (turno: Turno) => {
    setGenerateHistoriaTurno(turno);
    setDetailsDialogOpen(false);
  };

  const saveNotaRapida = async () => {
    const t = generateHistoriaTurno;
    if (!t?.id || !t.clienteId || !t.mascotaId) return;
    const diag = String(formNotaRapida.diagnostico ?? "").trim();
    if (!diag) {
      toast({ title: "Campo obligatorio", description: "Completá el Diagnóstico.", variant: "destructive" });
      return;
    }
    const fecha = t.turno?.fecha ?? new Date().toISOString().slice(0, 10);
    const partesObs: string[] = [];
    if (formNotaRapida.pesoActual?.trim()) partesObs.push(`Peso actual: ${formNotaRapida.pesoActual.trim()}`);
    if (formNotaRapida.temperatura?.trim()) partesObs.push(`Temperatura: ${formNotaRapida.temperatura.trim()} °C`);
    if (formNotaRapida.observaciones?.trim()) partesObs.push(`Observaciones: ${formNotaRapida.observaciones.trim()}`);
    const observacionesFinal = partesObs.length ? partesObs.join("\n") : "";
    setSavingNota(true);
    try {
      await createHistoria(tenantId, t.clienteId, t.mascotaId, {
        fechaAtencion: fecha,
        motivo: t.mascota?.motivo ?? "Consulta",
        diagnostico: diag,
        tratamiento: formNotaRapida.tratamiento?.trim() || "—",
        observaciones: observacionesFinal,
        proximaVisita: "",
      });
      await updateTurno(tenantId, t.id, { estado: "completado" });
      await fetchTurnos();
      toast({ title: "Nota clínica guardada", description: "El turno se marcó como completado." });
      setGenerateHistoriaTurno(null);
    } catch (e) {
      console.error(e);
      toast({ title: "Error al guardar", variant: "destructive" });
    } finally {
      setSavingNota(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="relative">
          <div className="h-12 w-12 sm:h-16 sm:w-16 lg:h-20 lg:w-20 animate-spin rounded-full border-2 sm:border-4 border-slate-200 dark:border-slate-700 border-t-indigo-500" />
          <div className="absolute inset-0 h-12 w-12 sm:h-16 sm:w-16 lg:h-20 lg:w-20 animate-ping rounded-full border-2 sm:border-4 border-indigo-400 opacity-20" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-2 sm:p-3 lg:p-6">
      <div className="mb-2 sm:mb-4 lg:mb-6 relative">
        <div className="absolute inset-0 bg-slate-200/50 dark:bg-slate-800/50 blur-3xl" />
        <div className="relative backdrop-blur-xl bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl lg:rounded-2xl p-2 sm:p-3 lg:p-6 shadow-2xl">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 lg:p-3 rounded-lg sm:rounded-xl bg-slate-700 dark:bg-slate-600 shadow-xl">
              <CalendarIcon
                className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 text-white"
                strokeWidth={2}
              />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm sm:text-xl lg:text-3xl font-black text-slate-900 dark:text-slate-100 truncate">
                Gestión de Turnos
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-0.5 text-[9px] sm:text-[10px] lg:text-sm font-medium truncate">
                {new Date(selectedDate + "T00:00:00").toLocaleDateString("es-AR", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[10px] sm:text-xs gap-1.5 shrink-0"
              onClick={() => descargarTurnosCSV(turnos)}
              disabled={turnos.length === 0}
              title="Exportar todos los turnos a CSV (Excel)"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Exportar CSV</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:gap-3 lg:gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4 space-y-2 sm:space-y-3 lg:space-y-4">
          <Card className="border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl">
            <CardHeader className="pb-1.5 sm:pb-2 lg:pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="p-1 sm:p-1.5 lg:p-2 rounded-md sm:rounded-lg bg-slate-700 dark:bg-slate-600 shadow-lg">
                    <CalendarIcon
                      className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-white"
                      strokeWidth={2.5}
                    />
                  </div>
                  <div>
                    <CardTitle className="text-xs sm:text-sm lg:text-base font-bold text-slate-900 dark:text-white">
                      Calendario
                    </CardTitle>
                    <CardDescription className="text-[8px] sm:text-[9px] lg:text-[10px] text-slate-600 dark:text-slate-400">
                      Selecciona una fecha
                    </CardDescription>
                  </div>
                </div>
                {turnosPendientes.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[10px]"
                    onClick={() => setPendientesDialogOpen(true)}
                  >
                    Ver pendientes
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-2 sm:p-3 lg:p-4">
              <CalendarView
                currentMonth={currentMonth}
                setCurrentMonth={setCurrentMonth}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                turnos={turnos}
                blockedDates={blockedDates}
                onToggleBlockDate={handleToggleBlockDate}
                onOpenBlockDialog={() => setBlockDateDialogOpen(true)}
              />
            </CardContent>
          </Card>

          <NextAppointmentCard
            turnos={turnos}
            selectedDate={selectedDate}
            onViewDetails={handleViewDetails}
          />

          <StatsCard selectedDate={selectedDate} turnos={turnos} />
        </div>

        <div className="lg:col-span-8">
          <div className="mb-2 sm:mb-3 pb-2 border-b border-slate-200 dark:border-slate-800">
            <p className="text-sm sm:text-base lg:text-lg font-bold text-slate-900 dark:text-white mb-2">
              Vista
            </p>
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "timeline" | "grid")}>
              <TabsList className="h-9 bg-slate-200/80 dark:bg-slate-800/80">
                <TabsTrigger value="timeline" className="text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
                  Vista Timeline
                </TabsTrigger>
                <TabsTrigger value="grid" className="text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
                  Vista Grid
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {viewMode === "timeline" && (
              <Tabs
                value={timelineMode}
                onValueChange={(v) => setTimelineMode(v as "date" | "full")}
                className="mt-2"
              >
                <TabsList className="h-9 bg-slate-200/80 dark:bg-slate-800/80">
                  <TabsTrigger value="date" className="text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
                    Vista por Fecha
                  </TabsTrigger>
                  <TabsTrigger value="full" className="text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
                    Historial Completo
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </div>
          {viewMode === "timeline" ? (
            <TimelineView
              selectedDate={selectedDate}
              turnos={turnos}
              onViewDetails={handleViewDetails}
              mode={timelineMode}
            />
          ) : (
            <GridView
              selectedDate={selectedDate}
              turnos={turnos}
              onTurnoClick={handleViewDetails}
              gridMode={gridMode}
              onGridModeChange={setGridMode}
            />
          )}
        </div>
      </div>

      <TurnoDetailsModal
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        turno={selectedTurno}
        mascotaDetails={mascotaDetails}
        loadingMascota={loadingMascota}
        onConfirm={(id) => handleConfirm(id, closeDetailsModal)}
        onMarkCompleted={(id) =>
          handleMarkCompleted(id, closeDetailsModal)
        }
        onCancel={(id) => handleCancel(id, closeDetailsModal)}
        onEdit={handleEdit}
        onDelete={(id) => handleDelete(id, closeDetailsModal)}
        onGenerateHistoria={handleGenerateHistoria}
      />

      <Dialog open={pendientesDialogOpen} onOpenChange={setPendientesDialogOpen}>
        <DialogContent className="sm:max-w-2xl border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
              Turnos pendientes
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 dark:text-slate-400">
              {turnosPendientes.length} pendientes ordenados por fecha
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {turnosPendientes.length === 0 ? (
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
                        if (turno.turno?.fecha) {
                          setSelectedDate(turno.turno.fecha);
                          setCurrentMonth(new Date(turno.turno.fecha + "T00:00:00"));
                        }
                        setPendientesDialogOpen(false);
                      }}
                    >
                      Ver detalles
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!generateHistoriaTurno} onOpenChange={(open) => !open && setGenerateHistoriaTurno(null)}>
        <DialogContent className="sm:max-w-lg border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
              Nota clínica rápida
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 dark:text-slate-400">
              {generateHistoriaTurno
                ? `${generateHistoriaTurno.cliente?.nombre ?? ""} – ${generateHistoriaTurno.mascota?.nombre ?? ""}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div>
              <Label className="text-xs font-semibold">Diagnóstico *</Label>
              <Textarea
                value={formNotaRapida.diagnostico}
                onChange={(e) => setFormNotaRapida((f) => ({ ...f, diagnostico: e.target.value }))}
                className="mt-1 min-h-[72px] text-sm"
                placeholder="Motivo de consulta o diagnóstico inicial..."
              />
            </div>
            <div>
              <Label className="text-xs">Tratamiento</Label>
              <Textarea
                value={formNotaRapida.tratamiento}
                onChange={(e) => setFormNotaRapida((f) => ({ ...f, tratamiento: e.target.value }))}
                className="mt-1 min-h-[60px] text-sm"
                placeholder="Tratamiento indicado (opcional)"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Peso actual (kg)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formNotaRapida.pesoActual}
                  onChange={(e) => setFormNotaRapida((f) => ({ ...f, pesoActual: e.target.value }))}
                  className="mt-1 h-9"
                  placeholder="Ej. 12.5"
                />
              </div>
              <div>
                <Label className="text-xs">Temperatura (°C)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formNotaRapida.temperatura}
                  onChange={(e) => setFormNotaRapida((f) => ({ ...f, temperatura: e.target.value }))}
                  className="mt-1 h-9"
                  placeholder="Opcional"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Observaciones</Label>
              <Textarea
                value={formNotaRapida.observaciones}
                onChange={(e) => setFormNotaRapida((f) => ({ ...f, observaciones: e.target.value }))}
                className="mt-1 min-h-[60px] text-sm"
                placeholder="Notas adicionales (opcional)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateHistoriaTurno(null)}>
              Cancelar
            </Button>
            <Button onClick={saveNotaRapida} disabled={savingNota} className="bg-emerald-600 hover:bg-emerald-700">
              {savingNota ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar y marcar turno completado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditTurnoModal
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        editData={editData}
        onEditDataChange={setEditData}
        onSave={() =>
          selectedTurno?.id &&
          handleSaveEdit(selectedTurno.id, editData, selectedTurno, () =>
            setEditDialogOpen(false)
          )
        }
      />

      <BlockDateModal
        open={blockDateDialogOpen}
        onOpenChange={setBlockDateDialogOpen}
        singleDateBlock={singleDateBlock}
        onSingleDateBlockChange={setSingleDateBlock}
        dateRangeStart={dateRangeStart}
        onDateRangeStartChange={setDateRangeStart}
        dateRangeEnd={dateRangeEnd}
        onDateRangeEndChange={setDateRangeEnd}
        onToggleSingleDate={(action) =>
          handleToggleSingleDate(singleDateBlock, action, () => {
            setBlockDateDialogOpen(false);
            setSingleDateBlock("");
          })
        }
        onToggleDateRange={(action) =>
          handleToggleDateRange(dateRangeStart, dateRangeEnd, action, () => {
            setBlockDateDialogOpen(false);
            setDateRangeStart("");
            setDateRangeEnd("");
          })
        }
      />

      <Toaster />
    </div>
  );
}