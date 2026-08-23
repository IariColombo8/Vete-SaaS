"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getClientesConMascotasYContadores,
  getClientesBasic,
  getMascotas,
  getHistorias,
  getTurnosByClienteId,
  createHistoria,
  updateHistoria,
  deleteHistoria,
} from "@/lib/supabase/queries";
import type { Cliente, Mascota, Historia, Turno } from "@/lib/supabase/queries";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import {
  FileText,
  Search,
  Plus,
  Edit,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronRight,
  User,
  Calendar,
  Clock,
  AlertCircle,
  Dog,
  Cat,
  Bird,
  PawPrint,
} from "lucide-react";

type ClienteConMascotas = {
  cliente: Cliente;
  mascotas: Array<{
    mascota: Mascota;
    totalVisitas: number;
    ultimaVisita: Historia | null;
    totalConsultas: number;
  }>;
  totalMascotas: number;
};

const ITEMS_PER_PAGE = 15;

const emptyForm = {
  fechaAtencion: "",
  motivo: "",
  diagnostico: "",
  tratamiento: "",
  observaciones: "",
  proximaVisita: "",
};

function getMascotaIcon(tipo: string) {
  const t = tipo?.toLowerCase() || "";
  if (t.includes("perro") || t.includes("dog")) return Dog;
  if (t.includes("gato") || t.includes("cat")) return Cat;
  if (t.includes("ave") || t.includes("bird") || t.includes("pájaro")) return Bird;
  return PawPrint;
}

function SkeletonClienteCard() {
  return (
    <Card className="border-slate-200 dark:border-slate-700 shadow-md">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-4 w-4 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ searchTerm }: { searchTerm: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="relative mb-4">
        <div className="absolute inset-0 bg-slate-200 dark:bg-slate-700 rounded-full blur-xl opacity-50" />
        <div className="relative bg-slate-100 dark:bg-slate-800 rounded-full p-6">
          <Search className="h-12 w-12 text-slate-400 dark:text-slate-600" />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
        {searchTerm ? "No se encontraron resultados" : "No hay pacientes registrados"}
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
        {searchTerm
          ? "Intenta con otros términos de búsqueda o verifica la ortografía."
          : "Los pacientes aparecerán aquí cuando tengan mascotas registradas con historias clínicas."}
      </p>
    </div>
  );
}

export function HistoriasManagement({ tenantId }: { tenantId: string }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [clientesData, setClientesData] = useState<ClienteConMascotas[]>([]);
  const [expandedClientes, setExpandedClientes] = useState<Set<string>>(new Set());
  const [expandedMascotas, setExpandedMascotas] = useState<Set<string>>(new Set());
  /** Timeline unificado: historias + turnos de la mascota, ordenados por fecha */
  const [historialMascota, setHistorialMascota] = useState<{
    cliente: Cliente;
    mascota: Mascota;
    historias: Historia[];
    turnos: Turno[];
    timeline: Array<{ type: "historia"; data: Historia } | { type: "turno"; data: Turno }>;
  } | null>(null);
  const [historialDialogOpen, setHistorialDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingClienteId, setEditingClienteId] = useState("");
  const [editingMascotaId, setEditingMascotaId] = useState("");
  const [mascotasForSelect, setMascotasForSelect] = useState<Mascota[]>([]);
  const [allClientesForSelect, setAllClientesForSelect] = useState<Cliente[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalClientes, setTotalClientes] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [isHistorialLoading, setIsHistorialLoading] = useState(false);
  const { toast } = useToast();

  // Debounce búsqueda 300ms: filtrado solo sobre clientesData en memoria
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Carga inicial optimizada con pre-fetching
  const loadData = async (pageNum: number = 0, append: boolean = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    
    try {
      const offset = pageNum * ITEMS_PER_PAGE;
      const result = await getClientesConMascotasYContadores(tenantId, ITEMS_PER_PAGE, offset);
      
      if (append) {
        setClientesData((prev) => [...prev, ...result.clientes]);
      } else {
        setClientesData(result.clientes);
      }
      
      setTotalClientes(result.total);
      setHasMore(result.hasMore);
      setPage(pageNum);
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las historias clínicas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadData(0, false);
  }, []);

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      loadData(page + 1, true);
    }
  };

  const toggleCliente = (clienteId: string) => {
    setExpandedClientes((prev) => {
      const next = new Set(prev);
      if (next.has(clienteId)) {
        next.delete(clienteId);
      } else {
        next.add(clienteId);
      }
      return next;
    });
  };

  const toggleMascota = (clienteId: string, mascotaId: string) => {
    const key = `${clienteId}::${mascotaId}`;
    setExpandedMascotas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return clientesData;
    const t = searchTerm.toLowerCase();
    return clientesData.filter(
      (item) =>
        item.cliente.nombre?.toLowerCase().includes(t) ||
        item.cliente.dni?.toLowerCase().includes(t) ||
        item.mascotas.some(
          (m) =>
            m.mascota.nombre?.toLowerCase().includes(t) ||
            m.mascota.tipo?.toLowerCase().includes(t) ||
            m.mascota.raza?.toLowerCase().includes(t)
        )
    );
  }, [clientesData, searchTerm]);

  const loadMascotasForSelect = async (clienteId: string) => {
    if (!clienteId) {
      setMascotasForSelect([]);
      return;
    }
    try {
      const data = await getMascotas(tenantId, clienteId);
      setMascotasForSelect(data);
    } catch {
      setMascotasForSelect([]);
    }
  };

  const openAdd = async () => {
    setEditingId(null);
    setEditingClienteId("");
    setEditingMascotaId("");
    setForm(emptyForm);
    setMascotasForSelect([]);
    // Cargar todos los clientes para el select
    try {
      const clientes = await getClientesBasic(tenantId);
      setAllClientesForSelect(clientes.filter((c) => c.dni?.trim()));
    } catch (error) {
      console.error("Error loading clientes for select:", error);
    }
    setEditDialogOpen(true);
  };

  const openEdit = async (h: Historia, clienteId: string, mascotaId: string) => {
    setEditingId(h.id ?? null);
    setEditingClienteId(clienteId);
    setEditingMascotaId(mascotaId);
    setForm({
      fechaAtencion: h.fechaAtencion ?? "",
      motivo: h.motivo ?? "",
      diagnostico: h.diagnostico ?? "",
      tratamiento: h.tratamiento ?? "",
      observaciones: h.observaciones ?? "",
      proximaVisita: h.proximaVisita ?? "",
    });
    await loadMascotasForSelect(clienteId);
    setEditDialogOpen(true);
  };

  const openHistorial = useCallback(async (cliente: Cliente, mascota: Mascota) => {
    setHistorialDialogOpen(true);
    setHistorialMascota(null);
    setIsHistorialLoading(true);
    try {
      const [historias, turnosCliente] = await Promise.all([
        getHistorias(tenantId, cliente.id!, mascota.id!),
        getTurnosByClienteId(tenantId, cliente.id!),
      ]);
      const nombreMascota = (mascota.nombre ?? "").trim().toLowerCase();
      const turnosMascota = turnosCliente.filter((t) => {
        const tNombre = (t.mascota?.nombre ?? "").trim().toLowerCase();
        return t.mascotaId === mascota.id || tNombre === nombreMascota;
      });
      const timeline: Array<{ type: "historia"; data: Historia } | { type: "turno"; data: Turno }> = [];
      historias.forEach((h) => {
        const fecha = h.fechaAtencion ? new Date(h.fechaAtencion + "T12:00:00").getTime() : 0;
        timeline.push({ type: "historia", data: h });
      });
      turnosMascota.forEach((t) => {
        const fechaStr = t.turno?.fecha || t.fecha || "";
        if (!fechaStr) return;
        timeline.push({ type: "turno", data: t });
      });
      timeline.sort((a, b) => {
        const dateA = a.type === "historia"
          ? new Date((a.data as Historia).fechaAtencion + "T12:00:00").getTime()
          : new Date(((a.data as Turno).turno?.fecha || (a.data as Turno).fecha || "") + "T12:00:00").getTime();
        const dateB = b.type === "historia"
          ? new Date((b.data as Historia).fechaAtencion + "T12:00:00").getTime()
          : new Date(((b.data as Turno).turno?.fecha || (b.data as Turno).fecha || "") + "T12:00:00").getTime();
        return dateB - dateA;
      });
      setHistorialMascota({ cliente, mascota, historias, turnos: turnosMascota, timeline });
    } catch (error) {
      console.error("Error loading historias:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las consultas",
        variant: "destructive",
      });
    } finally {
      setIsHistorialLoading(false);
    }
  }, [toast]);

  const handleSave = async () => {
    if (!form.fechaAtencion.trim() || !form.diagnostico.trim() || !form.tratamiento.trim()) {
      toast({
        title: "Campos requeridos",
        description: "Fecha, diagnóstico y tratamiento son obligatorios",
        variant: "destructive",
      });
      return;
    }
    if (editingId) {
      setSaving(true);
      try {
        await updateHistoria(tenantId, editingClienteId, editingMascotaId, editingId, {
          fechaAtencion: form.fechaAtencion,
          motivo: form.motivo || undefined,
          diagnostico: form.diagnostico,
          tratamiento: form.tratamiento,
          observaciones: form.observaciones || undefined,
          proximaVisita: form.proximaVisita || undefined,
        });
        toast({
          title: "Consulta actualizada",
          description: "Los datos se guardaron correctamente",
        });
        setEditDialogOpen(false);
        setForm(emptyForm);
        setEditingId(null);
        await loadData(page, false); // Recargar página actual
      } catch (error) {
        console.error("Error updating historia:", error);
        toast({
          title: "Error",
          description: "No se pudo actualizar la consulta",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    } else {
      if (!editingClienteId || !editingMascotaId) {
        toast({
          title: "Cliente y mascota requeridos",
          description: "Selecciona un cliente y una mascota",
          variant: "destructive",
        });
        return;
      }
      setSaving(true);
      try {
        await createHistoria(tenantId, editingClienteId, editingMascotaId, {
          fechaAtencion: form.fechaAtencion,
          motivo: form.motivo || undefined,
          diagnostico: form.diagnostico,
          tratamiento: form.tratamiento,
          observaciones: form.observaciones || undefined,
          proximaVisita: form.proximaVisita || undefined,
        });
        toast({
          title: "Consulta agregada",
          description: "La historia clínica se registró correctamente",
        });
        setEditDialogOpen(false);
        setForm(emptyForm);
        setEditingClienteId("");
        setEditingMascotaId("");
        await loadData(page, false); // Recargar página actual
      } catch (error) {
        console.error("Error creating historia:", error);
        toast({
          title: "Error",
          description: "No se pudo guardar la consulta",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    }
  };

  const handleDelete = async (h: Historia, clienteId: string, mascotaId: string) => {
    if (!confirm("¿Eliminar esta consulta? Esta acción no se puede deshacer.")) return;
    try {
      await deleteHistoria(tenantId, clienteId, mascotaId, h.id!);
      toast({
        title: "Consulta eliminada",
        description: "La historia clínica se eliminó correctamente",
      });
      await loadData(page, false); // Recargar página actual
    } catch (error) {
      console.error("Error deleting historia:", error);
      toast({
        title: "Error",
        description: "No se pudo eliminar la consulta",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-2 sm:p-3 lg:p-6">
      {/* Header */}
      <div className="mb-2 sm:mb-4 lg:mb-6 relative">
        <div className="absolute inset-0 bg-slate-200/50 dark:bg-slate-800/50 blur-3xl" />
        <div className="relative backdrop-blur-xl bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl lg:rounded-2xl p-2 sm:p-3 lg:p-6 shadow-2xl">
          <div className="flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 lg:p-3 rounded-lg sm:rounded-xl bg-slate-700 dark:bg-slate-600 shadow-xl">
                <FileText className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 text-white" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-xl lg:text-3xl font-black text-slate-900 dark:text-slate-100 truncate">
                  Historias Clínicas
                </h1>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5 text-[9px] sm:text-[10px] lg:text-sm font-medium truncate">
                  {totalClientes} paciente{totalClientes !== 1 ? "s" : ""} registrado{totalClientes !== 1 ? "s" : ""} • Carga optimizada
                </p>
              </div>
            </div>
            <Button
              onClick={openAdd}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg h-8 sm:h-9 lg:h-10 text-[10px] sm:text-xs lg:text-sm"
            >
              <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Agregar consulta
            </Button>
          </div>
        </div>
      </div>

      {/* Card principal */}
      <Card className="border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl overflow-hidden">
        <CardHeader className="pb-1.5 sm:pb-2 lg:pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-xs sm:text-sm lg:text-base font-bold text-slate-900 dark:text-white">
                Pacientes con historial clínico
              </CardTitle>
              <CardDescription className="text-[8px] sm:text-[9px] lg:text-[10px] text-slate-600 dark:text-slate-400">
                Estructura jerárquica optimizada • Solo clientes con mascotas
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
              <Input
                placeholder="Buscar por DNI, nombre de cliente o mascota..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 border-slate-300 dark:border-slate-700 text-xs sm:text-sm h-8 sm:h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-2 lg:p-4 min-h-0 flex flex-col">
          <ScrollArea className="w-full max-h-[calc(100vh-320px)] min-h-[320px] overflow-auto">
            <div className="space-y-3 pr-3 pb-4">
              {loading && filtered.length === 0 ? (
                // Skeleton loaders
                Array.from({ length: 5 }).map((_, i) => <SkeletonClienteCard key={i} />)
              ) : filtered.length === 0 ? (
                <EmptyState searchTerm={searchTerm} />
              ) : (
                filtered.map((item) => {
                  const isClienteExpanded = expandedClientes.has(item.cliente.id!);
                  
                  return (
                    <Card
                      key={item.cliente.id}
                      className="border-slate-200 dark:border-slate-700 shadow-md hover:shadow-lg transition-shadow rounded-xl overflow-hidden"
                    >
                      {/* Encabezado Cliente: div para evitar anidar botones */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleCliente(item.cliente.id!)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleCliente(item.cliente.id!);
                          }
                        }}
                        className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2 shrink-0">
                          {isClienteExpanded ? (
                            <ChevronDown className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                          )}
                          <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                            <User className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                            {item.cliente.nombre}
                          </div>
                          {item.cliente.dni && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                              DNI: {item.cliente.dni}
                            </div>
                          )}
                        </div>
                        <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-sm">
                          {item.totalMascotas} {item.totalMascotas === 1 ? "mascota" : "mascotas"}
                        </Badge>
                      </div>

                      {/* Mascotas del cliente */}
                      {isClienteExpanded && (
                        <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                          {item.mascotas.length === 0 ? (
                            <div className="p-4 text-sm text-slate-500 dark:text-slate-400 text-center">
                              Sin mascotas registradas
                            </div>
                          ) : (
                            <div className="divide-y divide-slate-200 dark:divide-slate-700">
                              {item.mascotas.map((mData) => {
                                const mascotaKey = `${item.cliente.id}::${mData.mascota.id}`;
                                const isMascotaExpanded = expandedMascotas.has(mascotaKey);
                                const MascotaIcon = getMascotaIcon(mData.mascota.tipo || "");
                                
                                return (
                                  <div key={mData.mascota.id} className="bg-white dark:bg-slate-900">
                                    {/* Encabezado Mascota: div para acordeón + botón "Ver historial" fuera del trigger */}
                                    <div className="flex items-center w-full gap-3 p-3 pl-8">
                                      <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => toggleMascota(item.cliente.id!, mData.mascota.id!)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            toggleMascota(item.cliente.id!, mData.mascota.id!);
                                          }
                                        }}
                                        className="flex flex-1 items-center gap-3 min-w-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-lg -m-1 p-1"
                                      >
                                        <div className="flex items-center gap-2 shrink-0">
                                          {isMascotaExpanded ? (
                                            <ChevronDown className="h-4 w-4 text-slate-400" />
                                          ) : (
                                            <ChevronRight className="h-4 w-4 text-slate-400" />
                                          )}
                                          <div className="p-1.5 rounded-md bg-indigo-100 dark:bg-indigo-900/30">
                                            <MascotaIcon className="h-4 w-4 text-indigo-700 dark:text-indigo-300" />
                                          </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                                            {mData.mascota.nombre}
                                          </div>
                                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                            {mData.mascota.tipo}
                                            {mData.mascota.raza && ` · ${mData.mascota.raza}`}
                                            {mData.mascota.edad && ` · ${mData.mascota.edad}`}
                                          </div>
                                        </div>
                                        <Badge variant="outline" className="text-xs border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 shrink-0">
                                          {mData.totalVisitas} {mData.totalVisitas === 1 ? "visita" : "visitas"}
                                        </Badge>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openHistorial(item.cliente, mData.mascota)}
                                        className="h-7 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 shrink-0"
                                      >
                                        Ver historial
                                      </Button>
                                    </div>

                                    {/* Timeline de consultas */}
                                    {isMascotaExpanded && (
                                      <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20 pl-8 pr-4 py-3">
                                        {mData.ultimaVisita ? (
                                          <div className="space-y-3">
                                            <div className="relative pl-6 border-l-2 border-slate-300 dark:border-slate-600">
                                              <div className="absolute -left-[7px] top-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
                                              <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                                    {mData.ultimaVisita.fechaAtencion
                                                      ? new Date(mData.ultimaVisita.fechaAtencion + "T00:00:00").toLocaleDateString("es-AR", {
                                                          day: "numeric",
                                                          month: "short",
                                                          year: "numeric",
                                                        })
                                                      : "—"}
                                                  </span>
                                                  {mData.ultimaVisita.tipoVisita === "turno_programado" && (
                                                    <Badge variant="outline" className="text-[10px] bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 border-dashed">
                                                      Próxima visita
                                                    </Badge>
                                                  )}
                                                </div>
                                                {mData.ultimaVisita.motivo && (
                                                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                    {mData.ultimaVisita.motivo}
                                                  </p>
                                                )}
                                                <p className="text-xs text-slate-600 dark:text-slate-400">
                                                  {mData.ultimaVisita.diagnostico || "Sin diagnóstico"}
                                                </p>
                                              </div>
                                            </div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 pl-6">
                                              {mData.totalConsultas > 1 && (
                                                <button
                                                  onClick={() => openHistorial(item.cliente, mData.mascota)}
                                                  className="text-emerald-600 dark:text-emerald-400 hover:underline"
                                                >
                                                  Ver {mData.totalConsultas - 1} consulta{mData.totalConsultas - 1 !== 1 ? "s" : ""} anterior{mData.totalConsultas - 1 !== 1 ? "es" : ""}
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        ) : (
                                          <p className="text-sm text-slate-500 dark:text-slate-400 pl-6">
                                            Historial limpio. No se registran visitas previas ni turnos pendientes.
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })
              )}
              
              {/* Botón cargar más */}
              {!loading && hasMore && !searchTerm && (
                <div className="flex justify-center pt-4">
                  <Button
                    onClick={loadMore}
                    disabled={loadingMore}
                    variant="outline"
                    className="border-slate-300 dark:border-slate-700"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Cargando...
                      </>
                    ) : (
                      "Cargar más pacientes"
                    )}
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Modal Timeline Completo */}
      <Dialog open={historialDialogOpen} onOpenChange={setHistorialDialogOpen}>
        <DialogContent className="sm:max-w-2xl border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="border-b border-slate-200 dark:border-slate-800 pb-3 sm:pb-4 shrink-0">
            <DialogTitle className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
              Historial completo
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              {historialMascota
                ? `${historialMascota.cliente.nombre} – ${historialMascota.mascota.nombre} (${historialMascota.mascota.tipo})`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 max-h-[60vh] sm:max-h-[50vh] rounded-md border border-slate-200 dark:border-slate-800 p-4">
            <div className="space-y-6 pr-3">
              {isHistorialLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-600 dark:text-emerald-400 mb-3" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">Buscando historial...</p>
                </div>
              ) : !historialMascota?.timeline.length ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 text-slate-400 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
                    Historial limpio.
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    No se registran visitas previas ni turnos pendientes.
                  </p>
                </div>
              ) : (
                historialMascota?.timeline.map((item, idx) => {
                  if (item.type === "turno") {
                    const t = item.data as Turno;
                    const fechaStr = t.turno?.fecha || t.fecha || "";
                    const fecha = fechaStr ? new Date(fechaStr + "T12:00:00") : null;
                    const esFuturo = fecha && fecha > new Date();
                    const hora = t.turno?.hora || t.hora || "";
                    return (
                      <div key={`turno-${t.id}`} className="relative pl-8">
                        {idx < historialMascota.timeline.length - 1 && (
                          <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />
                        )}
                        <div
                          className={`absolute left-0 top-1 w-3 h-3 rounded-full border-2 ${
                            esFuturo ? "bg-emerald-500 border-white dark:border-slate-900" : "bg-slate-500 border-white dark:border-slate-900"
                          }`}
                        />
                        <div
                          className={`rounded-lg border p-4 ${
                            esFuturo
                              ? "bg-slate-50 dark:bg-slate-800/50 border-emerald-500 dark:border-emerald-600"
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Calendar className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {fecha ? fecha.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "—"}
                              {hora ? ` · ${hora}` : ""}
                            </span>
                          </div>
                          <Badge variant={esFuturo ? "default" : "secondary"} className={esFuturo ? "bg-emerald-600 text-white border-0" : ""}>
                            {esFuturo ? "Próximo turno agendado" : "Visita realizada"}
                          </Badge>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-2">
                            {t.servicio || "Consulta"}
                          </p>
                          {t.mascota?.motivo && (
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{t.mascota.motivo}</p>
                          )}
                        </div>
                      </div>
                    );
                  }
                  const h = item.data as Historia;
                  const isProximaVisita = h.tipoVisita === "turno_programado";
                  const fecha = h.fechaAtencion ? new Date(h.fechaAtencion + "T00:00:00") : null;
                  const esFutura = fecha && fecha > new Date();
                  return (
                    <div key={`historia-${h.id}`} className="relative pl-8">
                      {idx < historialMascota.timeline.length - 1 && (
                        <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />
                      )}
                      <div
                        className={`absolute left-0 top-1 w-3 h-3 rounded-full border-2 ${
                          isProximaVisita || esFutura ? "bg-amber-500 border-white dark:border-slate-900" : "bg-emerald-500 border-white dark:border-slate-900"
                        }`}
                      />
                      <div
                        className={`rounded-lg border p-4 ${
                          isProximaVisita || esFutura
                            ? "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 border-dashed"
                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Calendar className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {fecha ? fecha.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "—"}
                              </span>
                            </div>
                            {h.motivo && (
                              <p className="text-base font-medium text-slate-900 dark:text-slate-100 mb-2">{h.motivo}</p>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setHistorialDialogOpen(false);
                                openEdit(h, historialMascota.cliente.id!, historialMascota.mascota.id!);
                              }}
                              className="h-7 text-xs"
                              title="Editar"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(h, historialMascota.cliente.id!, historialMascota.mascota.id!)}
                              className="h-7 text-xs text-rose-600 dark:text-rose-400"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">Diagnóstico:</span>
                            <p className="text-slate-600 dark:text-slate-400 mt-0.5">{h.diagnostico || "—"}</p>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">Tratamiento:</span>
                            <p className="text-slate-600 dark:text-slate-400 mt-0.5">{h.tratamiento || "—"}</p>
                          </div>
                          {h.proximaVisita && (
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                              <Clock className="h-3 w-3" />
                              Próxima visita: {new Date(h.proximaVisita + "T00:00:00").toLocaleDateString("es-AR")}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Modal Agregar/Editar */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-slate-200 dark:border-slate-800 pb-3 sm:pb-4">
            <DialogTitle className="text-base sm:text-lg lg:text-xl font-black text-slate-900 dark:text-slate-100">
              {editingId ? "Editar consulta" : "Agregar consulta"}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              {editingId
                ? "Modifica los datos de la consulta."
                : "Selecciona cliente y mascota, luego completa los datos."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4 py-2 sm:py-3 lg:py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                  Cliente *
                </Label>
                <Select
                  value={editingClienteId}
                  onValueChange={(v) => {
                    setEditingClienteId(v);
                    setEditingMascotaId("");
                    loadMascotasForSelect(v);
                  }}
                  disabled={!!editingId}
                >
                  <SelectTrigger className="border-2 border-slate-300 dark:border-slate-700 h-8 sm:h-9 lg:h-10 text-xs sm:text-sm">
                    <SelectValue placeholder="Selecciona cliente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allClientesForSelect.length > 0 ? (
                      allClientesForSelect.map((c) => (
                        <SelectItem key={c.id} value={c.id ?? ""}>
                          {c.nombre} {c.dni && `(DNI: ${c.dni})`}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="" disabled>
                        Cargando clientes...
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                  Mascota *
                </Label>
                <Select
                  value={editingMascotaId}
                  onValueChange={setEditingMascotaId}
                  disabled={!editingClienteId || !!editingId}
                >
                  <SelectTrigger className="border-2 border-slate-300 dark:border-slate-700 h-8 sm:h-9 lg:h-10 text-xs sm:text-sm">
                    <SelectValue placeholder="Selecciona mascota..." />
                  </SelectTrigger>
                  <SelectContent>
                    {mascotasForSelect.map((m) => (
                      <SelectItem key={m.id} value={m.id ?? ""}>
                        {m.nombre} ({m.tipo})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="historia-fecha" className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                  Fecha *
                </Label>
                <Input
                  id="historia-fecha"
                  type="date"
                  value={form.fechaAtencion}
                  onChange={(e) => setForm((f) => ({ ...f, fechaAtencion: e.target.value }))}
                  className="border-2 border-slate-300 dark:border-slate-700 h-8 sm:h-9 lg:h-10 text-xs sm:text-sm"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="historia-motivo" className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                  Motivo
                </Label>
                <Input
                  id="historia-motivo"
                  value={form.motivo}
                  onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}
                  placeholder="Ej. Control, vacuna, enfermedad"
                  className="border-2 border-slate-300 dark:border-slate-700 h-8 sm:h-9 lg:h-10 text-xs sm:text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="historia-diagnostico" className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                Diagnóstico *
              </Label>
              <Textarea
                id="historia-diagnostico"
                value={form.diagnostico}
                onChange={(e) => setForm((f) => ({ ...f, diagnostico: e.target.value }))}
                placeholder="Descripción del diagnóstico..."
                className="border-2 border-slate-300 dark:border-slate-700 text-xs sm:text-sm min-h-[80px]"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="historia-tratamiento" className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                Tratamiento *
              </Label>
              <Textarea
                id="historia-tratamiento"
                value={form.tratamiento}
                onChange={(e) => setForm((f) => ({ ...f, tratamiento: e.target.value }))}
                placeholder="Tratamiento indicado..."
                className="border-2 border-slate-300 dark:border-slate-700 text-xs sm:text-sm min-h-[80px]"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="historia-proxima" className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                Próxima visita
              </Label>
              <Input
                id="historia-proxima"
                type="date"
                value={form.proximaVisita}
                onChange={(e) => setForm((f) => ({ ...f, proximaVisita: e.target.value }))}
                className="border-2 border-slate-300 dark:border-slate-700 h-8 sm:h-9 lg:h-10 text-xs sm:text-sm"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="historia-observaciones" className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                Observaciones
              </Label>
              <Textarea
                id="historia-observaciones"
                value={form.observaciones}
                onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
                placeholder="Observaciones adicionales (opcional)"
                className="border-2 border-slate-300 dark:border-slate-700 text-xs sm:text-sm min-h-[60px]"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-3 pt-2 sm:pt-3 lg:pt-4 border-t border-slate-200 dark:border-slate-800">
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              className="flex-1 border-2 border-slate-300 dark:border-slate-700 h-8 sm:h-9 lg:h-10 text-[10px] sm:text-xs lg:text-sm"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg h-8 sm:h-9 lg:h-10 text-[10px] sm:text-xs lg:text-sm"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster />
    </div>
  );
}
