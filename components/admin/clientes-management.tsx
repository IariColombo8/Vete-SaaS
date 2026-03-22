"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  createCliente,
  updateCliente,
  type HistorialDato,
} from "@/lib/firebase/firestore";
import type { Cliente, Mascota } from "@/lib/firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import {
  Users,
  Search,
  Plus,
  Edit,
  MapPin,
  Loader2,
  ExternalLink,
  Eye,
  History,
  Dog,
  Cat,
  Bird,
  PawPrint,
  MessageCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const emptyForm = {
  nombre: "",
  telefono: "",
  email: "",
  dni: "",
  domicilio: "",
};

function buildMapsUrl(direccion: string): string {
  if (!direccion?.trim()) return "#";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
}

/** Iniciales del cliente (ej: "Juan Pérez" → "JP") */
function getIniciales(nombre: string): string {
  if (!nombre?.trim()) return "?";
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return nombre.slice(0, 2).toUpperCase();
}

function getMascotaIcon(tipo: string) {
  const t = tipo?.toLowerCase() || "";
  if (t.includes("perro") || t.includes("dog")) return Dog;
  if (t.includes("gato") || t.includes("cat")) return Cat;
  if (t.includes("ave") || t.includes("bird") || t.includes("pájaro")) return Bird;
  return PawPrint;
}

/** Link WhatsApp: normaliza número y devuelve wa.me/54... para Argentina */
function getWhatsAppUrl(telefono: string): string {
  const digits = (telefono || "").replace(/\D/g, "");
  if (!digits.length) return "#";
  const full = digits.length <= 11 ? "54" + digits : digits;
  return `https://wa.me/${full}`;
}

/** Formato de resumen de mascotas: "2 (Max - Perro, Otello - Gato)" */
function formatMascotasSummary(mascotas: Mascota[]): string {
  if (!mascotas.length) return "0";
  const parts = mascotas.map((m) => `${m.nombre ?? "—"} - ${m.tipo ?? "—"}`);
  return `${mascotas.length} (${parts.join(", ")})`;
}

export function ClientesManagement({ tenantId }: { tenantId: string }) {
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mascotasByClienteId, setMascotasByClienteId] = useState<Record<string, Mascota[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMascotas, setLoadingMascotas] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailsCliente, setDetailsCliente] = useState<Cliente & { mascotas?: Mascota[]; historialDatos?: HistorialDato[] } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const { toast } = useToast();

  // Debounce búsqueda 300ms
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Al buscar, precargar mascotas de clientes que aún no las tienen (para filtrar por nombre de mascota)
  useEffect(() => {
    if (!searchTerm || searchTerm.length < 2) return;
    const toLoad = clientes
      .filter((c) => c.id && !mascotasByClienteId[c.id] && !loadingMascotas[c.id])
      .slice(0, 15);
    toLoad.forEach((c) => c.id && loadMascotasForCliente(c.id));
  }, [searchTerm, clientes]);

  // Carga inicial optimizada: solo campos básicos
  const loadClientes = async () => {
    setLoading(true);
    try {
      const data = await getClientesBasic(tenantId);
      setClientes(data);
      // Cargar mascotas solo para los primeros 10 clientes (lazy load el resto)
      const primeros = data.slice(0, 10);
      const map: Record<string, Mascota[]> = {};
      for (const c of primeros) {
        if (c.id) {
          try {
            map[c.id] = await getMascotas(tenantId, c.id);
          } catch {
            map[c.id] = [];
          }
        }
      }
      setMascotasByClienteId(map);
    } catch (error) {
      console.error("Error fetching clientes:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los clientes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Cargar mascotas bajo demanda
  const loadMascotasForCliente = async (clienteId: string) => {
    if (mascotasByClienteId[clienteId]) return; // Ya cargado
    setLoadingMascotas((prev) => ({ ...prev, [clienteId]: true }));
    try {
      const mascotas = await getMascotas(tenantId, clienteId);
      setMascotasByClienteId((prev) => ({ ...prev, [clienteId]: mascotas }));
    } catch {
      setMascotasByClienteId((prev) => ({ ...prev, [clienteId]: [] }));
    } finally {
      setLoadingMascotas((prev => {
        const next = { ...prev };
        delete next[clienteId];
        return next;
      }));
    }
  };

  useEffect(() => {
    loadClientes();
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return clientes;
    const t = searchTerm.toLowerCase();
    return clientes.filter((c) => {
      const matchCliente =
        c.nombre?.toLowerCase().includes(t) ||
        c.email?.toLowerCase().includes(t) ||
        c.telefono?.includes(searchTerm) ||
        c.dni?.includes(searchTerm) ||
        (c.domicilio && c.domicilio.toLowerCase().includes(t));
      if (matchCliente) return true;
      const mascotas = c.id ? mascotasByClienteId[c.id] : undefined;
      if (mascotas?.length) {
        return mascotas.some(
          (m) =>
            m.nombre?.toLowerCase().includes(t) ||
            m.tipo?.toLowerCase().includes(t) ||
            m.raza?.toLowerCase().includes(t)
        );
      }
      return false;
    });
  }, [clientes, searchTerm, mascotasByClienteId]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setEditDialogOpen(true);
  };

  const openEdit = (c: Cliente) => {
    setEditingId(c.id ?? null);
    setForm({
      nombre: c.nombre ?? "",
      telefono: c.telefono ?? "",
      email: c.email ?? "",
      dni: c.dni ?? "",
      domicilio: c.domicilio ?? "",
    });
    setEditDialogOpen(true);
  };

  const openDetails = async (c: Cliente) => {
    setDetailsDialogOpen(true);
    setLoadingDetails(true);
    try {
      if (c.id) {
        const completo = await getClienteCompleto(tenantId, c.id);
        if (completo) {
          setDetailsCliente(completo);
        } else {
          setDetailsCliente(c);
        }
      } else {
        setDetailsCliente(c);
      }
    } catch (error) {
      console.error("Error loading cliente details:", error);
      setDetailsCliente(c);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSave = async () => {
    if (!form.nombre.trim() || !form.telefono.trim() || !form.email.trim()) {
      toast({
        title: "Campos requeridos",
        description: "Nombre, teléfono y email son obligatorios",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateCliente(tenantId, editingId, form);
        toast({
          title: "Cliente actualizado",
          description: "Los datos se guardaron correctamente",
        });
      } else {
        await createCliente(tenantId, form);
        toast({
          title: "Cliente agregado",
          description: form.dni ? "Cliente registrado o actualizado según DNI" : "El cliente se registró correctamente",
        });
      }
      setEditDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      await loadClientes();
    } catch (error) {
      console.error("Error saving cliente:", error);
      toast({
        title: "Error",
        description: "No se pudo guardar el cliente",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-2 sm:p-3 lg:p-6">
        <div className="mb-2 sm:mb-4 lg:mb-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-1">
              <Skeleton className="h-6 w-48 sm:w-64" />
              <Skeleton className="h-4 w-36 sm:w-52" />
            </div>
          </div>
        </div>
        <Card className="border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-9 w-full sm:w-64 rounded-md" />
            </div>
          </CardHeader>
          <CardContent className="p-0 sm:p-2 lg:p-4">
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <TableHead className="w-[180px]">Nombre</TableHead>
                    <TableHead className="w-[100px]">DNI</TableHead>
                    <TableHead className="w-[120px]">Teléfono</TableHead>
                    <TableHead className="w-[160px]">Email</TableHead>
                    <TableHead className="min-w-[140px]">Mascotas</TableHead>
                    <TableHead className="w-[140px] text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i} className="border-slate-200 dark:border-slate-800">
                      <TableCell><div className="flex items-center gap-2"><Skeleton className="h-8 w-8 rounded-full shrink-0" /><Skeleton className="h-4 w-28" /></div></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-2 sm:p-3 lg:p-6">
      {/* Header */}
      <div className="mb-2 sm:mb-4 lg:mb-6 relative">
        <div className="absolute inset-0 bg-slate-200/50 dark:bg-slate-800/50 blur-3xl" />
        <div className="relative backdrop-blur-xl bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl lg:rounded-2xl p-2 sm:p-3 lg:p-6 shadow-2xl">
          <div className="flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 lg:p-3 rounded-lg sm:rounded-xl bg-slate-700 dark:bg-slate-600 shadow-xl">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 text-white" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-xl lg:text-3xl font-black text-slate-900 dark:text-slate-100 truncate">
                  Gestión de Clientes
                </h1>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5 text-[9px] sm:text-[10px] lg:text-sm font-medium truncate">
                  DNI como clave única – deduplicación automática
                </p>
              </div>
            </div>
            <Button
              onClick={openAdd}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg h-8 sm:h-9 lg:h-10 text-[10px] sm:text-xs lg:text-sm"
            >
              <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Agregar cliente
            </Button>
          </div>
        </div>
      </div>

      {/* Card con tabla */}
      <Card className="border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl overflow-hidden">
        <CardHeader className="pb-1.5 sm:pb-2 lg:pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-xs sm:text-sm lg:text-base font-bold text-slate-900 dark:text-white">
                Listado de clientes
              </CardTitle>
              <CardDescription className="text-[8px] sm:text-[9px] lg:text-[10px] text-slate-600 dark:text-slate-400">
                {filtered.length} cliente{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
              <Input
                placeholder="Buscar por DNI, nombre, mascota, teléfono..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 border-slate-300 dark:border-slate-700 text-xs sm:text-sm h-8 sm:h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-2 lg:p-4">
          <div className="w-full overflow-x-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-center px-4">
                <Users className="h-10 w-10 sm:h-12 sm:w-12 text-slate-400 dark:text-slate-600 mb-3" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {searchTerm ? "No se encontraron clientes" : "No hay clientes registrados"}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                  {!searchTerm && "Usa «Agregar cliente» para registrar el primero."}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <TableHead className="text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                      Nombre
                    </TableHead>
                    <TableHead className="text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                      DNI
                    </TableHead>
                    <TableHead className="text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                      Teléfono
                    </TableHead>
                    <TableHead className="text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                      Email
                    </TableHead>
                    <TableHead className="text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide min-w-[140px] sm:min-w-[180px]">
                      Mascotas
                    </TableHead>
                    <TableHead className="text-right text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide w-[140px] sm:w-[180px]">
                      Acciones
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => {
                    const mascotas = c.id ? mascotasByClienteId[c.id] : undefined;
                    const isLoadingMascotas = c.id ? loadingMascotas[c.id] : false;
                    
                    return (
                      <TableRow
                        key={c.id}
                        className="border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        onMouseEnter={() => c.id && !mascotas && !isLoadingMascotas && loadMascotasForCliente(c.id)}
                      >
                        <TableCell className="text-xs sm:text-sm">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center shrink-0 text-slate-700 dark:text-slate-200 font-semibold text-xs"
                              title={c.nombre ?? ""}
                            >
                              {getIniciales(c.nombre ?? "")}
                            </div>
                            <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {c.nombre}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-mono">
                          {c.dni || "—"}
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-700 dark:text-slate-300">{c.telefono}</span>
                            {c.telefono && (
                              <a
                                href={getWhatsAppUrl(c.telefono)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800/50 transition-colors"
                                title="Abrir WhatsApp"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300 text-xs sm:text-sm break-all">
                          {c.email}
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm">
                          {isLoadingMascotas ? (
                            <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                          ) : mascotas ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {mascotas.map((m) => {
                                const Icon = getMascotaIcon(m.tipo ?? "");
                                return (
                                  <Badge
                                    key={m.id}
                                    variant="secondary"
                                    className="font-normal text-[10px] sm:text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-0 inline-flex items-center gap-1"
                                  >
                                    <Icon className="h-3 w-3 shrink-0" />
                                    {m.nombre ?? "—"} · {m.tipo ?? "—"}
                                  </Badge>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openDetails(c)}
                              className="h-7 sm:h-8 text-[10px] sm:text-xs border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-300 dark:hover:border-emerald-700"
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Ver detalles
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEdit(c)}
                              className="h-7 sm:h-8 text-[10px] sm:text-xs border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:border-rose-300 dark:hover:border-rose-700"
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Editar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modal Ver Detalles */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="sm:max-w-lg border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="border-b border-slate-200 dark:border-slate-800 pb-3 sm:pb-4 shrink-0">
            <DialogTitle className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
              Detalles del cliente
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Datos completos y historial de cambios
            </DialogDescription>
          </DialogHeader>
          {loadingDetails ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            </div>
          ) : detailsCliente ? (
            <ScrollArea className="flex-1 min-h-0 py-2">
              <div className="space-y-4 pr-3">
                <div className="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div
                    className="h-12 w-12 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center shrink-0 text-slate-700 dark:text-slate-200 font-bold text-lg"
                    title={detailsCliente.nombre ?? ""}
                  >
                    {getIniciales(detailsCliente.nombre ?? "")}
                  </div>
                  <div>
                    <Label className="text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Cliente</Label>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{detailsCliente.nombre}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">DNI</Label>
                    <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5 font-mono">{detailsCliente.dni || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Teléfono</Label>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-sm text-slate-700 dark:text-slate-300">{detailsCliente.telefono}</p>
                      {detailsCliente.telefono && (
                        <a
                          href={getWhatsAppUrl(detailsCliente.telefono)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800/50 transition-colors"
                          title="Abrir WhatsApp"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Email</Label>
                    <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5 break-all">{detailsCliente.email}</p>
                  </div>
                  <div>
                    <Label className="text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Dirección</Label>
                    {detailsCliente.domicilio ? (
                      <a
                        href={buildMapsUrl(detailsCliente.domicilio)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400 hover:underline mt-0.5"
                      >
                        <MapPin className="h-3 w-3 shrink-0" />
                        {detailsCliente.domicilio}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    ) : (
                      <p className="text-sm text-slate-500 dark:text-slate-500 mt-0.5">—</p>
                    )}
                  </div>
                </div>
                
                {detailsCliente.historialDatos && detailsCliente.historialDatos.length > 0 && (
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <History className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      <Label className="text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Cambios anteriores</Label>
                    </div>
                    <div className="space-y-2">
                      {detailsCliente.historialDatos.map((h, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-2 text-xs"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">{h.campo}</span>
                            <span className="text-slate-500 dark:text-slate-500">
                              {new Date(h.fechaCambio).toLocaleDateString("es-AR")}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-slate-600 dark:text-slate-400">
                              <span className="font-medium">Antes:</span> {h.valorAnterior || "—"}
                            </p>
                            <p className="text-slate-700 dark:text-slate-300">
                              <span className="font-medium">Ahora:</span> {h.valorNuevo || "—"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
                  <Label className="text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Mascotas vinculadas</Label>
                  {detailsCliente.mascotas && detailsCliente.mascotas.length > 0 ? (
                    <ul className="mt-2 space-y-2">
                      {detailsCliente.mascotas.map((m) => {
                        const Icon = getMascotaIcon(m.tipo ?? "");
                        return (
                          <li
                            key={m.id}
                            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-2 text-xs sm:text-sm"
                          >
                            <div className="h-8 w-8 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-300">
                              <Icon className="h-4 w-4" />
                            </div>
                            <Badge variant="secondary" className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border-0 font-semibold">
                              {m.nombre}
                            </Badge>
                            <span className="text-slate-600 dark:text-slate-400">{m.tipo}</span>
                            {m.raza ? <span className="text-slate-500 dark:text-slate-500">· {m.raza}</span> : null}
                            {m.edad ? <span className="text-slate-500 dark:text-slate-500">· {m.edad}</span> : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">Sin mascotas registradas</p>
                  )}
                </div>
              </div>
            </ScrollArea>
          ) : null}
          <DialogFooter className="flex gap-2 sm:gap-3 pt-2 sm:pt-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <Button
              variant="outline"
              onClick={() => setDetailsDialogOpen(false)}
              className="flex-1 border-2 border-slate-300 dark:border-slate-700 h-8 sm:h-9 text-[10px] sm:text-xs"
            >
              Cerrar
            </Button>
            {detailsCliente && (
              <Button
                onClick={() => {
                  setDetailsDialogOpen(false);
                  openEdit(detailsCliente);
                }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg h-8 sm:h-9 text-[10px] sm:text-xs"
              >
                <Edit className="h-3 w-3 mr-1" />
                Editar cliente
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Agregar/Editar */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl">
          <DialogHeader className="border-b border-slate-200 dark:border-slate-800 pb-3 sm:pb-4">
            <DialogTitle className="text-base sm:text-lg lg:text-xl font-black text-slate-900 dark:text-slate-100">
              {editingId ? "Editar cliente" : "Agregar cliente"}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              {editingId ? "Modifica los datos del cliente." : "DNI como clave única. Si existe, se actualizará automáticamente."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4 py-2 sm:py-3 lg:py-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="cliente-nombre" className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                Nombre *
              </Label>
              <Input
                id="cliente-nombre"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Nombre completo"
                className="border-2 border-slate-300 dark:border-slate-700 h-8 sm:h-9 lg:h-10 text-xs sm:text-sm"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="cliente-dni" className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                DNI
              </Label>
              <Input
                id="cliente-dni"
                value={form.dni}
                onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value }))}
                placeholder="Clave única (opcional)"
                className="border-2 border-slate-300 dark:border-slate-700 h-8 sm:h-9 lg:h-10 text-xs sm:text-sm font-mono"
                disabled={!!editingId}
              />
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Si el DNI ya existe, se actualizará el cliente existente en lugar de crear uno nuevo.
              </p>
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="cliente-telefono" className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                Teléfono *
              </Label>
              <Input
                id="cliente-telefono"
                value={form.telefono}
                onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                placeholder="Ej. 11 1234-5678"
                className="border-2 border-slate-300 dark:border-slate-700 h-8 sm:h-9 lg:h-10 text-xs sm:text-sm"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="cliente-email" className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                Email *
              </Label>
              <Input
                id="cliente-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="correo@ejemplo.com"
                className="border-2 border-slate-300 dark:border-slate-700 h-8 sm:h-9 lg:h-10 text-xs sm:text-sm"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="cliente-domicilio" className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                Dirección
              </Label>
              <Input
                id="cliente-domicilio"
                value={form.domicilio}
                onChange={(e) => setForm((f) => ({ ...f, domicilio: e.target.value }))}
                placeholder="Dirección para atención a domicilio"
                className="border-2 border-slate-300 dark:border-slate-700 h-8 sm:h-9 lg:h-10 text-xs sm:text-sm"
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
