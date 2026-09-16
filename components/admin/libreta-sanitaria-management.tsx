"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  getMascotasBasicByClienteIds,
  getHistorias,
  getTurnosByClienteId,
  getTenantConfig,
  getProductos,
  getProductoPorId,
  createHistoria,
  updateHistoria,
  updateCliente,
  updateTurno,
  updateMascota,
} from "@/lib/supabase/queries";
import type { Cliente, Mascota, Historia, Turno, HistorialDato, SexoMascota, Producto, AplicacionHistoria } from "@/lib/supabase/queries";
import type { Venta } from "@/lib/supabase/types";
import { getVentas } from "@/lib/supabase/ventas";
import { getSaldoCliente } from "@/lib/supabase/cuentaCorriente";
import { uploadArchivoHistoria, uploadFotoTenant } from "@/lib/supabase/storage";
import { MASCOTAS_DEFAULT } from "@/lib/turno-defaults";
import { formatearEdad, type UnidadEdad } from "@/lib/mascotas/edad";
import { format } from "date-fns";
import { generarLibretaPDF, type VeterinariaLibreta } from "@/lib/pdf/libreta-pdf";
import { generarComprobanteVeterinario } from "@/lib/pdf/comprobante-veterinario";
import { useAuth } from "@/hooks/use-auth";
import { useCarritoCompartido } from "@/hooks/pos/useCarritoCompartido";
import {
  agregarAlCarrito,
  agregarAtencion,
  itemsParaRPC,
  montoDescuento,
  totalesCarrito,
  subtotalLinea,
  SIN_DESCUENTO,
  type Descuento,
  type LineaCarrito,
} from "@/lib/ventas/carrito";
import { getOrCrearServicioAtencion } from "@/lib/supabase/productos";
import { registrarVenta } from "@/lib/supabase/ventas";
import { esConsumidorFinal } from "@/lib/clientes/consumidor-final";
import { MEDIOS_PAGO, type MedioPago } from "@/lib/supabase/types";
import { formatCurrency } from "@/lib/format";
import { useRouter } from "next/navigation";
import { getFirmaVeterinarioPublico } from "@/lib/supabase/usuarios";
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
  Camera,
  Syringe,
  MoreVertical,
  QrCode,
  ShoppingCart,
} from "lucide-react";
import LibretaDetallesModal from "./LibretaDetallesModal";
import { QrLibretaButton, type QrLibretaButtonRef } from "./qr-libreta-button";
import { RecordatorioVacunaButton, type RecordatorioVacunaButtonRef } from "./recordatorio-vacuna-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  esPrivada: true,
};

const emptyMascotaDataForm = {
  tipo: "", raza: "", edadValor: "", edadUnidad: "meses" as UnidadEdad,
  peso: "", tieneChip: false, chipNumero: "", sexo: "" as SexoMascota | "", color: "",
};

type TipoAplicacion = "vacuna" | "medicamento" | "desparasitacion" | "servicio";
/** Los que sí se guardan en `Historia.aplicaciones` (columna con enum propio). "servicio" es solo carrito. */
type TipoAplicacionHistoriaLocal = Exclude<TipoAplicacion, "servicio">;

const TIPO_APLICACION_LABEL: Record<TipoAplicacion, string> = {
  vacuna: "Vacuna",
  medicamento: "Medicamento",
  desparasitacion: "Desparasitación",
  servicio: "Servicio",
};

const esTipoHistoria = (tipo: TipoAplicacion): tipo is TipoAplicacionHistoriaLocal => tipo !== "servicio";

interface ItemAplicacion {
  tipo: TipoAplicacion;
  nombre: string;
  productoId?: string;
  /** Producto real del catálogo, si se eligió uno: sin esto no se puede armar la línea de carrito. */
  producto?: Producto;
  busqueda: string;
  resultados: Producto[];
  proxima: string;
  observaciones: string;
  /** Precio a cobrar por este ítem (se autocompleta al elegir un producto del catálogo). */
  precio: string;
}

interface ItemExtra {
  productoId?: string;
  producto?: Producto;
  nombre: string;
  busqueda: string;
  resultados: Producto[];
  cantidad: string;
  precio: string;
}

function nuevoItemAplicacion(): ItemAplicacion {
  return {
    tipo: "vacuna",
    nombre: "", productoId: undefined, busqueda: "", resultados: [],
    proxima: "", observaciones: "", precio: "",
  };
}

function nuevoItemExtra(): ItemExtra {
  return { productoId: undefined, nombre: "", busqueda: "", resultados: [], cantidad: "1", precio: "" };
}

/** Título legible de una nota combinada, para el timeline y el PDF: "Vacuna, Medicamento y Desparasitación". */
function tituloAplicaciones(items: { tipo: TipoAplicacionHistoriaLocal }[]): string {
  const tipos = Array.from(new Set(items.map((i) => TIPO_APLICACION_LABEL[i.tipo])));
  if (tipos.length <= 1) return tipos[0] ?? "Aplicación";
  return `${tipos.slice(0, -1).join(", ")} y ${tipos[tipos.length - 1]}`;
}

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
  const [ventasCliente, setVentasCliente] = useState<Venta[]>([]);
  const [saldoCtaCte, setSaldoCtaCte] = useState(0);
  const [veterinaria, setVeterinaria] = useState<VeterinariaLibreta>({});
  const [rubroServicios, setRubroServicios] = useState("");
  const [descargandoLibretaId, setDescargandoLibretaId] = useState<string | null>(null);
  const { user } = useAuth();

  // Identidad de la veterinaria para el encabezado del PDF de libreta y del
  // comprobante: se pide una sola vez, no cambia entre clientes ni mascotas.
  useEffect(() => {
    getTenantConfig(tenantId).then((config) => {
      if (!config) return;
      setVeterinaria({
        nombre: config.nombre,
        logoUrl: config.logo,
        telefono: config.telefono,
        direccion: config.direccion,
        modalidad: config.modalidad,
      });
      setRubroServicios(config.servicios?.length ? config.servicios.map((s) => s.nombre).join(" - ") : (config.descripcion ?? ""));
    });
  }, [tenantId]);

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

  const [editMascotaDataOpen, setEditMascotaDataOpen] = useState(false);
  const [editMascotaDataTarget, setEditMascotaDataTarget] = useState<{ clienteId: string; mascotaId: string; fotoUrl?: string } | null>(null);
  const [formMascotaData, setFormMascotaData] = useState(emptyMascotaDataForm);
  const [savingMascotaData, setSavingMascotaData] = useState(false);
  const [subiendoFotoMascota, setSubiendoFotoMascota] = useState(false);
  const fotoMascotaInputRef = useRef<HTMLInputElement>(null);
  const qrRefs = useRef<Map<string, QrLibretaButtonRef>>(new Map());
  const recordatorioRefs = useRef<Map<string, RecordatorioVacunaButtonRef>>(new Map());

  const [addNotaOpen, setAddNotaOpen] = useState(false);
  const [addNotaMascota, setAddNotaMascota] = useState<{ cliente: Cliente; mascota: Mascota } | null>(null);
  const [formNota, setFormNota] = useState(emptyHistoriaForm);
  const [archivosNota, setArchivosNota] = useState<File[]>([]);
  const [uploadingArchivos, setUploadingArchivos] = useState(false);
  const [savingNota, setSavingNota] = useState(false);

  const [addAplicacionOpen, setAddAplicacionOpen] = useState(false);
  const [addAplicacionMascota, setAddAplicacionMascota] = useState<{ cliente: Cliente; mascota: Mascota } | null>(null);
  const [fechaAplicacion, setFechaAplicacion] = useState("");
  const [itemsAplicacion, setItemsAplicacion] = useState<ItemAplicacion[]>([nuevoItemAplicacion()]);
  const [itemsExtra, setItemsExtra] = useState<ItemExtra[]>([]);
  const [savingAplicacion, setSavingAplicacion] = useState(false);
  const [cobrandoAplicacion, setCobrandoAplicacion] = useState(false);
  const [descuentoAplicacion, setDescuentoAplicacion] = useState<Descuento>(SIN_DESCUENTO);
  const [medioPagoAplicacion, setMedioPagoAplicacion] = useState<MedioPago>("efectivo");
  const [servicioAtencionProducto, setServicioAtencionProducto] = useState<Producto | null>(null);
  const { setDraft: setCarritoPosDraft } = useCarritoCompartido(tenantId);
  const router = useRouter();
  const [descargandoComprobanteId, setDescargandoComprobanteId] = useState<string | null>(null);

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
        const porCliente = await getMascotasBasicByClienteIds(tenantId, missingIds);
        if (!alive) return;
        setMascotasResumen((prev) => {
          const next = { ...prev };
          missingIds.forEach((id) => {
            const mascotas = porCliente.get(id) ?? [];
            next[id] = { count: mascotas.length, names: mascotas.map((m) => m.nombre).filter(Boolean) };
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
        const [completo, turnos, mascotas] = await Promise.all([
          getClienteCompleto(tenantId, clienteId),
          getTurnosByClienteId(tenantId, clienteId),
          // `getMascotas` (RPC) incluye mascotas donde el cliente es co-dueño,
          // no solo dueño principal — el embed de getClienteCompleto (FK
          // directa) se queda corto ahí y antes se usaba como fuente
          // primaria, así que un co-dueño sin mascotas propias siempre veía
          // "0 mascotas" aunque compartiera una.
          getMascotas(tenantId, clienteId),
        ]);
        if (completo) {
          const clienteFull = { ...completo, mascotas, historialDatos: (completo as Cliente & { historialDatos?: HistorialDato[] }).historialDatos } as Cliente;
          setClienteExpandido({
            cliente: clienteFull,
            mascotas,
            turnos,
          });
          if (mascotas.length > 0) setSelectedMascotaId(mascotas[0].id ?? null);
        } else {
          toast({ title: "Error", description: "No se encontró el cliente", variant: "destructive" });
          setExpandedClienteId(null);
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

  // Ventas y saldo de cuenta corriente del dueño: todo ya está vinculado
  // (venta.cliente_id, cuenta_corriente_movimientos.cliente_id), esto solo
  // lo muestra en la ficha de la mascota para no tener que ir a buscarlo a
  // otra pantalla.
  useEffect(() => {
    const clienteId = clienteExpandido?.cliente.id;
    if (!clienteId) { setVentasCliente([]); setSaldoCtaCte(0); return; }
    let activo = true;
    Promise.all([
      getVentas(tenantId, { clienteId, porPagina: 5 }),
      getSaldoCliente(tenantId, clienteId),
    ]).then(([pagina, saldo]) => {
      if (!activo) return;
      setVentasCliente(pagina.ventas);
      setSaldoCtaCte(saldo);
    }).catch((e) => console.error("Error cargando ventas/cta cte del cliente:", e));
    return () => { activo = false; };
  }, [tenantId, clienteExpandido?.cliente.id]);

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

  const openEditMascotaData = (cliente: Cliente, mascota: Mascota) => {
    if (!cliente.id || !mascota.id) return;
    setEditMascotaDataTarget({ clienteId: cliente.id, mascotaId: mascota.id, fotoUrl: mascota.fotoUrl });
    setFormMascotaData({
      tipo: mascota.tipo || "",
      raza: mascota.raza || "",
      edadValor: mascota.edadValor !== undefined ? String(mascota.edadValor) : "",
      edadUnidad: mascota.edadUnidad || "meses",
      peso: (mascota.peso || "").replace(/[^\d.,]/g, ""),
      tieneChip: mascota.tieneChip || false,
      chipNumero: mascota.chipNumero || "",
      sexo: mascota.sexo || "",
      color: mascota.color || "",
    });
    setEditMascotaDataOpen(true);
  };

  const subirFotoMascota = async (file: File) => {
    if (!editMascotaDataTarget) return;
    setSubiendoFotoMascota(true);
    try {
      const url = await uploadFotoTenant(tenantId, `mascotas/${editMascotaDataTarget.mascotaId}`, file);
      await updateMascota(tenantId, editMascotaDataTarget.clienteId, editMascotaDataTarget.mascotaId, { fotoUrl: url });
      setEditMascotaDataTarget((prev) => (prev ? { ...prev, fotoUrl: url } : prev));
      const mascotasActualizadas = await getMascotas(tenantId, editMascotaDataTarget.clienteId);
      setClienteExpandido((prev) =>
        prev && prev.cliente.id === editMascotaDataTarget.clienteId ? { ...prev, mascotas: mascotasActualizadas } : prev
      );
      toast({ title: "Foto actualizada" });
    } catch (e) {
      console.error("Error subiendo la foto de la mascota:", e);
      toast({ title: "Error", description: "No se pudo subir la foto", variant: "destructive" });
    } finally {
      setSubiendoFotoMascota(false);
    }
  };

  const saveMascotaData = async () => {
    if (!editMascotaDataTarget) return;
    if (!formMascotaData.sexo) {
      toast({ title: "Falta el sexo", description: "Es un dato obligatorio para la ficha de la mascota.", variant: "destructive" });
      return;
    }
    setSavingMascotaData(true);
    try {
      const edadValor = formMascotaData.edadValor ? Number(formMascotaData.edadValor) : undefined;
      const datosEdad = edadValor !== undefined && !Number.isNaN(edadValor)
        ? {
            edad: formatearEdad({ valor: edadValor, unidad: formMascotaData.edadUnidad }),
            edadValor,
            edadUnidad: formMascotaData.edadUnidad,
            edadRegistradaEn: format(new Date(), "yyyy-MM-dd"),
          }
        : {};

      await updateMascota(tenantId, editMascotaDataTarget.clienteId, editMascotaDataTarget.mascotaId, {
        tipo: formMascotaData.tipo,
        raza: formMascotaData.raza,
        peso: formMascotaData.peso.trim() ? `${formMascotaData.peso.trim()} kg` : "",
        tieneChip: formMascotaData.tieneChip,
        chipNumero: formMascotaData.tieneChip ? formMascotaData.chipNumero.trim() : "",
        sexo: formMascotaData.sexo,
        color: formMascotaData.color.trim(),
        ...datosEdad,
      });

      const mascotasActualizadas = await getMascotas(tenantId, editMascotaDataTarget.clienteId);
      setClienteExpandido((prev) =>
        prev && prev.cliente.id === editMascotaDataTarget.clienteId
          ? { ...prev, mascotas: mascotasActualizadas }
          : prev
      );
      toast({ title: "Datos de la mascota actualizados" });
      setEditMascotaDataOpen(false);
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo guardar",
        variant: "destructive",
      });
    } finally {
      setSavingMascotaData(false);
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
      esPrivada: h.esPrivada ?? false,
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
        const historiaPayload: Record<string, string | boolean> = {
          fechaAtencion: formHistoria.fechaAtencion,
          diagnostico: formHistoria.diagnostico,
          tratamiento: formHistoria.tratamiento,
          esPrivada: formHistoria.esPrivada,
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
      esPrivada: formNota.esPrivada,
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

  const openAddAplicacion = (cliente: Cliente, mascota: Mascota) => {
    const clienteId = cliente?.id ?? "";
    const mascotaId = mascota?.id ?? "";
    if (!clienteId || !mascotaId) {
      toast({ title: "Error", description: "No se pudo identificar cliente o mascota.", variant: "destructive" });
      return;
    }
    if (isMobile) setDetailSheetOpen(false);
    setAddAplicacionMascota({ cliente: { ...cliente, id: clienteId }, mascota: { ...mascota, id: mascotaId } });
    setFechaAplicacion(new Date().toISOString().slice(0, 10));
    setItemsAplicacion([nuevoItemAplicacion()]);
    setItemsExtra([]);
    setDescuentoAplicacion(SIN_DESCUENTO);
    setMedioPagoAplicacion("efectivo");
    getOrCrearServicioAtencion(tenantId).then(setServicioAtencionProducto).catch(() => setServicioAtencionProducto(null));
    setTimeout(() => setAddAplicacionOpen(true), isMobile ? 150 : 0);
  };

  const cambiarItemAplicacion = (i: number, cambios: Partial<ItemAplicacion>) =>
    setItemsAplicacion((prev) => prev.map((item, idx) => (idx === i ? { ...item, ...cambios } : item)));

  const agregarItemAplicacion = () => setItemsAplicacion((prev) => [...prev, nuevoItemAplicacion()]);
  const quitarItemAplicacion = (i: number) => setItemsAplicacion((prev) => prev.filter((_, idx) => idx !== i));

  const buscarProductoAplicacion = (i: number, termino: string) => {
    cambiarItemAplicacion(i, { busqueda: termino, productoId: undefined, nombre: termino });
    if (termino.trim().length < 2) {
      cambiarItemAplicacion(i, { resultados: [] });
      return;
    }
    getProductos(tenantId, { busqueda: termino.trim(), porPagina: 6 }).then(({ productos }) =>
      cambiarItemAplicacion(i, { resultados: productos })
    );
  };

  const elegirProductoAplicacion = (i: number, producto: Producto) => {
    cambiarItemAplicacion(i, { productoId: producto.id, producto, nombre: producto.nombre, busqueda: "", resultados: [], precio: String(producto.precio ?? "") });
  };

  const cambiarItemExtra = (i: number, cambios: Partial<ItemExtra>) =>
    setItemsExtra((prev) => prev.map((item, idx) => (idx === i ? { ...item, ...cambios } : item)));
  const agregarItemExtra = () => setItemsExtra((prev) => [...prev, nuevoItemExtra()]);
  const quitarItemExtra = (i: number) => setItemsExtra((prev) => prev.filter((_, idx) => idx !== i));

  const buscarProductoExtra = (i: number, termino: string) => {
    cambiarItemExtra(i, { busqueda: termino, productoId: undefined, nombre: termino });
    if (termino.trim().length < 2) {
      cambiarItemExtra(i, { resultados: [] });
      return;
    }
    getProductos(tenantId, { busqueda: termino.trim(), porPagina: 6 }).then(({ productos }) =>
      cambiarItemExtra(i, { resultados: productos })
    );
  };

  const elegirProductoExtra = (i: number, producto: Producto) => {
    cambiarItemExtra(i, { productoId: producto.id, producto, nombre: producto.nombre, busqueda: "", resultados: [], precio: String(producto.precio ?? "") });
  };


  /**
   * Genera (o vuelve a generar) el comprobante de una nota de
   * vacuna/medicamento/desparasitación. Sirve tanto para el momento en que
   * se guarda como para "Descargar orden" en una entrada ya cargada: en ese
   * caso la firma es la del veterinario que la creó (`creadoPor`), no la de
   * quien está mirando la libreta ahora.
   */
  const descargarComprobante = async (
    aplicaciones: AplicacionHistoria[],
    fechaAtencion: string,
    creadoPor: string | undefined,
    clienteNombre: string,
    mascotaNombre: string,
  ) => {
    const uidFirma = creadoPor || user?.id;
    const firma = uidFirma ? await getFirmaVeterinarioPublico(uidFirma) : null;
    await generarComprobanteVeterinario({
      emisor: {
        nombre: veterinaria.nombre,
        logoUrl: veterinaria.logoUrl,
        direccion: veterinaria.direccion,
        telefono: veterinaria.telefono,
        rubro: rubroServicios,
      },
      profesional: {
        nombre: firma?.nombre ?? undefined,
        especialidad: firma?.especialidad,
        matricula: firma?.matricula ?? undefined,
        firmaUrl: firma?.firmaUrl ?? undefined,
        selloUrl: firma?.selloUrl ?? undefined,
      },
      clienteNombre,
      mascotaNombre,
      fecha: fechaAtencion,
      items: aplicaciones.map((a) => ({
        tipoLabel: TIPO_APLICACION_LABEL[a.tipo],
        nombre: a.nombre,
        indicaciones: a.indicaciones,
      })),
    });
  };

  /** "Volver a descargar la orden" de una entrada ya cargada (nueva o vieja, suelta). */
  const redescargarComprobante = async (h: Historia, clienteNombre: string, mascotaNombre: string) => {
    if (!h.id) return;
    const aplicaciones: AplicacionHistoria[] = h.aplicaciones?.length
      ? h.aplicaciones
      : h.tipoVisita && h.tipoVisita !== "consulta" && h.tipoVisita !== "turno_programado" && h.tipoVisita !== "visita_programada" && h.productoAplicado
        ? [{ tipo: h.tipoVisita as TipoAplicacionHistoriaLocal, nombre: h.productoAplicado, indicaciones: h.observaciones, proxima: h.proximaVisita }]
        : [];
    if (aplicaciones.length === 0) return;
    setDescargandoComprobanteId(h.id);
    try {
      await descargarComprobante(aplicaciones, h.fechaAtencion, h.creadoPor, clienteNombre, mascotaNombre);
    } catch (e) {
      console.error("Error regenerando el comprobante:", e);
      toast({ title: "Error", description: "No se pudo generar el comprobante", variant: "destructive" });
    } finally {
      setDescargandoComprobanteId(null);
    }
  };

  /** Ítems con nombre + producto de catálogo + precio > 0: lo único que se puede cobrar. */
  const medicosCobrables = () =>
    itemsAplicacion.filter((item) => esTipoHistoria(item.tipo) && item.nombre.trim() && item.producto && Number(item.precio) > 0);
  const serviciosValidos = () =>
    itemsAplicacion.filter((item) => item.tipo === "servicio" && item.nombre.trim() && Number(item.precio) > 0);
  const extrasValidos = () => itemsExtra.filter((item) => item.nombre.trim() && item.producto && Number(item.cantidad) > 0);

  const vinculoAplicacion = () => addAplicacionMascota && {
    clienteId: addAplicacionMascota.cliente.id!,
    mascotaId: addAplicacionMascota.mascota.id!,
    mascotaNombre: addAplicacionMascota.mascota.nombre,
  };

  /** Líneas de carrito de ESTA aplicación, sin tocar lo que ya hubiera en Vender. Puro y sincrónico. */
  const construirLineasNuevas = (): LineaCarrito[] => {
    let lineas: LineaCarrito[] = [];
    for (const item of medicosCobrables()) {
      lineas = agregarAlCarrito(lineas, { ...item.producto!, precio: Number(item.precio) }, 1);
    }
    if (servicioAtencionProducto) {
      const vinculo = vinculoAplicacion();
      for (const item of serviciosValidos()) {
        lineas = agregarAtencion(lineas, servicioAtencionProducto, Number(item.precio), item.nombre.trim(), vinculo ?? undefined);
      }
    }
    for (const item of extrasValidos()) {
      lineas = agregarAlCarrito(lineas, { ...item.producto!, precio: Number(item.precio) || item.producto!.precio }, Number(item.cantidad) || 1);
    }
    return lineas;
  };

  // `construirLineasNuevas` valida stock (vía `agregarAlCarrito`) y puede
  // tirar si algún producto no alcanza — como esto se recalcula en cada
  // render para la vista previa, un producto sin stock no puede tumbar el
  // diálogo entero: se atrapa y se muestra vacío, el error real recién
  // aparece al intentar Guardar/Cobrar (ahí sí se avisa con un toast).
  let lineasPreview: LineaCarrito[] = [];
  let errorPreview: string | null = null;
  try {
    lineasPreview = construirLineasNuevas();
  } catch (e) {
    errorPreview = e instanceof Error ? e.message : "No se pudo calcular el carrito";
  }
  const totalesPreview = totalesCarrito(lineasPreview, descuentoAplicacion);

  /** Crea la historia (solo ítems médicos) y descarga la orden. Común a "Guardar" y "Cobrar". */
  const registrarHistoriaYOrden = async (): Promise<boolean> => {
    if (!addAplicacionMascota?.cliente.id || !addAplicacionMascota?.mascota.id) return false;
    const validos = itemsAplicacion.filter((item) => item.nombre.trim());
    const medicos = validos.filter((item) => esTipoHistoria(item.tipo));
    const fecha = fechaAplicacion?.trim() || new Date().toISOString().slice(0, 10);
    const aplicaciones: AplicacionHistoria[] = medicos.map((item) => ({
      tipo: item.tipo as TipoAplicacionHistoriaLocal,
      nombre: item.nombre.trim(),
      indicaciones: item.observaciones.trim() || undefined,
      proxima: item.proxima.trim() || undefined,
    }));
    if (aplicaciones.length === 0) return true;

    await createHistoria(tenantId, addAplicacionMascota.cliente.id, addAplicacionMascota.mascota.id, {
      fechaAtencion: fecha,
      motivo: tituloAplicaciones(aplicaciones),
      diagnostico: "", tratamiento: "", observaciones: "",
      tipoVisita: "aplicacion", aplicaciones, creadoPor: user?.id,
    });
    if (clienteExpandido?.cliente.id === addAplicacionMascota.cliente.id && selectedMascotaId === addAplicacionMascota.mascota.id) {
      loadTimeline(addAplicacionMascota.cliente.id, addAplicacionMascota.mascota.id);
    }
    try {
      await descargarComprobante(aplicaciones, fecha, user?.id, addAplicacionMascota.cliente.nombre, addAplicacionMascota.mascota.nombre);
    } catch (e) {
      console.error("Error generando el comprobante:", e);
      toast({ title: "Se guardó, pero no se pudo generar el comprobante", variant: "destructive" });
    }
    return true;
  };

  const cerrarYLimpiarAplicacion = () => {
    setAddAplicacionOpen(false);
    setAddAplicacionMascota(null);
    setItemsAplicacion([nuevoItemAplicacion()]);
    setItemsExtra([]);
    setDescuentoAplicacion(SIN_DESCUENTO);
    setMedioPagoAplicacion("efectivo");
  };

  /** Guarda la nota médica + orden, y deja las líneas cobrables esperando en el carrito de Vender (no cobra ni redirige). */
  const saveAplicacion = async () => {
    if (itemsAplicacion.every((item) => !item.nombre.trim()) && itemsExtra.every((item) => !item.nombre.trim())) {
      toast({ title: "Falta el producto", description: "Elegí al menos una vacuna, medicamento, desparasitación, servicio o extra.", variant: "destructive" });
      return;
    }
    setSavingAplicacion(true);
    try {
      await registrarHistoriaYOrden();
      const nuevas = construirLineasNuevas();
      if (nuevas.length > 0) {
        setCarritoPosDraft((d) => {
          let carrito = d.carrito;
          for (const linea of nuevas) {
            carrito = linea.vinculo
              ? [...carrito, linea]
              : agregarAlCarrito(carrito, linea.producto, linea.cantidad);
          }
          return { ...d, carrito };
        });
        toast({ title: "Guardado", description: "Se agregó al carrito de Vender (sin cobrar todavía)." });
      } else {
        toast({ title: "Guardado" });
      }
      cerrarYLimpiarAplicacion();
    } catch (e) {
      console.error("Error registrando la aplicación:", e);
      toast({ title: "Error", description: "No se pudo registrar", variant: "destructive" });
    } finally {
      setSavingAplicacion(false);
    }
  };

  /** Cobra ahora mismo, sin pasar por Vender: crea la historia+orden y registra la venta con las líneas de este diálogo. */
  const cobrarAplicacion = async () => {
    if (!addAplicacionMascota?.cliente.id) return;
    const lineas = construirLineasNuevas();
    if (lineas.length === 0) {
      toast({ title: "Nada para cobrar", description: "Cargá al menos un ítem con producto y precio.", variant: "destructive" });
      return;
    }

    // La deuda (si se cobra a cuenta corriente) tiene que quedar a nombre del
    // dueño principal de la mascota, no de quien esté abierto en pantalla:
    // si el vet llegó acá desde la ficha de un co-dueño (ej. Emanuel, sobre
    // la mascota de Iara), venderle "a cuenta corriente" tiene que cargarle
    // la cuenta a Iara, no a Emanuel.
    const duenoId = addAplicacionMascota.mascota.clienteId || addAplicacionMascota.cliente.id;
    const dueno = duenoId === addAplicacionMascota.cliente.id
      ? addAplicacionMascota.cliente
      : (await getClienteCompleto(tenantId, duenoId)) ?? addAplicacionMascota.cliente;

    if (medioPagoAplicacion === "cuenta_corriente" && esConsumidorFinal(dueno)) {
      toast({ title: "Elegí un cliente real para vender a cuenta corriente", variant: "destructive" });
      return;
    }
    setCobrandoAplicacion(true);
    try {
      await registrarHistoriaYOrden();
      await registrarVenta(tenantId, {
        items: itemsParaRPC(lineas),
        medioPago: medioPagoAplicacion,
        clienteId: duenoId,
        descuento: montoDescuento(totalesCarrito(lineas).subtotal, descuentoAplicacion),
      });
      if (medioPagoAplicacion === "cuenta_corriente" && duenoId !== addAplicacionMascota.cliente.id) {
        toast({ title: "Deuda cargada a " + (dueno.nombre || "el dueño principal") });
      }
      // Los "servicio" quedan anotados en la historia recién ahora que se cobraron de verdad.
      for (const linea of lineas.filter((l) => l.vinculo)) {
        try {
          await createHistoria(tenantId, linea.vinculo!.clienteId, linea.vinculo!.mascotaId, {
            fechaAtencion: new Date().toISOString().slice(0, 10),
            motivo: linea.motivo || "Atención veterinaria",
            diagnostico: "", tratamiento: "",
            observaciones: `Cobrado en Libreta Sanitaria: ${formatCurrency(linea.precioManual ?? linea.producto.precio)}`,
            tipoVisita: "consulta",
          });
        } catch {
          toast({ title: "Se cobró, pero no se pudo anotar el servicio en la historia", variant: "destructive" });
        }
      }
      toast({ title: "Cobrado", description: `Total: ${formatCurrency(totalesPreview.total)}` });
      cerrarYLimpiarAplicacion();
    } catch (e) {
      console.error("Error cobrando la aplicación:", e);
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo cobrar", variant: "destructive" });
    } finally {
      setCobrandoAplicacion(false);
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
                        <div className="h-9 w-9 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
                          {m.fotoUrl
                            ? <img src={m.fotoUrl} alt={m.nombre} className="h-full w-full object-cover" />
                            : <Icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{m.nombre} · {m.tipo}</p>
                          <button
                            type="button"
                            onClick={() => openEditMascotaData(clienteExpandido.cliente, m)}
                            className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline"
                            title="Cargar o corregir datos de la mascota"
                          >
                            {[m.raza, m.edad, m.peso, m.sexo === "macho" ? "Macho" : m.sexo === "hembra" ? "Hembra" : null, m.color, m.tieneChip ? "Chip" : null].filter(Boolean).join(" · ") || "Sin datos"}
                            <Edit3 className="h-3 w-3 shrink-0" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">{visitasReales.length} visitas</Badge>
                          {proximos > 0 && <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-0">{proximos} próximo{proximos !== 1 ? "s" : ""}</Badge>}
                          {clienteExpandido.cliente.id && m.id && (
                            <>
                              <QrLibretaButton
                                ref={(r) => { if (r && m.id) qrRefs.current.set(m.id, r); }}
                                tenantId={tenantId}
                                clienteId={clienteExpandido.cliente.id}
                                mascotaId={m.id}
                                sinTrigger
                              />
                              <RecordatorioVacunaButton
                                ref={(r) => { if (r && m.id) recordatorioRefs.current.set(m.id, r); }}
                                tenantId={tenantId}
                                clienteId={clienteExpandido.cliente.id}
                                mascotaId={m.id}
                                mascotaNombre={m.nombre ?? ""}
                                telefono={clienteExpandido.cliente.telefono ?? ""}
                                sinTrigger
                              />
                            </>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg hover:shadow-emerald-500/30 transition-all shrink-0 gap-1.5 px-3">
                                {descargandoLibretaId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                                Acciones
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-64">
                              <DropdownMenuItem
                                disabled={descargandoLibretaId === m.id}
                                onSelect={async () => {
                                  if (!m.id) return;
                                  const nombreMascota = (m.nombre ?? "").trim().toLowerCase();
                                  const turnosMascota = clienteExpandido.turnos.filter(
                                    (t) => t.mascotaId === m.id || (t.mascota?.nombre ?? "").trim().toLowerCase() === nombreMascota
                                  );
                                  setDescargandoLibretaId(m.id);
                                  try {
                                    await generarLibretaPDF({
                                      tenantId,
                                      veterinaria,
                                      cliente: clienteExpandido.cliente,
                                      mascota: m,
                                      historias: visitasReales,
                                      turnos: turnosMascota,
                                    });
                                  } catch (e) {
                                    console.error("Error generando la libreta PDF:", e);
                                    toast({ title: "Error", description: "No se pudo generar el PDF de la libreta", variant: "destructive" });
                                  } finally {
                                    setDescargandoLibretaId(null);
                                  }
                                }}
                              >
                                <FileDown className="h-4 w-4" /> Descargar libreta sanitaria (PDF)
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => m.id && qrRefs.current.get(m.id)?.abrir()}>
                                <QrCode className="h-4 w-4" /> Generar QR de la libreta pública
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => m.id && recordatorioRefs.current.get(m.id)?.abrir()}>
                                <Syringe className="h-4 w-4" /> Programar recordatorio de vacuna
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => openAddArchivo(clienteExpandido.cliente, m)}>
                                <Paperclip className="h-4 w-4" /> Subir archivo adjunto
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => openAddAplicacion(clienteExpandido.cliente, m)}>
                                <Syringe className="h-4 w-4" /> Agregar vacuna, medicamento o desparasitación
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => openAddNota(clienteExpandido.cliente, m)}>
                                <Plus className="h-4 w-4" /> Agregar nota clínica
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* Ventas y cuenta corriente del dueño: ya están vinculadas por cliente_id, esto solo lo muestra */}
                      {(ventasCliente.length > 0 || saldoCtaCte > 0) && (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <ShoppingCart className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600 dark:text-slate-400 min-w-0">
                              {ventasCliente.slice(0, 3).map((v) => (
                                <span key={v.id} className={v.estado === "anulada" ? "line-through text-slate-400" : ""}>
                                  #{v.numero} · {formatCurrency(v.total)}
                                </span>
                              ))}
                              {ventasCliente.length === 0 && <span className="text-slate-400">Sin ventas registradas</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {saldoCtaCte > 0 && (
                              <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-0">
                                Debe {formatCurrency(saldoCtaCte)}
                              </Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-slate-500"
                              onClick={() => router.push(`/${tenantId}/admin/CuentaCorriente`)}
                            >
                              Ver cuenta corriente
                            </Button>
                          </div>
                        </div>
                      )}

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
                                  {entradas.map((h) => {
                                    const aplicacionesDeH: AplicacionHistoria[] = h.aplicaciones?.length
                                      ? h.aplicaciones
                                      : h.tipoVisita && ["vacuna", "medicamento", "desparasitacion"].includes(h.tipoVisita) && h.productoAplicado
                                        ? [{ tipo: h.tipoVisita as TipoAplicacionHistoriaLocal, nombre: h.productoAplicado, indicaciones: h.observaciones, proxima: h.proximaVisita }]
                                        : [];
                                    return (
                                    <div key={h.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm space-y-2">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{h.motivo || "Consulta"}</p>
                                          <Badge
                                            variant="secondary"
                                            className={`text-[9px] px-1.5 py-0 shrink-0 ${h.esPrivada ? "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"}`}
                                          >
                                            {h.esPrivada ? "Privada" : "Visible al cliente"}
                                          </Badge>
                                        </div>
                                        <div className="flex items-center gap-0.5 shrink-0">
                                          {aplicacionesDeH.length > 0 && (
                                            <button
                                              type="button"
                                              className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                                              disabled={descargandoComprobanteId === h.id}
                                              onClick={() => redescargarComprobante(h, clienteExpandido.cliente.nombre, m.nombre ?? "")}
                                              title="Descargar orden"
                                            >
                                              {descargandoComprobanteId === h.id
                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                : <FileDown className="h-3.5 w-3.5" />}
                                            </button>
                                          )}
                                          <button type="button" className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { if (isMobile) setDetailSheetOpen(false); setDetailModalItem({ type: "historia", data: h }); setTimeout(() => setDetailModalOpen(true), isMobile ? 150 : 0); }} title="Ver detalles"><Eye className="h-3.5 w-3.5" /></button>
                                          <button type="button" className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => openEditHistoria(h, clienteExpandido.cliente.id!, m.id!)} title="Editar"><Edit3 className="h-3.5 w-3.5" /></button>
                                        </div>
                                      </div>
                                      <div className="text-xs text-slate-600 dark:text-slate-400">
                                        {aplicacionesDeH.length > 0 ? (
                                          <div className="space-y-1">
                                            {aplicacionesDeH.map((a, i) => (
                                              <p key={i}>
                                                <span className="font-semibold">{TIPO_APLICACION_LABEL[a.tipo]}:</span> {a.nombre}
                                                {a.indicaciones ? ` — ${a.indicaciones}` : ""}
                                              </p>
                                            ))}
                                          </div>
                                        ) : (
                                          <>
                                            <p><span className="font-semibold">Diagnóstico:</span> {(h.diagnostico || "—").slice(0, 120)}{(h.diagnostico?.length ?? 0) > 120 ? "…" : ""}</p>
                                            <p className="mt-0.5"><span className="font-semibold">Tratamiento:</span> {(h.tratamiento || "—").slice(0, 120)}{(h.tratamiento?.length ?? 0) > 120 ? "…" : ""}</p>
                                          </>
                                        )}
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
                                  );})}
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
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                  <Checkbox
                    id="edit-nota-visible-cliente"
                    checked={!formHistoria.esPrivada}
                    onCheckedChange={(checked) => setFormHistoria((f) => ({ ...f, esPrivada: checked !== true }))}
                  />
                  <Label htmlFor="edit-nota-visible-cliente" className="text-xs font-normal cursor-pointer">
                    Visible para el cliente (aparece en su &quot;Mi Historia&quot;)
                  </Label>
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

      {/* Modal datos generales de la mascota (raza, edad, peso, chip) */}
      <Dialog open={editMascotaDataOpen} onOpenChange={setEditMascotaDataOpen}>
        <DialogContent className="sm:max-w-sm border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
              Datos de la mascota
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-3">
              <input
                ref={fotoMascotaInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) subirFotoMascota(file);
                }}
              />
              <button
                type="button"
                onClick={() => fotoMascotaInputRef.current?.click()}
                disabled={subiendoFotoMascota}
                className="relative h-16 w-16 shrink-0 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 overflow-hidden flex items-center justify-center bg-slate-50 dark:bg-slate-800 hover:border-emerald-500 transition-colors"
                title="Cambiar foto"
              >
                {subiendoFotoMascota ? (
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                ) : editMascotaDataTarget?.fotoUrl ? (
                  <img src={editMascotaDataTarget.fotoUrl} alt="Foto de la mascota" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="h-5 w-5 text-slate-400" />
                )}
              </button>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                <p className="font-medium text-slate-700 dark:text-slate-300">Foto</p>
                <p>Se recorta cuadrada para la libreta.</p>
              </div>
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={formMascotaData.tipo} onValueChange={(v) => setFormMascotaData((d) => ({ ...d, tipo: v }))}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue placeholder="Selecciona..." />
                </SelectTrigger>
                <SelectContent>
                  {MASCOTAS_DEFAULT.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.emoji} {t.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Raza</Label>
              <Input
                value={formMascotaData.raza}
                onChange={(e) => setFormMascotaData((d) => ({ ...d, raza: e.target.value }))}
                className="mt-1 h-9"
                placeholder="Golden Retriever"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Sexo *</Label>
                <Select value={formMascotaData.sexo} onValueChange={(v) => setFormMascotaData((d) => ({ ...d, sexo: v as SexoMascota }))}>
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue placeholder="Selecciona..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="macho">Macho</SelectItem>
                    <SelectItem value="hembra">Hembra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Color</Label>
                <Input
                  value={formMascotaData.color}
                  onChange={(e) => setFormMascotaData((d) => ({ ...d, color: e.target.value }))}
                  className="mt-1 h-9"
                  placeholder="Negro y blanco"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label className="text-xs">Edad</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="number"
                    min="0"
                    value={formMascotaData.edadValor}
                    onChange={(e) => setFormMascotaData((d) => ({ ...d, edadValor: e.target.value }))}
                    className="h-9"
                    placeholder="8"
                  />
                  <Select
                    value={formMascotaData.edadUnidad}
                    onValueChange={(v) => setFormMascotaData((d) => ({ ...d, edadUnidad: v as UnidadEdad }))}
                  >
                    <SelectTrigger className="h-9 w-24 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="meses">meses</SelectItem>
                      <SelectItem value="anios">años</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Peso (kg)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={formMascotaData.peso}
                  onChange={(e) => setFormMascotaData((d) => ({ ...d, peso: e.target.value }))}
                  className="mt-1 h-9"
                  placeholder="15"
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="mascota-tiene-chip"
                  checked={formMascotaData.tieneChip}
                  onCheckedChange={(checked) => setFormMascotaData((d) => ({ ...d, tieneChip: checked === true }))}
                />
                <Label htmlFor="mascota-tiene-chip" className="text-xs font-normal cursor-pointer">
                  Tiene Chip
                </Label>
              </div>
              {formMascotaData.tieneChip && (
                <Input
                  value={formMascotaData.chipNumero}
                  onChange={(e) => setFormMascotaData((d) => ({ ...d, chipNumero: e.target.value }))}
                  className="h-9"
                  placeholder="Número de chip"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMascotaDataOpen(false)}>Cancelar</Button>
            <Button onClick={saveMascotaData} disabled={savingMascotaData} className="bg-emerald-600 hover:bg-emerald-700">
              {savingMascotaData ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Agregar vacuna / medicamento / desparasitación (una o varias) */}
      <Dialog open={addAplicacionOpen} onOpenChange={(open) => {
          setAddAplicacionOpen(open);
          if (!open) {
            setAddAplicacionMascota(null);
            if (isMobile && expandedClienteId) setDetailSheetOpen(true);
          }
        }}>
        <DialogContent className="sm:max-w-md border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Syringe className="h-4 w-4 text-emerald-600" /> Vacunas, medicamentos, servicios y desparasitación
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 dark:text-slate-400">
              {addAplicacionMascota ? `${addAplicacionMascota.cliente.nombre} – ${addAplicacionMascota.mascota.nombre}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Fecha</Label>
              <Input
                type="date"
                value={fechaAplicacion}
                onChange={(e) => setFechaAplicacion(e.target.value)}
                className="mt-1 h-9"
              />
              <p className="mt-1 text-[11px] text-slate-400">Vacuna/medicamento/desparasitación quedan como una sola nota en la historia clínica. Servicio solo se cobra (su historia la crea el cobro en Vender).</p>
            </div>
            {itemsAplicacion.map((item, i) => (
              <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2.5 relative">
                {itemsAplicacion.length > 1 && (
                  <button
                    type="button"
                    onClick={() => quitarItemAplicacion(i)}
                    className="absolute top-2 right-2 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-red-600"
                    title="Quitar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select value={item.tipo} onValueChange={(v) => cambiarItemAplicacion(i, { tipo: v as TipoAplicacion, productoId: undefined, nombre: "", busqueda: "", resultados: [] })}>
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vacuna">Vacuna</SelectItem>
                      <SelectItem value="medicamento">Medicamento</SelectItem>
                      <SelectItem value="desparasitacion">Desparasitación</SelectItem>
                      <SelectItem value="servicio">Servicio (Atención, Urgencia...)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {item.tipo === "servicio" ? (
                  <div>
                    <Label className="text-xs">Servicio *</Label>
                    <Input
                      value={item.nombre}
                      onChange={(e) => cambiarItemAplicacion(i, { nombre: e.target.value })}
                      className="mt-1 h-9"
                      placeholder="Ej: Atención, Urgencia, Consulta domiciliaria…"
                    />
                  </div>
                ) : (
                  <div className="relative">
                    <Label className="text-xs">{TIPO_APLICACION_LABEL[item.tipo]} *</Label>
                    <Input
                      value={item.productoId ? item.nombre : item.busqueda}
                      onChange={(e) => buscarProductoAplicacion(i, e.target.value)}
                      className="mt-1 h-9"
                      placeholder="Buscar en productos (ej: Triple Felina)…"
                    />
                    {item.resultados.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg max-h-40 overflow-y-auto">
                        {item.resultados.map((prod) => (
                          <button
                            key={prod.id}
                            type="button"
                            onClick={() => elegirProductoAplicacion(i, prod)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <span>{prod.nombre}</span>
                            <span className="text-xs text-slate-400">{formatCurrency(prod.precio)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {!item.productoId && item.busqueda.trim().length >= 2 && item.resultados.length === 0 && (
                      <p className="mt-1 text-[11px] text-slate-400">Sin coincidencias en productos: se guarda como texto libre (no se puede cobrar en Vender sin un producto del catálogo).</p>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Precio</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.precio}
                      onChange={(e) => cambiarItemAplicacion(i, { precio: e.target.value })}
                      className="mt-1 h-9"
                      placeholder="0"
                    />
                  </div>
                  {item.tipo !== "servicio" && (
                    <div>
                      <Label className="text-xs">Próxima aplicación</Label>
                      <Input
                        type="date"
                        value={item.proxima}
                        onChange={(e) => cambiarItemAplicacion(i, { proxima: e.target.value })}
                        className="mt-1 h-9"
                      />
                    </div>
                  )}
                </div>
                {item.tipo !== "servicio" && (
                  <div>
                    <Label className="text-xs">Observaciones</Label>
                    <Textarea
                      value={item.observaciones}
                      onChange={(e) => cambiarItemAplicacion(i, { observaciones: e.target.value })}
                      className="mt-1 min-h-[70px] resize-y"
                      placeholder="Dosis, frecuencia, duración… (opcional)"
                    />
                  </div>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={agregarItemAplicacion} className="w-full gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Agregar otra
            </Button>

            {/* Extras: productos sueltos (alimento, artículos) que no son un dato médico, solo se cobran */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Extras (alimento, artículos)</Label>
              <div className="space-y-2 mt-2">
                {itemsExtra.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={item.productoId ? item.nombre : item.busqueda}
                        onChange={(e) => buscarProductoExtra(i, e.target.value)}
                        className="h-9"
                        placeholder="Buscar producto…"
                      />
                      {item.resultados.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg max-h-40 overflow-y-auto">
                          {item.resultados.map((prod) => (
                            <button
                              key={prod.id}
                              type="button"
                              onClick={() => elegirProductoExtra(i, prod)}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <span>{prod.nombre}</span>
                              <span className="text-xs text-slate-400">{formatCurrency(prod.precio)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="w-20 shrink-0">
                      <Input
                        type="number"
                        min="0"
                        step={item.producto?.unidad === "kg" ? "0.1" : "1"}
                        value={item.cantidad}
                        onChange={(e) => cambiarItemExtra(i, { cantidad: e.target.value })}
                        className="h-9"
                        placeholder={item.producto?.unidad === "kg" ? "Kg" : "Cant."}
                      />
                      {item.producto && (
                        <p className="mt-0.5 text-[10px] text-slate-400 text-center">
                          {item.producto.unidad === "kg" ? "kg" : "un."} · {formatCurrency(item.producto.precio)}{item.producto.unidad === "kg" ? "/kg" : ""}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => quitarItemExtra(i)}
                      className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-red-600 shrink-0"
                      title="Quitar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={agregarItemExtra} className="w-full gap-1.5 mt-2">
                <Plus className="h-3.5 w-3.5" /> Agregar extra
              </Button>
            </div>

            {/* Carrito: lo que se va a cobrar por esto, con descuento y medio de pago — igual que en Vender */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                <ShoppingCart className="h-3.5 w-3.5 text-slate-500" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Carrito</span>
              </div>
              {errorPreview ? (
                <p className="px-3 py-3 text-xs text-red-600">{errorPreview}</p>
              ) : lineasPreview.length === 0 ? (
                <p className="px-3 py-3 text-xs text-slate-400">Elegí un producto con precio, un servicio o un extra para poder cobrar.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {lineasPreview.map((linea) => (
                    <div key={linea.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                      <span className="text-slate-700 dark:text-slate-300 truncate">
                        {linea.producto.nombre}{linea.cantidad !== 1 ? ` × ${linea.cantidad}` : ""}
                      </span>
                      <span className="text-slate-600 dark:text-slate-400 shrink-0 ml-2">{formatCurrency(subtotalLinea(linea))}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="p-3 space-y-2 bg-slate-50/60 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Subtotal</span>
                  <span>{formatCurrency(totalesPreview.subtotal)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs shrink-0">Descuento</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={descuentoAplicacion.valor || ""}
                    onChange={(e) => setDescuentoAplicacion((d) => ({ ...d, valor: Number(e.target.value) || 0 }))}
                    className="h-8 flex-1"
                    placeholder="0"
                  />
                  <Select value={descuentoAplicacion.tipo} onValueChange={(v) => setDescuentoAplicacion((d) => ({ ...d, tipo: v as Descuento["tipo"] }))}>
                    <SelectTrigger className="h-8 w-20 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monto">$</SelectItem>
                      <SelectItem value="porcentaje">%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs shrink-0 w-20">Medio de pago</Label>
                  <Select value={medioPagoAplicacion} onValueChange={(v) => setMedioPagoAplicacion(v as MedioPago)}>
                    <SelectTrigger className="h-8 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEDIOS_PAGO.filter((m) => m.id !== "mixto").map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Total</span>
                  <span className="text-base font-bold text-emerald-800 dark:text-emerald-300">{formatCurrency(totalesPreview.total)}</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setAddAplicacionOpen(false)} className="sm:mr-auto">Cancelar</Button>
            <Button variant="outline" onClick={saveAplicacion} disabled={savingAplicacion || cobrandoAplicacion}>
              {savingAplicacion ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar sin cobrar
            </Button>
            <Button onClick={cobrarAplicacion} disabled={savingAplicacion || cobrandoAplicacion || lineasPreview.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
              {cobrandoAplicacion ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cobrar ahora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Nueva Nota Clínica */}
      <Dialog open={addNotaOpen} onOpenChange={(open) => {
          setAddNotaOpen(open);
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
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                <Checkbox
                  id="nota-visible-cliente"
                  checked={!formNota.esPrivada}
                  onCheckedChange={(checked) => setFormNota((f) => ({ ...f, esPrivada: checked !== true }))}
                />
                <Label htmlFor="nota-visible-cliente" className="text-xs font-normal cursor-pointer">
                  Visible para el cliente (aparece en su &quot;Mi Historia&quot;). Si no se marca, es una nota privada solo para el staff.
                </Label>
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
