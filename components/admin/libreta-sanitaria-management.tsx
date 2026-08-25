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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  getClientesBasic,
  getClienteCompleto,
  getMascotas,
  getHistorias,
  getTurnosByClienteId,
  createHistoria,
  updateHistoria,
  updateCliente,
  updateTurno,
} from "@/lib/supabase/queries";
import type { Cliente, Mascota, Historia, Turno, HistorialDato } from "@/lib/supabase/queries";
import { uploadArchivoHistoria } from "@/lib/supabase/storage";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  FileText,
  Search,
  Plus,
  Edit3,
  Loader2,
  ChevronRight,
  User,
  Phone,
  MapPin,
  Calendar,
  Clock,
  Check,
  Dog,
  Cat,
  Bird,
  PawPrint,
  MessageCircle,
  History,
  Eye,
  ChevronDown,
  XCircle,
  Paperclip,
  Upload,
  Trash2,
  Image,
  Film,
  File,
  FileDown,
} from "lucide-react";
import LibretaDetallesModal from "./LibretaDetallesModal";
import { generarLibretaPDF } from "@/lib/pdf/libreta-pdf";
import { QrLibretaButton } from "./qr-libreta-button";
import { RecordatorioVacunaButton } from "./recordatorio-vacuna-button";

const ITEMS_PER_PAGE = 15;

type ClienteExpandido = {
  cliente: Cliente;
  mascotas: Mascota[];
  turnos: Turno[];
};

type TimelineItem =
  | { type: "historia"; data: Historia }
  | { type: "turno"; data: Turno };

function getIniciales(nombre: string): string {
  if (!nombre?.trim()) return "?";
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return nombre.slice(0, 2).toUpperCase();
}

function getMascotaIcon(tipo: string) {
  const t = tipo?.toLowerCase() || "";
  if (t.includes("perro") || t.includes("dog")) return Dog;
  if (t.includes("gato") || t.includes("cat")) return Cat;
  if (t.includes("ave") || t.includes("bird") || t.includes("pájaro")) return Bird;
  return PawPrint;
}

function getWhatsAppUrl(telefono: string): string {
  const digits = (telefono || "").replace(/\D/g, "");
  if (!digits.length) return "#";
  return `https://wa.me/${digits.length <= 11 ? "54" + digits : digits}`;
}

function buildTimeline(historias: Historia[], turnosMascota: Turno[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  historias.forEach((h) => items.push({ type: "historia", data: h }));
  turnosMascota.forEach((t) => items.push({ type: "turno", data: t }));
  items.sort((a, b) => {
    const dateA =
      a.type === "historia"
        ? new Date((a.data as Historia).fechaAtencion + "T12:00:00").getTime()
        : new Date(((a.data as Turno).turno?.fecha || (a.data as Turno).fecha || "") + "T12:00:00").getTime();
    const dateB =
      b.type === "historia"
        ? new Date((b.data as Historia).fechaAtencion + "T12:00:00").getTime()
        : new Date(((b.data as Turno).turno?.fecha || (b.data as Turno).fecha || "") + "T12:00:00").getTime();
    return dateB - dateA;
  });
  return items;
}

function countProximosTurnos(turnos: Turno[], mascotaId: string, nombreMascota: string): number {
  const now = new Date();
  const nombre = (nombreMascota || "").trim().toLowerCase();
  return turnos.filter((t) => {
    const fechaStr = t.turno?.fecha || t.fecha || "";
    if (!fechaStr) return false;
    const fecha = new Date(fechaStr + "T12:00:00");
    if (fecha < now) return false;
    if (t.estado === "cancelado") return false;
    const matchId = t.mascotaId === mascotaId;
    const matchNombre = (t.mascota?.nombre ?? "").trim().toLowerCase() === nombre;
    return matchId || matchNombre;
  }).length;
}

function isProximaVisitaVencida(proximaVisita: string | undefined): boolean {
  if (!proximaVisita) return false;
  const d = new Date(proximaVisita + "T23:59:59");
  return d < new Date();
}

function esImagenUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|svg)/i.test(url);
}

function esPdfUrl(url: string): boolean {
  return /\.pdf/i.test(url);
}

const emptyHistoriaForm = {
  fechaAtencion: "",
  motivo: "",
  diagnostico: "",
  tratamiento: "",
  observaciones: "",
  proximaVisita: "",
  pesoActual: "",
  temperatura: "",
};

function SkeletonCard() {
  return (
    <Card className="border-slate-200 dark:border-slate-700">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function LibretaSanitariaManagement({ tenantId }: { tenantId: string }) {
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const [expandedClienteId, setExpandedClienteId] = useState<string | null>(null);
  const [clienteExpandido, setClienteExpandido] = useState<ClienteExpandido | null>(null);
  const [loadingCliente, setLoadingCliente] = useState(false);
  const [mascotasResumen, setMascotasResumen] = useState<Record<string, { count: number; names: string[] }>>({});
  const [selectedMascotaId, setSelectedMascotaId] = useState<string | null>(null);
  const [timelineData, setTimelineData] = useState<{
    historias: Historia[];
    turnos: Turno[];
    timeline: TimelineItem[];
  } | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [clienteForm, setClienteForm] = useState({ domicilio: "", telefono: "", email: "", nombre: "" });
  const [savingCliente, setSavingCliente] = useState(false);

  const [editEntradaOpen, setEditEntradaOpen] = useState(false);
  const [editTipo, setEditTipo] = useState<"historia" | "turno">("historia");
  const [editHistoria, setEditHistoria] = useState<{ h: Historia; clienteId: string; mascotaId: string } | null>(null);
  const [editTurno, setEditTurno] = useState<Turno | null>(null);
  const [formHistoria, setFormHistoria] = useState(emptyHistoriaForm);
  const [formTurno, setFormTurno] = useState({ fecha: "", hora: "", motivo: "", diagnostico: "", tratamiento: "", medicacion: "", observaciones: "" });
  const [savingEntrada, setSavingEntrada] = useState(false);

  const [addNotaOpen, setAddNotaOpen] = useState(false);
  const [addNotaMascota, setAddNotaMascota] = useState<{ cliente: Cliente; mascota: Mascota } | null>(null);
  const [formNota, setFormNota] = useState(emptyHistoriaForm);
  const [archivosNota, setArchivosNota] = useState<File[]>([]);
  const [uploadingArchivos, setUploadingArchivos] = useState(false);
  const [savingNota, setSavingNota] = useState(false);

  const [addArchivoOpen, setAddArchivoOpen] = useState(false);
  const [addArchivoMascota, setAddArchivoMascota] = useState<{ cliente: Cliente; mascota: Mascota } | null>(null);
  const [archivoTitulo, setArchivoTitulo] = useState("");
  const [archivoDescripcion, setArchivoDescripcion] = useState("");
  const [archivoFile, setArchivoFile] = useState<File | null>(null);
  const [savingArchivo, setSavingArchivo] = useState(false);
  /** Filtro de la pestaña Historia Clínica: todos los adjuntos, solo imágenes o solo PDFs. */
  const [filtroArchivos, setFiltroArchivos] = useState<"todos" | "imagenes" | "pdf">("todos");

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailModalItem, setDetailModalItem] = useState<TimelineItem | null>(null);
  /** Cuando el detalle es un turno, guardamos la historia del mismo día (si existe) para "Ver Nota Clínica". */
  const [detailTurnoHistoriaAsociada, setDetailTurnoHistoriaAsociada] = useState<Historia | null>(null);
  const [historialOpen, setHistorialOpen] = useState(false);
  const [showAllMascotasChips, setShowAllMascotasChips] = useState(false);
  /** Tabs dentro de la ficha de la mascota: Historia Clínica (default) | Turnos */
  const [mascotaContentTab, setMascotaContentTab] = useState<"historia" | "turnos">("historia");

  const { toast } = useToast();

  const clientesConDNI = useMemo(() => {
    return clientes.filter((c) => c.dni?.trim());
  }, [clientes]);

  const filtered = useMemo(() => {
    const term = searchInput.trim().toLowerCase();
    if (!term) return clientesConDNI;
    return clientesConDNI.filter((c) =>
      c.nombre?.toLowerCase().includes(term) ||
      c.dni?.toLowerCase().includes(term) ||
      c.email?.toLowerCase().includes(term) ||
      c.telefono?.includes(searchInput.trim()) ||
      c.domicilio?.toLowerCase().includes(term)
    );
  }, [clientesConDNI, searchInput]);

  const [inlineEditField, setInlineEditField] = useState<"domicilio" | "telefono" | null>(null);
  const [inlineValues, setInlineValues] = useState({ domicilio: "", telefono: "" });
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const fn = () => setIsMobile(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  const paginated = useMemo(() => {
    const start = page * ITEMS_PER_PAGE;
    return filtered.slice(0, start + ITEMS_PER_PAGE);
  }, [filtered, page]);

  useEffect(() => {
    const missingIds = paginated
      .map((c) => c.id)
      .filter((id): id is string => !!id && !mascotasResumen[id]);
    if (missingIds.length === 0) return;
    let alive = true;
    const load = async () => {
      try {
        const results = await Promise.all(
          missingIds.map(async (id) => {
            const mascotas = await getMascotas(tenantId, id);
            const names = mascotas.map((m) => m.nombre).filter(Boolean);
            return { id, count: mascotas.length, names };
          })
        );
        if (!alive) return;
        setMascotasResumen((prev) => {
          const next = { ...prev };
          results.forEach((r) => {
            next[r.id] = { count: r.count, names: r.names };
          });
          return next;
        });
      } catch (e) {
        console.error("Error cargando mascotas del listado:", e);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [paginated, mascotasResumen]);

  const loadClientes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getClientesBasic(tenantId);
      setClientes(data);
      const conDNI = data.filter((c) => c.dni?.trim());
      setTotal(conDNI.length);
      setHasMore(conDNI.length > ITEMS_PER_PAGE);
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "No se pudieron cargar los clientes", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadClientes();
  }, [loadClientes]);

  useEffect(() => {
    setShowAllMascotasChips(false);
  }, [expandedClienteId]);

  useEffect(() => {
    setMascotaContentTab("historia");
  }, [selectedMascotaId]);

  const loadMore = () => {
    if (paginated.length < filtered.length) setPage((p) => p + 1);
  };
  useEffect(() => {
    setHasMore(paginated.length < filtered.length);
  }, [paginated.length, filtered.length]);

  const selectCliente = useCallback(
    async (clienteId: string) => {
      if (expandedClienteId === clienteId) {
        if (isMobile) setDetailSheetOpen(false);
        setExpandedClienteId(null);
        setClienteExpandido(null);
        setSelectedMascotaId(null);
        setTimelineData(null);
        setInlineEditField(null);
        return;
      }
      setExpandedClienteId(clienteId);
      setClienteExpandido(null);
      setSelectedMascotaId(null);
      setTimelineData(null);
      setInlineEditField(null);
      setLoadingCliente(true);
      if (isMobile) setDetailSheetOpen(true);
      try {
        const [completo, turnos] = await Promise.all([
          getClienteCompleto(tenantId, clienteId),
          getTurnosByClienteId(tenantId, clienteId),
        ]);
        if (completo) {
          const mascotas = completo.mascotas || (await getMascotas(tenantId, clienteId));
          const clienteFull = { ...completo, mascotas, historialDatos: (completo as Cliente & { historialDatos?: HistorialDato[] }).historialDatos } as Cliente;
          setClienteExpandido({
            cliente: clienteFull,
            mascotas,
            turnos,
          });
          if (mascotas.length > 0) setSelectedMascotaId(mascotas[0].id ?? null);
        }
      } catch (e) {
        console.error(e);
        toast({ title: "Error", description: "No se pudo cargar el cliente", variant: "destructive" });
      } finally {
        setLoadingCliente(false);
      }
    },
    [expandedClienteId, isMobile, toast]
  );

  const loadTimeline = useCallback(
    async (clienteId: string, mascotaId: string) => {
      if (!clienteExpandido) return;
      setLoadingTimeline(true);
      try {
        const [historias, turnosCliente] = await Promise.all([
          getHistorias(tenantId, clienteId, mascotaId),
          Promise.resolve(clienteExpandido.turnos),
        ]);
        const nombreMascota = (clienteExpandido.mascotas.find((m) => m.id === mascotaId)?.nombre ?? "").trim().toLowerCase();
        const turnosMascota = turnosCliente.filter((t) => {
          const tn = (t.mascota?.nombre ?? "").trim().toLowerCase();
          return t.mascotaId === mascotaId || tn === nombreMascota;
        });
        const timeline = buildTimeline(historias, turnosMascota);
        setTimelineData({ historias, turnos: turnosMascota, timeline });
      } catch (e) {
        console.error(e);
        toast({ title: "Error", description: "No se pudo cargar el historial", variant: "destructive" });
      } finally {
        setLoadingTimeline(false);
      }
    },
    [clienteExpandido, toast]
  );

  useEffect(() => {
    if (expandedClienteId && selectedMascotaId && clienteExpandido?.cliente.id) {
      loadTimeline(clienteExpandido.cliente.id, selectedMascotaId);
    } else {
      setTimelineData(null);
    }
  }, [expandedClienteId, selectedMascotaId, clienteExpandido?.cliente.id, loadTimeline]);

  const openEditCliente = (c: Cliente) => {
    setEditingCliente(c);
    setClienteForm({
      nombre: c.nombre ?? "",
      domicilio: c.domicilio ?? "",
      telefono: c.telefono ?? "",
      email: c.email ?? "",
    });
  };

  const saveCliente = async () => {
    if (!editingCliente?.id) return;
    setSavingCliente(true);
    try {
      await updateCliente(tenantId, editingCliente.id, {
        nombre: clienteForm.nombre,
        domicilio: clienteForm.domicilio,
        telefono: clienteForm.telefono,
        email: clienteForm.email,
      });
      toast({ title: "Cliente actualizado", description: "Los datos se guardaron correctamente" });
      setEditingCliente(null);
      if (clienteExpandido?.cliente.id === editingCliente.id) {
        setClienteExpandido((prev) =>
          prev ? { ...prev, cliente: { ...prev.cliente, ...clienteForm } } : null
        );
      }
      await loadClientes();
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "No se pudo guardar", variant: "destructive" });
    } finally {
      setSavingCliente(false);
    }
  };

  const openEditHistoria = (h: Historia, clienteId: string, mascotaId: string) => {
    if (isMobile) setDetailSheetOpen(false);
    setEditTipo("historia");
    setEditHistoria({ h, clienteId, mascotaId });
    setEditTurno(null);
    setFormHistoria({
      fechaAtencion: h.fechaAtencion ?? "",
      motivo: h.motivo ?? "",
      diagnostico: h.diagnostico ?? "",
      tratamiento: h.tratamiento ?? "",
      observaciones: h.observaciones ?? "",
      proximaVisita: h.proximaVisita ?? "",
      pesoActual: "",
      temperatura: "",
    });
    setTimeout(() => setEditEntradaOpen(true), isMobile ? 150 : 0);
  };

  const openEditTurno = (t: Turno) => {
    if (isMobile) setDetailSheetOpen(false);
    setEditTipo("turno");
    setEditTurno(t);
    setEditHistoria(null);
    const fechaStr = t.turno?.fecha || t.fecha || "";
    setFormTurno({
      fecha: fechaStr,
      hora: t.turno?.hora || t.hora || "",
      motivo: t.mascota?.motivo ?? "",
      diagnostico: t.diagnostico ?? "",
      tratamiento: t.tratamiento ?? "",
      medicacion: t.medicacion ?? "",
      observaciones: t.observaciones ?? "",
    });
    setTimeout(() => setEditEntradaOpen(true), isMobile ? 150 : 0);
  };

  const saveEntrada = async () => {
    if (editTipo === "historia" && editHistoria) {
      setSavingEntrada(true);
      try {
        const historiaPayload: Record<string, string> = {
          fechaAtencion: formHistoria.fechaAtencion,
          diagnostico: formHistoria.diagnostico,
          tratamiento: formHistoria.tratamiento,
        };
        if (formHistoria.motivo) historiaPayload.motivo = formHistoria.motivo;
        if (formHistoria.observaciones) historiaPayload.observaciones = formHistoria.observaciones;
        if (formHistoria.proximaVisita) historiaPayload.proximaVisita = formHistoria.proximaVisita;
        await updateHistoria(tenantId, editHistoria.clienteId, editHistoria.mascotaId, editHistoria.h.id!, historiaPayload);
        toast({ title: "Consulta actualizada" });
        setEditEntradaOpen(false);
        if (clienteExpandido?.cliente.id === editHistoria.clienteId && selectedMascotaId === editHistoria.mascotaId) {
          loadTimeline(editHistoria.clienteId, editHistoria.mascotaId);
        }
      } catch (e) {
        console.error("Error al actualizar historia:", e);
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar la consulta", variant: "destructive" });
      } finally {
        setSavingEntrada(false);
      }
    } else if (editTipo === "turno" && editTurno?.id) {
      setSavingEntrada(true);
      try {
        const payload: Partial<Turno> = {};
        if (formTurno.diagnostico) payload.diagnostico = formTurno.diagnostico;
        if (formTurno.tratamiento) payload.tratamiento = formTurno.tratamiento;
        if (formTurno.medicacion) payload.medicacion = formTurno.medicacion;
        if (formTurno.observaciones) payload.observaciones = formTurno.observaciones;
        const fechaStr = formTurno.fecha;
        const esFuturo = fechaStr ? new Date(fechaStr + "T12:00:00") > new Date() : false;
        if (esFuturo) {
          payload.fecha = fechaStr;
          payload.hora = formTurno.hora;
          payload.turno = { ...editTurno.turno, fecha: fechaStr, hora: formTurno.hora };
          if (editTurno.mascota) payload.mascota = { ...editTurno.mascota, motivo: formTurno.motivo };
        } else {
          payload.mascota = { ...editTurno.mascota, motivo: formTurno.motivo };
        }
        await updateTurno(tenantId, editTurno.id, payload);
        toast({ title: "Turno actualizado" });
        setEditEntradaOpen(false);
        if (clienteExpandido) {
          const turnos = await getTurnosByClienteId(tenantId, clienteExpandido.cliente.id!);
          setClienteExpandido((prev) => (prev ? { ...prev, turnos } : null));
          if (selectedMascotaId) loadTimeline(clienteExpandido.cliente.id!, selectedMascotaId);
        }
      } catch (e) {
        toast({ title: "Error", description: "No se pudo actualizar el turno. Revisá los datos e intentá de nuevo.", variant: "destructive" });
      } finally {
        setSavingEntrada(false);
      }
    }
  };

  const openAddNota = (cliente: Cliente, mascota: Mascota) => {
    const clienteId = cliente?.id ?? "";
    const mascotaId = mascota?.id ?? "";
    if (!clienteId || !mascotaId) {
      toast({ title: "Error", description: "No se pudo identificar cliente o mascota. Asegurate de que estén guardados con ID.", variant: "destructive" });
      return;
    }
    if (isMobile) setDetailSheetOpen(false);
    setAddNotaMascota({ cliente: { ...cliente, id: clienteId }, mascota: { ...mascota, id: mascotaId } });
    setFormNota({ ...emptyHistoriaForm, fechaAtencion: new Date().toISOString().slice(0, 10) });
    setArchivosNota([]);
    setTimeout(() => setAddNotaOpen(true), isMobile ? 150 : 0);
  };

  /** Abre el formulario de nota clínica precargado con datos del turno (desde Libreta). Al guardar, el turno se puede marcar completado desde Gestión de Turnos. */
  const openGenerarHistoriaFromTurno = (turno: Turno, cliente: Cliente, mascota: Mascota) => {
    const clienteId = cliente?.id ?? "";
    const mascotaId = mascota?.id ?? "";
    if (!clienteId || !mascotaId) return;
    setDetailModalOpen(false);
    setAddNotaMascota({ cliente: { ...cliente, id: clienteId }, mascota: { ...mascota, id: mascotaId } });
    const motivoInicial = turno.mascota?.motivo?.trim() || "Consulta";
    setFormNota({
      ...emptyHistoriaForm,
      fechaAtencion: turno.turno?.fecha ?? new Date().toISOString().slice(0, 10),
      motivo: motivoInicial,
      diagnostico: motivoInicial,
    });
    setAddNotaOpen(true);
  };

  const saveNota = async () => {
    if (!addNotaMascota?.cliente.id || !addNotaMascota?.mascota.id) {
      toast({ title: "Error", description: "No se pudo identificar cliente o mascota.", variant: "destructive" });
      return;
    }
    const diag = String(formNota.diagnostico ?? "").trim();
    if (!diag) {
      toast({
        title: "Campo obligatorio",
        description: "Completá el Diagnóstico (marcado con *).",
        variant: "destructive",
      });
      return;
    }
    const fecha = formNota.fechaAtencion?.trim() || new Date().toISOString().slice(0, 10);
    const partesObs: string[] = [];
    if (formNota.pesoActual?.trim()) partesObs.push(`Peso actual: ${formNota.pesoActual.trim()}`);
    if (formNota.temperatura?.trim()) partesObs.push(`Temperatura: ${formNota.temperatura.trim()} °C`);
    if (formNota.observaciones?.trim()) partesObs.push(`Observaciones: ${formNota.observaciones.trim()}`);
    const observacionesFinal = partesObs.length ? partesObs.join("\n") : "";
    const trat = String(formNota.tratamiento ?? "").trim();
    const motivoFinal = (formNota.motivo?.trim() || "Consulta general") as string;
    const proximaFinal = (formNota.proximaVisita?.trim() || "") as string;
    const payloadHistoria = {
      fechaAtencion: fecha,
      motivo: motivoFinal,
      diagnostico: diag,
      tratamiento: trat || "—",
      observaciones: observacionesFinal,
      proximaVisita: proximaFinal,
    };

    setSavingNota(true);
    try {
      // Upload archivos si hay
      let archivosUrls: string[] | undefined;
      if (archivosNota.length > 0) {
        setUploadingArchivos(true);
        try {
          archivosUrls = await Promise.all(
            archivosNota.map((file) =>
              uploadArchivoHistoria(tenantId, addNotaMascota.cliente.id!, addNotaMascota.mascota.id!, file)
            )
          );
        } finally {
          setUploadingArchivos(false);
        }
      }
      await createHistoria(tenantId, addNotaMascota.cliente.id, addNotaMascota.mascota.id, {
        ...payloadHistoria,
        ...(archivosUrls?.length ? { archivos: archivosUrls } : {}),
      } as typeof payloadHistoria);
      toast({ title: "Nota clínica agregada" });
      setAddNotaOpen(false);
      setAddNotaMascota(null);
      setFormNota(emptyHistoriaForm);
      setArchivosNota([]);
      if (clienteExpandido?.cliente.id === addNotaMascota.cliente.id && selectedMascotaId === addNotaMascota.mascota.id) {
        loadTimeline(addNotaMascota.cliente.id, addNotaMascota.mascota.id);
      }
    } catch (e) {
      console.error(e);
      toast({
        title: "Error al guardar",
        description: "Verificá que Diagnóstico y Tratamiento estén completos e intentá de nuevo.",
        variant: "destructive",
      });
    } finally {
      setSavingNota(false);
    }
  };

  const openAddArchivo = (cliente: Cliente, mascota: Mascota) => {
    const clienteId = cliente?.id ?? "";
    const mascotaId = mascota?.id ?? "";
    if (!clienteId || !mascotaId) {
      toast({ title: "Error", description: "No se pudo identificar cliente o mascota.", variant: "destructive" });
      return;
    }
    if (isMobile) setDetailSheetOpen(false);
    setAddArchivoMascota({ cliente: { ...cliente, id: clienteId }, mascota: { ...mascota, id: mascotaId } });
    setArchivoTitulo("");
    setArchivoDescripcion("");
    setArchivoFile(null);
    setTimeout(() => setAddArchivoOpen(true), isMobile ? 150 : 0);
  };

  /** Sube un único adjunto (imagen o PDF) como una entrada mínima de la libreta, sin el formulario clínico completo. */
  const saveArchivo = async () => {
    if (!addArchivoMascota?.cliente.id || !addArchivoMascota?.mascota.id) return;
    const titulo = archivoTitulo.trim();
    if (!titulo) {
      toast({ title: "Completá el título", variant: "destructive" });
      return;
    }
    if (!archivoFile) {
      toast({ title: "Elegí un archivo", variant: "destructive" });
      return;
    }
    setSavingArchivo(true);
    try {
      const url = await uploadArchivoHistoria(
        tenantId,
        addArchivoMascota.cliente.id,
        addArchivoMascota.mascota.id,
        archivoFile
      );
      await createHistoria(tenantId, addArchivoMascota.cliente.id, addArchivoMascota.mascota.id, {
        fechaAtencion: new Date().toISOString().slice(0, 10),
        motivo: titulo,
        diagnostico: titulo,
        tratamiento: "—",
        observaciones: archivoDescripcion.trim(),
        archivos: [url],
      } as Omit<Historia, "id">);
      toast({ title: "Archivo adjuntado" });
      setAddArchivoOpen(false);
      setAddArchivoMascota(null);
      if (clienteExpandido?.cliente.id === addArchivoMascota.cliente.id && selectedMascotaId === addArchivoMascota.mascota.id) {
        loadTimeline(addArchivoMascota.cliente.id, addArchivoMascota.mascota.id);
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo subir el archivo", variant: "destructive" });
    } finally {
      setSavingArchivo(false);
    }
  };

  const handleSaveInline = async () => {
    if (!clienteExpandido?.cliente.id || !inlineEditField) return;
    setSavingCliente(true);
    try {
      await updateCliente(tenantId, clienteExpandido.cliente.id, {
        [inlineEditField]: inlineValues[inlineEditField],
      });
      setClienteExpandido((prev) =>
        prev ? { ...prev, cliente: { ...prev.cliente, [inlineEditField]: inlineValues[inlineEditField] } } : null
      );
      setInlineEditField(null);
      toast({ title: "Dato actualizado" });
    } catch (e) {
      toast({ title: "Error al guardar", variant: "destructive" });
    } finally {
      setSavingCliente(false);
    }
  };

  const startInlineEdit = (field: "domicilio" | "telefono") => {
    const value = clienteExpandido?.cliente[field] ?? "";
    setInlineValues((v) => ({ ...v, [field]: value }));
    setInlineEditField(field);
  };

  const detailContent = clienteExpandido ? (
    <>
      {loadingCliente ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Cabecera: avatar, nombre, acciones */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="h-12 w-12 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-slate-700 dark:text-slate-200 font-bold text-lg shrink-0">
              {getIniciales(clienteExpandido.cliente.nombre ?? "")}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 dark:text-slate-100 text-lg">{clienteExpandido.cliente.nombre}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">DNI {clienteExpandido.cliente.dni}</p>
            </div>
            <div className="flex items-center gap-1">
              <a
                href={`tel:${clienteExpandido.cliente.telefono}`}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800/50"
                title="Llamar"
              >
                <Phone className="h-4 w-4" />
              </a>
              <a
                href={getWhatsAppUrl(clienteExpandido.cliente.telefono ?? "")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800/50"
                title="WhatsApp"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Contacto editable inline */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Contacto</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                {inlineEditField === "domicilio" ? (
                  <div className="flex-1 flex gap-2 flex-wrap">
                    <Input
                      value={inlineValues.domicilio}
                      onChange={(e) => setInlineValues((v) => ({ ...v, domicilio: e.target.value }))}
                      className="h-8 text-sm flex-1 min-w-[160px]"
                      placeholder="Dirección"
                    />
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-8" onClick={() => setInlineEditField(null)}>Cancelar</Button>
                      <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700" onClick={handleSaveInline} disabled={savingCliente}>
                        {savingCliente ? <Loader2 className="h-3 w-3 animate-spin" /> : "Guardar"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{clienteExpandido.cliente.domicilio || "—"}</span>
                    <button type="button" onClick={() => startInlineEdit("domicilio")} className="p-1 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700" title="Editar"><Edit3 className="h-3.5 w-3.5" /></button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                {inlineEditField === "telefono" ? (
                  <div className="flex-1 flex gap-2 flex-wrap">
                    <Input
                      value={inlineValues.telefono}
                      onChange={(e) => setInlineValues((v) => ({ ...v, telefono: e.target.value }))}
                      className="h-8 text-sm flex-1 min-w-[120px]"
                      placeholder="Teléfono"
                    />
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-8" onClick={() => setInlineEditField(null)}>Cancelar</Button>
                      <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700" onClick={handleSaveInline} disabled={savingCliente}>
                        {savingCliente ? <Loader2 className="h-3 w-3 animate-spin" /> : "Guardar"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{clienteExpandido.cliente.telefono}</span>
                    <button type="button" onClick={() => startInlineEdit("telefono")} className="p-1 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700" title="Editar"><Edit3 className="h-3.5 w-3.5" /></button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-700 dark:text-slate-300 break-all">{clienteExpandido.cliente.email}</span>
              </div>
            </div>
          </div>

          {/* Historial de cambios (acordeón cerrado por defecto) */}
          {(clienteExpandido.cliente as Cliente & { historialDatos?: HistorialDato[] }).historialDatos?.length ? (
            <Collapsible open={historialOpen} onOpenChange={setHistorialOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 p-3 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Historial de cambios</p>
                </div>
                <ChevronDown className={`h-4 w-4 text-slate-500 dark:text-slate-400 transition-transform ${historialOpen ? "rotate-180" : ""}`} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 space-y-2 max-h-32 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 border-t-0 rounded-t-none bg-slate-50/30 dark:bg-slate-800/20 p-2">
                  {((clienteExpandido.cliente as Cliente & { historialDatos?: HistorialDato[] }).historialDatos ?? []).map((h, idx) => (
                    <div key={idx} className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs">
                      <div className="flex justify-between mb-0.5">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">{h.campo}</span>
                        <span className="text-slate-500">{new Date(h.fechaCambio).toLocaleDateString("es-AR")}</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">Antes: {h.valorAnterior || "—"}</p>
                      <p className="text-slate-700 dark:text-slate-300">Ahora: {h.valorNuevo || "—"}</p>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}

          {/* Mascotas: chips horizontales (2 + N más si hay >3) */}
          {clienteExpandido.mascotas.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">Sin mascotas registradas</p>
          ) : (
            <div className="w-full space-y-3">
              <div className="flex items-center gap-2 flex-nowrap overflow-x-auto pb-1 min-h-[36px]">
                {(showAllMascotasChips || clienteExpandido.mascotas.length <= 3
                  ? clienteExpandido.mascotas
                  : clienteExpandido.mascotas.slice(0, 2)
                ).map((m) => {
                  const Icon = getMascotaIcon(m.tipo ?? "");
                  const proximos = countProximosTurnos(clienteExpandido.turnos, m.id ?? "", m.nombre ?? "");
                  const isActive = selectedMascotaId === (m.id ?? "");
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMascotaId(m.id ?? "")}
                      className={`flex items-center gap-1.5 shrink-0 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors ${isActive ? "bg-emerald-600 text-white border-emerald-600" : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{m.nombre} – {m.tipo}</span>
                      {proximos > 0 && <Badge className="ml-0.5 h-4 min-w-[18px] px-1 text-[10px] bg-amber-500 text-white border-0">{proximos}</Badge>}
                    </button>
                  );
                })}
                {!showAllMascotasChips && clienteExpandido.mascotas.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllMascotasChips(true)}
                    className="shrink-0 rounded-full border border-slate-300 dark:border-slate-600 bg-slate-200/80 dark:bg-slate-700/80 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
                  >
                    +{clienteExpandido.mascotas.length - 2} más
                  </button>
                )}
              </div>
              <div className="min-h-0">
                {selectedMascotaId && (() => {
                  const m = clienteExpandido.mascotas.find((x) => x.id === selectedMascotaId);
                  if (!m) return null;
                  const Icon = getMascotaIcon(m.tipo ?? "");
                  const proximos = countProximosTurnos(clienteExpandido.turnos, m.id ?? "", m.nombre ?? "");
                  const visitasReales = (timelineData?.historias ?? []).filter((h) => h.tipoVisita !== "turno_programado");
                  const turnosMascota = timelineData?.turnos ?? [];
                  const visitasFiltradas = filtroArchivos === "todos"
                    ? visitasReales
                    : visitasReales.filter((h) =>
                        (h.archivos ?? []).some((url) =>
                          filtroArchivos === "imagenes" ? esImagenUrl(url) : esPdfUrl(url)
                        )
                      );
                  const historiasPorFecha = (() => {
                    const byDate = new Map<string, Historia[]>();
                    visitasFiltradas.forEach((h) => {
                      const key = h.fechaAtencion ?? "";
                      if (!byDate.has(key)) byDate.set(key, []);
                      byDate.get(key)!.push(h);
                    });
                    return Array.from(byDate.entries()).sort((a, b) => b[0].localeCompare(a[0]));
                  })();

                  return (
                    <div className="space-y-3">
                      {/* Cabecera mascota: Nombre - Raza - Edad - Peso + contadores + botón + */}
                      <div className="flex items-center gap-2 flex-wrap rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900 shadow-sm">
                        <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                          <Icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{m.nombre} · {m.tipo}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{[m.raza, m.edad, m.peso].filter(Boolean).join(" · ") || "Sin datos"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">{visitasReales.length} visitas</Badge>
                          {proximos > 0 && <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-0">{proximos} próximo{proximos !== 1 ? "s" : ""}</Badge>}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-11 w-11 p-0 rounded-xl border-2 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 shrink-0"
                            onClick={() => generarLibretaPDF(clienteExpandido.cliente, m, visitasReales)}
                            title="Descargar libreta en PDF"
                          >
                            <FileDown className="h-5 w-5" />
                          </Button>
                          {clienteExpandido.cliente.id && m.id && (
                            <QrLibretaButton
                              tenantId={tenantId}
                              clienteId={clienteExpandido.cliente.id}
                              mascotaId={m.id}
                            />
                          )}
                          {clienteExpandido.cliente.id && m.id && (
                            <RecordatorioVacunaButton
                              tenantId={tenantId}
                              clienteId={clienteExpandido.cliente.id}
                              mascotaId={m.id}
                              mascotaNombre={m.nombre ?? ""}
                              telefono={clienteExpandido.cliente.telefono ?? ""}
                            />
                          )}
                          <Button size="sm" variant="outline" className="h-11 w-11 p-0 rounded-xl border-2 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 shrink-0" onClick={() => openAddArchivo(clienteExpandido.cliente, m)} title="Subir archivo adjunto"><Paperclip className="h-5 w-5" /></Button>
                          <Button size="sm" className="h-11 w-11 p-0 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg hover:shadow-emerald-500/30 transition-all shrink-0" onClick={() => openAddNota(clienteExpandido.cliente, m)} title="Agregar nota clínica"><Plus className="h-6 w-6" /></Button>
                        </div>
                      </div>

                      {/* Tabs: Historia Clínica (default) | Turnos */}
                      <Tabs value={mascotaContentTab} onValueChange={(v) => setMascotaContentTab(v as "historia" | "turnos")} className="w-full">
                        <TabsList className="grid w-full grid-cols-2 h-9 bg-slate-200/80 dark:bg-slate-800/80">
                          <TabsTrigger value="historia" className="text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">Historia Clínica</TabsTrigger>
                          <TabsTrigger value="turnos" className="text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">Turnos</TabsTrigger>
                        </TabsList>

                        <TabsContent value="historia" className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3 max-h-[340px] overflow-y-auto bg-slate-50/30 dark:bg-slate-800/20">
                          {visitasReales.length > 0 && (
                            <div className="flex items-center gap-1.5 mb-3">
                              {([
                                { value: "todos", label: "Todo" },
                                { value: "imagenes", label: "Imágenes" },
                                { value: "pdf", label: "PDFs" },
                              ] as const).map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => setFiltroArchivos(opt.value)}
                                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                    filtroArchivos === opt.value
                                      ? "bg-emerald-600 text-white border-emerald-600"
                                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                          {loadingTimeline ? (
                            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
                          ) : visitasFiltradas.length === 0 ? filtroArchivos !== "todos" ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
                              Sin {filtroArchivos === "imagenes" ? "imágenes" : "PDFs"} adjuntos para esta mascota.
                            </p>
                          ) : (
                            <div className="flex flex-col items-center justify-center py-10">
                              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Sin visitas registradas para esta mascota.</p>
                              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white h-11 px-6 rounded-xl shadow-lg" onClick={() => openAddNota(clienteExpandido.cliente, m)}>
                                <Plus className="h-5 w-5 mr-2" />
                                + Añadir nota clínica
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {historiasPorFecha.map(([fechaStr, entradas]) => (
                                <div key={fechaStr} className="space-y-2">
                                  <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                                    {fechaStr ? new Date(fechaStr + "T00:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "—"}
                                  </p>
                                  {entradas.map((h) => (
                                    <div key={h.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm space-y-2">
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{h.motivo || "Consulta"}</p>
                                        <div className="flex items-center gap-0.5 shrink-0">
                                          <button type="button" className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { if (isMobile) setDetailSheetOpen(false); setDetailModalItem({ type: "historia", data: h }); setTimeout(() => setDetailModalOpen(true), isMobile ? 150 : 0); }} title="Ver detalles"><Eye className="h-3.5 w-3.5" /></button>
                                          <button type="button" className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => openEditHistoria(h, clienteExpandido.cliente.id!, m.id!)} title="Editar"><Edit3 className="h-3.5 w-3.5" /></button>
                                        </div>
                                      </div>
                                      <div className="text-xs text-slate-600 dark:text-slate-400">
                                        <p><span className="font-semibold">Diagnóstico:</span> {(h.diagnostico || "—").slice(0, 120)}{(h.diagnostico?.length ?? 0) > 120 ? "…" : ""}</p>
                                        <p className="mt-0.5"><span className="font-semibold">Tratamiento:</span> {(h.tratamiento || "—").slice(0, 120)}{(h.tratamiento?.length ?? 0) > 120 ? "…" : ""}</p>
                                        {h.archivos && h.archivos.length > 0 && (() => {
                                          const visibles = filtroArchivos === "todos"
                                            ? h.archivos
                                            : h.archivos.filter((url) => filtroArchivos === "imagenes" ? esImagenUrl(url) : esPdfUrl(url));
                                          if (visibles.length === 0) return null;
                                          return (
                                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                              {visibles.map((url, i) =>
                                                esImagenUrl(url) ? (
                                                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                                    <img src={url} alt="Adjunto" className="h-12 w-12 rounded object-cover border border-slate-200 dark:border-slate-700" />
                                                  </a>
                                                ) : (
                                                  <a
                                                    key={i}
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1 h-12 px-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] text-emerald-700 dark:text-emerald-400"
                                                  >
                                                    <Paperclip className="h-3 w-3" />
                                                    {esPdfUrl(url) ? "PDF" : "Archivo"}
                                                  </a>
                                                )
                                              )}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="turnos" className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3 max-h-[340px] overflow-y-auto bg-slate-50/30 dark:bg-slate-800/20">
                          {loadingTimeline ? (
                            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
                          ) : turnosMascota.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10">
                              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">No hay turnos para esta mascota.</p>
                              <p className="text-xs text-slate-400">Los turnos se agendan desde Gestión de Turnos.</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {turnosMascota.map((t) => {
                                const fechaStr = t.turno?.fecha || t.fecha || "";
                                const fecha = fechaStr ? new Date(fechaStr + "T12:00:00") : null;
                                const esFuturo = fecha && fecha > new Date();
                                const historiaAsociada = (timelineData?.historias ?? []).find((h) => h.fechaAtencion === fechaStr) ?? null;
                                const openDetailTurno = () => {
                                  if (isMobile) setDetailSheetOpen(false);
                                  setDetailModalItem({ type: "turno", data: t });
                                  setDetailTurnoHistoriaAsociada(historiaAsociada);
                                  setTimeout(() => setDetailModalOpen(true), isMobile ? 150 : 0);
                                };
                                return (
                                  <div key={t.id} className={`rounded-xl border p-3 shadow-sm ${t.estado === "cancelado" ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800 opacity-70" : esFuturo ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 border-dashed" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"}`}>
                                    <div className="flex items-start justify-between gap-2">
                                      <div
                                        className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                                        onClick={openDetailTurno}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetailTurno(); } }}
                                      >
                                        {t.estado === "cancelado" ? <XCircle className="h-4 w-4 text-red-500 shrink-0" /> : esFuturo ? <Clock className="h-4 w-4 text-amber-600 shrink-0" /> : <Check className="h-4 w-4 text-emerald-600 shrink-0" />}
                                        <div>
                                          <p className={`text-xs font-semibold ${t.estado === "cancelado" ? "line-through text-slate-500 dark:text-slate-400" : "text-slate-900 dark:text-slate-100"}`}>{fecha ? fecha.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" }) : "—"}{t.turno?.hora ? ` · ${t.turno.hora}` : ""}</p>
                                          <p className="text-[11px] text-slate-600 dark:text-slate-400">{t.estado === "cancelado" ? "Cancelado" : esFuturo ? "Próximo turno" : "Realizado"} {t.servicio && `· ${t.servicio}`}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-0.5 shrink-0">
                                        {t.estado === "completado" && historiaAsociada && (
                                          <button type="button" className="p-1.5 rounded hover:bg-teal-100 dark:hover:bg-teal-900/40" onClick={(e) => { e.stopPropagation(); if (isMobile) setDetailSheetOpen(false); setDetailModalItem({ type: "historia", data: historiaAsociada }); setDetailTurnoHistoriaAsociada(null); setTimeout(() => setDetailModalOpen(true), isMobile ? 150 : 0); }} title="Ver Nota Clínica"><FileText className="h-3.5 w-3.5 text-teal-600" /></button>
                                        )}
                                        {t.estado === "pendiente" && (
                                          <button type="button" className="p-1.5 rounded hover:bg-teal-100 dark:hover:bg-teal-900/40" onClick={(e) => { e.stopPropagation(); openGenerarHistoriaFromTurno(t, clienteExpandido.cliente, m); }} title="Generar Historia Clínica"><FileText className="h-3.5 w-3.5 text-teal-600" /></button>
                                        )}
                                        <button type="button" className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" onClick={(e) => { e.stopPropagation(); openDetailTurno(); }} title="Ver detalles"><Eye className="h-3.5 w-3.5" /></button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </TabsContent>
                      </Tabs>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  ) : null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-2 sm:p-3 md:p-4">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 h-[calc(100vh-180px)] min-h-[400px]">
        {/* Panel izquierdo: lista */}
        <div className="md:col-span-4 flex flex-col border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
          <div className="p-2 sm:p-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input placeholder="Buscar por DNI o nombre..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-8 h-9 text-sm border-slate-300 dark:border-slate-700" />
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{filtered.length} de {total}</p>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-2 space-y-1">
              {loading && !clientes.length ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
              ) : filtered.length === 0 ? (
                <div className="py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                  <User className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>{searchInput.trim() ? "No hay resultados" : "No hay clientes con DNI"}</p>
                </div>
              ) : (
                paginated.map((c) => {
                  const isActive = expandedClienteId === c.id;
                  const resumenMascotas = c.id ? mascotasResumen[c.id] : undefined;
                  const totalMascotas = resumenMascotas?.count;
                  const nombresMascotas = (resumenMascotas?.names ?? []).slice(0, 3);
                  const textoMascotas =
                    totalMascotas === undefined
                      ? "Mascotas: ..."
                      : `Mascotas: ${totalMascotas}${
                          nombresMascotas.length
                            ? ` · ${nombresMascotas.join(", ")}${totalMascotas > 3 ? " ..." : ""}`
                            : ""
                        }`;
                  return (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => c.id && selectCliente(c.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c.id && selectCliente(c.id); } }}
                      className={`flex items-center gap-2 p-2.5 rounded-lg cursor-pointer transition-all ${isActive ? "bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-500 dark:border-emerald-500" : "hover:bg-slate-50 dark:hover:bg-slate-800/50 border-2 border-transparent"}`}
                    >
                      <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-slate-700 dark:text-slate-200 font-semibold text-xs shrink-0">
                        {getIniciales(c.nombre ?? "")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 dark:text-slate-100 truncate text-sm">{c.nombre}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">DNI {c.dni}</p>
                        <p
                          className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5"
                          title={(resumenMascotas?.names ?? []).join(", ")}
                        >
                          {textoMascotas}
                        </p>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 ${isActive ? "text-emerald-600" : "text-slate-400"}`} />
                    </div>
                  );
                })
              )}
              {!loading && filtered.length > paginated.length && (
                <div className="pt-2 flex justify-center">
                  <Button variant="outline" size="sm" className="text-xs" onClick={loadMore}>Cargar más</Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Panel derecho: detalle o empty */}
        <div className="hidden md:flex md:col-span-8 flex-col border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-4">
              {!expandedClienteId ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 dark:text-slate-400">
                  <FileText className="h-14 w-14 mb-4 opacity-40" />
                  <p className="text-sm font-medium">Seleccioná un cliente de la lista</p>
                  <p className="text-xs mt-1">Sus datos, historial de cambios y libreta clínica aparecerán aquí.</p>
                </div>
              ) : (
                detailContent
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Sheet móvil: detalle */}
      <Sheet open={detailSheetOpen && isMobile} onOpenChange={(open) => { if (!open) setDetailSheetOpen(false); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="sr-only">
            <SheetTitle>Detalle del cliente</SheetTitle>
            <SheetDescription>Información del cliente y su libreta sanitaria</SheetDescription>
          </SheetHeader>
          <div className="pt-6">
            {expandedClienteId && detailContent}
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal Ver Detalles (estilo espejo de TurnoDetailsModal) */}
      {detailModalOpen && detailModalItem && clienteExpandido && selectedMascotaId && (() => {
        const mascota = clienteExpandido.mascotas.find((x) => x.id === selectedMascotaId);
        if (!mascota) return null;
        const turno = detailModalItem.type === "turno" ? (detailModalItem.data as Turno) : null;
        return (
          <LibretaDetallesModal
            open={detailModalOpen}
            onOpenChange={(open) => {
              setDetailModalOpen(open);
              if (!open && isMobile && expandedClienteId) setDetailSheetOpen(true);
            }}
            tipo={detailModalItem.type}
            cliente={clienteExpandido.cliente}
            mascota={mascota}
            entrada={detailModalItem.data}
            historiaAsociada={detailModalItem.type === "turno" ? detailTurnoHistoriaAsociada : undefined}
            onEdit={() => {
              if (detailModalItem.type === "historia") {
                openEditHistoria(detailModalItem.data as Historia, clienteExpandido.cliente.id!, selectedMascotaId);
              } else {
                openEditTurno(detailModalItem.data as Turno);
              }
            }}
            onVerNotaClinica={detailModalItem.type === "turno" && detailTurnoHistoriaAsociada
              ? () => {
                  setDetailModalItem({ type: "historia", data: detailTurnoHistoriaAsociada! });
                  setDetailTurnoHistoriaAsociada(null);
                }
              : undefined}
            onGenerarHistoria={detailModalItem.type === "turno" && turno?.estado === "pendiente"
              ? () => openGenerarHistoriaFromTurno(turno, clienteExpandido.cliente, mascota)
              : undefined}
          />
        );
      })()}

      {/* Modal editar cliente */}
      <Dialog open={!!editingCliente} onOpenChange={(open) => !open && setEditingCliente(null)}>
        <DialogContent className="sm:max-w-md border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-900 dark:text-slate-100">
              Editar datos del cliente
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600 dark:text-slate-400">
              Los cambios se guardan en Firestore.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-semibold">Nombre</Label>
              <Input
                value={clienteForm.nombre}
                onChange={(e) => setClienteForm((f) => ({ ...f, nombre: e.target.value }))}
                className="mt-1 border-slate-300 dark:border-slate-700 h-9"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Dirección</Label>
              <Input
                value={clienteForm.domicilio}
                onChange={(e) => setClienteForm((f) => ({ ...f, domicilio: e.target.value }))}
                className="mt-1 border-slate-300 dark:border-slate-700 h-9"
                placeholder="Domicilio"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Teléfono</Label>
              <Input
                value={clienteForm.telefono}
                onChange={(e) => setClienteForm((f) => ({ ...f, telefono: e.target.value }))}
                className="mt-1 border-slate-300 dark:border-slate-700 h-9"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Email</Label>
              <Input
                type="email"
                value={clienteForm.email}
                onChange={(e) => setClienteForm((f) => ({ ...f, email: e.target.value }))}
                className="mt-1 border-slate-300 dark:border-slate-700 h-9"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCliente(null)}>
              Cancelar
            </Button>
            <Button onClick={saveCliente} disabled={savingCliente} className="bg-emerald-600 hover:bg-emerald-700">
              {savingCliente ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal editar entrada (historia o turno) */}
      <Dialog open={editEntradaOpen} onOpenChange={(open) => {
          setEditEntradaOpen(open);
          if (!open && isMobile && expandedClienteId) setDetailSheetOpen(true);
        }}>
        <DialogContent className="sm:max-w-lg border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-900 dark:text-slate-100">
              {editTipo === "historia" ? "Editar consulta" : "Editar turno"}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600 dark:text-slate-400">
              {editTipo === "turno" && editTurno
                ? new Date((editTurno.turno?.fecha || editTurno.fecha || "") + "T12:00:00") > new Date()
                  ? "Turno futuro: podés cambiar fecha y motivo."
                  : "Turno pasado: podés completar diagnóstico, tratamiento, medicación y observaciones."
                : "Modificá los datos de la consulta."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {editTipo === "historia" ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Fecha</Label>
                    <Input
                      type="date"
                      value={formHistoria.fechaAtencion}
                      onChange={(e) => setFormHistoria((f) => ({ ...f, fechaAtencion: e.target.value }))}
                      className="mt-1 h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Motivo</Label>
                    <Input
                      value={formHistoria.motivo}
                      onChange={(e) => setFormHistoria((f) => ({ ...f, motivo: e.target.value }))}
                      className="mt-1 h-9"
                      placeholder="Motivo"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Diagnóstico</Label>
                  <Textarea
                    value={formHistoria.diagnostico}
                    onChange={(e) => setFormHistoria((f) => ({ ...f, diagnostico: e.target.value }))}
                    className="mt-1 min-h-[60px] text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Tratamiento</Label>
                  <Textarea
                    value={formHistoria.tratamiento}
                    onChange={(e) => setFormHistoria((f) => ({ ...f, tratamiento: e.target.value }))}
                    className="mt-1 min-h-[60px] text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Observaciones</Label>
                  <Textarea
                    value={formHistoria.observaciones}
                    onChange={(e) => setFormHistoria((f) => ({ ...f, observaciones: e.target.value }))}
                    className="mt-1 min-h-[50px] text-sm"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Fecha</Label>
                    <Input
                      type="date"
                      value={formTurno.fecha}
                      onChange={(e) => setFormTurno((f) => ({ ...f, fecha: e.target.value }))}
                      className="mt-1 h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Hora</Label>
                    <Input
                      value={formTurno.hora}
                      onChange={(e) => setFormTurno((f) => ({ ...f, hora: e.target.value }))}
                      className="mt-1 h-9"
                      placeholder="Ej. 10:00"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Motivo</Label>
                  <Input
                    value={formTurno.motivo}
                    onChange={(e) => setFormTurno((f) => ({ ...f, motivo: e.target.value }))}
                    className="mt-1 h-9"
                    placeholder="Motivo del turno"
                  />
                </div>
                {editTurno && new Date((editTurno.turno?.fecha || editTurno.fecha || "") + "T12:00:00") <= new Date() && (
                  <>
                    <div>
                      <Label className="text-xs">Diagnóstico</Label>
                      <Textarea
                        value={formTurno.diagnostico}
                        onChange={(e) => setFormTurno((f) => ({ ...f, diagnostico: e.target.value }))}
                        className="mt-1 min-h-[60px] text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Tratamiento</Label>
                      <Textarea
                        value={formTurno.tratamiento}
                        onChange={(e) => setFormTurno((f) => ({ ...f, tratamiento: e.target.value }))}
                        className="mt-1 min-h-[60px] text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Medicación</Label>
                      <Textarea
                        value={formTurno.medicacion}
                        onChange={(e) => setFormTurno((f) => ({ ...f, medicacion: e.target.value }))}
                        className="mt-1 min-h-[50px] text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Observaciones</Label>
                      <Textarea
                        value={formTurno.observaciones}
                        onChange={(e) => setFormTurno((f) => ({ ...f, observaciones: e.target.value }))}
                        className="mt-1 min-h-[50px] text-sm"
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntradaOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveEntrada} disabled={savingEntrada} className="bg-emerald-600 hover:bg-emerald-700">
              {savingEntrada ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Nueva Nota Clínica */}
      <Dialog open={addNotaOpen} onOpenChange={(open) => {
          if (!open) {
            setAddNotaMascota(null);
            if (isMobile && expandedClienteId) setDetailSheetOpen(true);
          }
        }}>
        <DialogContent className="sm:max-w-lg border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
              Nueva entrada
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 dark:text-slate-400">
              {addNotaMascota ? `${addNotaMascota.cliente.nombre} – ${addNotaMascota.mascota.nombre}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3 mt-2">
              <div>
                <Label className="text-xs font-semibold">Diagnóstico *</Label>
                <Textarea
                  value={formNota.diagnostico}
                  onChange={(e) => setFormNota((f) => ({ ...f, diagnostico: e.target.value }))}
                  className="mt-1 min-h-[72px] text-sm"
                  placeholder="Breve diagnóstico..."
                />
              </div>
              <div>
                <Label className="text-xs">Tratamiento</Label>
                <Textarea
                  value={formNota.tratamiento}
                  onChange={(e) => setFormNota((f) => ({ ...f, tratamiento: e.target.value }))}
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
                    value={(formNota as { pesoActual?: string }).pesoActual ?? ""}
                    onChange={(e) => setFormNota((f) => ({ ...f, pesoActual: e.target.value }))}
                    className="mt-1 h-9"
                    placeholder="Ej. 12.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">Temperatura (°C)</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={(formNota as { temperatura?: string }).temperatura ?? ""}
                    onChange={(e) => setFormNota((f) => ({ ...f, temperatura: e.target.value }))}
                    className="mt-1 h-9"
                    placeholder="Opcional"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Observaciones privadas</Label>
                <Textarea
                  value={formNota.observaciones}
                  onChange={(e) => setFormNota((f) => ({ ...f, observaciones: e.target.value }))}
                  className="mt-1 min-h-[60px] text-sm"
                  placeholder="Notas adicionales (opcional)"
                />
              </div>
              {/* Adjuntos */}
              <div>
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5" />
                  Adjuntos
                </Label>
                <div className="mt-1.5 space-y-2">
                  <label className="flex items-center gap-2 p-3 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-emerald-400 dark:hover:border-emerald-600 cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-800/30">
                    <Upload className="h-4 w-4 text-slate-400" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Arrastrá o hacé click para adjuntar fotos, videos o PDFs
                    </span>
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        if (files.length > 0) setArchivosNota((prev) => [...prev, ...files]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {archivosNota.length > 0 && (
                    <div className="space-y-1">
                      {archivosNota.map((file, idx) => {
                        const isImage = file.type.startsWith("image/");
                        const isVideo = file.type.startsWith("video/");
                        const FileIcon = isImage ? Image : isVideo ? Film : File;
                        return (
                          <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                            <FileIcon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                            <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{file.name}</span>
                            <span className="text-slate-400 shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                            <button
                              type="button"
                              onClick={() => setArchivosNota((prev) => prev.filter((_, i) => i !== idx))}
                              className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddNotaOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveNota} disabled={savingNota} className="bg-emerald-600 hover:bg-emerald-700">
              {savingNota ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {uploadingArchivos ? "Subiendo archivos..." : "Guardar nota"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Subir archivo adjunto (imagen o PDF suelto, sin el formulario clínico completo) */}
      <Dialog open={addArchivoOpen} onOpenChange={(open) => {
          setAddArchivoOpen(open);
          if (!open) {
            setAddArchivoMascota(null);
            if (isMobile && expandedClienteId) setDetailSheetOpen(true);
          }
        }}>
        <DialogContent className="sm:max-w-md border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Paperclip className="h-4 w-4" /> Subir archivo adjunto
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 dark:text-slate-400">
              {addArchivoMascota ? `${addArchivoMascota.cliente.nombre} – ${addArchivoMascota.mascota.nombre}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-semibold">Título *</Label>
              <Input
                value={archivoTitulo}
                onChange={(e) => setArchivoTitulo(e.target.value)}
                className="mt-1 h-9"
                placeholder="Ej. Radiografía de tórax"
              />
            </div>
            <div>
              <Label className="text-xs">Descripción (opcional)</Label>
              <Textarea
                value={archivoDescripcion}
                onChange={(e) => setArchivoDescripcion(e.target.value)}
                className="mt-1 min-h-[60px] text-sm"
                placeholder="Detalle breve del estudio o documento..."
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Archivo *</Label>
              <label className="mt-1 flex items-center gap-2 p-3 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-emerald-400 dark:hover:border-emerald-600 cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-800/30">
                <Upload className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate flex-1">
                  {archivoFile ? archivoFile.name : "Elegí una imagen o un PDF"}
                </span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => setArchivoFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddArchivoOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveArchivo} disabled={savingArchivo} className="bg-emerald-600 hover:bg-emerald-700">
              {savingArchivo ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {savingArchivo ? "Subiendo..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster />
    </div>
  );
}
