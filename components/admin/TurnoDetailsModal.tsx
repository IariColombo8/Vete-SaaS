import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Turno, Mascota } from "@/lib/firebase/firestore";
import {
  CheckCircle2,
  CalendarCheck,
  XCircle,
  Edit,
  Trash2,
  CalendarIcon,
  Clock,
  Users,
  Phone,
  MapPin,
  Mail,
  FileText,
  Sparkles,
  Syringe,
  Dog,
  Cat,
  Bird,
  PawPrint,
} from "lucide-react";

function getMascotaIcon(tipo: string) {
  const t = tipo?.toLowerCase() || "";
  if (t.includes("perro") || t.includes("dog")) return Dog;
  if (t.includes("gato") || t.includes("cat")) return Cat;
  if (t.includes("ave") || t.includes("bird") || t.includes("pájaro")) return Bird;
  return PawPrint;
}

interface TurnoDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  turno: Turno | null;
  mascotaDetails: Mascota | null;
  loadingMascota: boolean;
  onConfirm?: (turnoId: string) => void;
  onMarkCompleted: (turnoId: string) => void;
  onCancel: (turnoId: string) => void;
  onEdit: (turno: Turno) => void;
  onDelete: (turnoId: string) => void;
  onGenerateHistoria?: (turno: Turno) => void;
}

const getEstadoBadge = (estado: string) => {
  switch (estado) {
    case "pendiente":
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-300 border-0">
          <Clock className="h-3 w-3 mr-1" />
          Pendiente
        </Badge>
      );
    case "confirmado":
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-950/50 dark:text-blue-300 border-0">
          <CalendarCheck className="h-3 w-3 mr-1" />
          Confirmado
        </Badge>
      );
    case "completado":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 border-0">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Completado
        </Badge>
      );
    case "cancelado":
      return (
        <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-950/50 dark:text-rose-400 border-0">
          <XCircle className="h-3 w-3 mr-1" />
          Cancelado
        </Badge>
      );
    default:
      return <Badge variant="outline">{estado}</Badge>;
  }
};

export function TurnoDetailsModal({
  open,
  onOpenChange,
  turno,
  mascotaDetails,
  loadingMascota,
  onConfirm,
  onMarkCompleted,
  onCancel,
  onEdit,
  onDelete,
  onGenerateHistoria,
}: TurnoDetailsModalProps) {
  if (!turno) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b border-slate-200 dark:border-slate-800 pb-3 sm:pb-4">
          <DialogTitle className="text-base sm:text-lg lg:text-xl font-black text-slate-900 dark:text-slate-100">
            Detalles del Turno
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Información completa del turno y acciones disponibles
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4 lg:space-y-6 py-2 sm:py-3 lg:py-4">
          {/* Estado Badge */}
          <div className="flex items-center justify-center">
            <div className="scale-110 sm:scale-125">
              {getEstadoBadge(turno.estado)}
            </div>
          </div>

          {/* Grid de Información */}
          <div className="grid gap-3 sm:gap-4 lg:gap-6 sm:grid-cols-2">
            {/* Cliente */}
            <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-slate-700 dark:text-slate-300" />
                <h3 className="font-bold text-xs sm:text-sm lg:text-base text-slate-900 dark:text-slate-100">
                  Información del Cliente
                </h3>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <div>
                  <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1">
                    Nombre
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                    {turno.cliente.nombre}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1 flex items-center gap-1">
                    <Phone className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Teléfono
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                    {turno.cliente.telefono}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1 flex items-center gap-1">
                    <Mail className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Email
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 break-all">
                    {turno.cliente.email}
                  </p>
                </div>
                <div className="p-2 sm:p-2.5 lg:p-3 rounded-lg sm:rounded-xl bg-slate-100 dark:bg-slate-700 border-2 border-slate-300 dark:border-slate-600">
                  <p className="text-[9px] sm:text-[10px] lg:text-xs font-bold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4" />{" "}
                    Dirección de Atención
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                    {turno.cliente.domicilio || "No especificada"}
                  </p>
                </div>
              </div>
            </div>

            {/* Mascota */}
            <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                {(() => {
                  const MascotaIcon = getMascotaIcon(turno.mascota?.tipo ?? "");
                  return <MascotaIcon className="h-4 w-4 sm:h-5 sm:w-5 text-slate-700 dark:text-slate-300" />;
                })()}
                <h3 className="font-bold text-xs sm:text-sm lg:text-base text-slate-900 dark:text-slate-100">
                  Información de la Mascota
                </h3>
              </div>
              {loadingMascota ? (
                <div className="flex items-center justify-center py-4">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                </div>
              ) : (
                <div className="space-y-1.5 sm:space-y-2">
                  <div>
                    <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1">
                      Nombre
                    </p>
                    <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                      {turno.mascota.nombre}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <div>
                      <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1">
                        Tipo
                      </p>
                      <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 capitalize">
                        {turno.mascota.tipo}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1">
                        Raza
                      </p>
                      <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                        {mascotaDetails?.raza || "No especificada"}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <div>
                      <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1">
                        Edad
                      </p>
                      <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                        {mascotaDetails?.edad || "No especificada"}{" "}
                        {mascotaDetails?.edad ? "años" : ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1">
                        Peso
                      </p>
                      <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                        {mascotaDetails?.peso || "No especificado"}{" "}
                        {mascotaDetails?.peso ? "kg" : ""}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Información del Turno */}
          <div className="p-3 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
              <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5 text-slate-700 dark:text-slate-300" />
              <h3 className="font-bold text-xs sm:text-sm lg:text-base text-slate-900 dark:text-slate-100">
                Información del Turno
              </h3>
            </div>
            <div className="grid gap-2 sm:gap-3 grid-cols-3">
              <div>
                <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1">
                  Fecha
                </p>
                <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                  {new Date(
                    turno.turno.fecha + "T00:00:00"
                  ).toLocaleDateString("es-AR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div>
                <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1">
                  Hora
                </p>
                <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                  {turno.turno.hora}
                </p>
              </div>
              <div>
                <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1">
                  Estado
                </p>
                <div className="mt-1">{getEstadoBadge(turno.estado)}</div>
              </div>
            </div>
            <div className="mt-2 sm:mt-3">
              <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Servicio
                Requerido
              </p>
              <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 capitalize">
                {turno.servicio || "No especificado"}
                {turno.duracionMin && turno.duracionMin !== 60 ? ` · ${turno.duracionMin} min` : ""}
              </p>
            </div>

            {turno.profesionalNombre && (
              <div className="mt-2 sm:mt-3">
                <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Profesional
                </p>
                <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                  {turno.profesionalNombre}
                </p>
              </div>
            )}

            {/* NUEVO: Mostrar vacunas si el servicio es vacunación */}
            {turno.servicio === "vacunacion" && turno.vacunas && turno.vacunas.length > 0 && (
              <div className="mt-2 sm:mt-3 p-2 sm:p-2.5 lg:p-3 rounded-lg sm:rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <p className="text-[9px] sm:text-[10px] lg:text-xs font-bold text-blue-800 dark:text-blue-200 mb-1.5 sm:mb-2 flex items-center gap-1">
                  <Syringe className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Vacunas Seleccionadas
                </p>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {turno.vacunas.map((vacuna, index) => (
                    <Badge
                      key={index}
                      className="bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 border-0 text-[9px] sm:text-[10px]"
                    >
                      {vacuna}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-2 sm:mt-3 p-2 sm:p-2.5 lg:p-3 rounded-lg sm:rounded-xl bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600">
              <p className="text-[9px] sm:text-[10px] lg:text-xs font-bold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1">
                <FileText className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Motivo de
                Consulta
              </p>
              <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100">
                {turno.mascota.motivo || "No especificado"}
              </p>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap gap-2 sm:gap-3 pt-2 sm:pt-3 lg:pt-4 border-t border-slate-200 dark:border-slate-800">
            {(turno.estado === "pendiente" || turno.estado === "confirmado") && (
              <>
                {turno.estado === "pendiente" && onConfirm && (
                  <Button
                    onClick={() => turno.id && onConfirm(turno.id)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-lg h-8 sm:h-9 lg:h-10 text-[10px] sm:text-xs lg:text-sm"
                  >
                    <CalendarCheck className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Confirmar
                  </Button>
                )}
                <Button
                  onClick={() => turno.id && onMarkCompleted(turno.id)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg h-8 sm:h-9 lg:h-10 text-[10px] sm:text-xs lg:text-sm"
                >
                  <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  Completar
                </Button>
                {onGenerateHistoria && (
                  <Button
                    onClick={() => onGenerateHistoria(turno)}
                    variant="outline"
                    className="flex-1 border-2 border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-400 dark:hover:bg-teal-950/30 font-semibold h-8 sm:h-9 lg:h-10 text-[10px] sm:text-xs lg:text-sm"
                  >
                    <FileText className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Generar Historia Clínica
                  </Button>
                )}
                <Button
                  onClick={() => turno.id && onCancel(turno.id)}
                  variant="outline"
                  className="flex-1 border-2 border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/30 font-semibold h-8 sm:h-9 lg:h-10 text-[10px] sm:text-xs lg:text-sm"
                >
                  <XCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  Cancelar
                </Button>
              </>
            )}
            <Button
              onClick={() => onEdit(turno)}
              variant="outline"
              className="flex-1 border-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-950/30 font-semibold h-8 sm:h-9 lg:h-10 text-[10px] sm:text-xs lg:text-sm"
            >
              <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Editar
            </Button>
            <Button
              onClick={() => turno.id && onDelete(turno.id)}
              variant="outline"
              className="flex-1 border-2 border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-950/30 font-semibold h-8 sm:h-9 lg:h-10 text-[10px] sm:text-xs lg:text-sm"
            >
              <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Eliminar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}