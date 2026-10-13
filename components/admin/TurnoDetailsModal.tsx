import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import type { Turno, Mascota } from "@/lib/supabase/queries";
import {
  CheckCircle2,
  CalendarCheck,
  XCircle,
  Edit,
  Trash2,
  CalendarIcon,
  Users,
  Phone,
  MapPin,
  Mail,
  FileText,
  Sparkles,
  Syringe,
} from "lucide-react";

import { IconoMascota } from "@/components/admin/icono-mascota";
import { EstadoTurnoBadge } from "@/components/admin/estado-badge";

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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b border-border pb-3 sm:pb-4">
          <DialogTitle className="text-base sm:text-lg lg:text-xl font-black text-foreground">
            Detalles del Turno
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
            Información completa del turno y acciones disponibles
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4 lg:space-y-6 py-2 sm:py-3 lg:py-4">
          {/* Estado Badge */}
          <div className="flex items-center justify-center">
            <div className="scale-110 sm:scale-125">
              <EstadoTurnoBadge estado={turno.estado} />
            </div>
          </div>

          {/* Grid de Información */}
          <div className="grid gap-3 sm:gap-4 lg:gap-6 sm:grid-cols-2">
            {/* Cliente */}
            <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl bg-muted/50 border border-border">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-foreground/80" />
                <h3 className="font-bold text-xs sm:text-sm lg:text-base text-foreground">
                  Información del Cliente
                </h3>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-0.5 sm:mb-1">
                    Nombre
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-foreground">
                    {turno.cliente.nombre}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-0.5 sm:mb-1 flex items-center gap-1">
                    <Phone className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Teléfono
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-foreground">
                    {turno.cliente.telefono}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-0.5 sm:mb-1 flex items-center gap-1">
                    <Mail className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Email
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-foreground break-all">
                    {turno.cliente.email}
                  </p>
                </div>
                <div className="p-2 sm:p-2.5 lg:p-3 rounded-lg sm:rounded-xl bg-muted border-2 border-input">
                  <p className="text-xs font-bold text-foreground mb-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4" />{" "}
                    Dirección de Atención
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-foreground">
                    {turno.cliente.domicilio || "No especificada"}
                  </p>
                </div>
              </div>
            </div>

            {/* Mascota */}
            <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl bg-muted/50 border border-border">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                <IconoMascota tipo={turno.mascota?.tipo} className="h-4 w-4 sm:h-5 sm:w-5 text-foreground/80" />
                <h3 className="font-bold text-xs sm:text-sm lg:text-base text-foreground">
                  Información de la Mascota
                </h3>
              </div>
              {loadingMascota ? (
                <div className="flex items-center justify-center py-4">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-input border-t-slate-600" />
                </div>
              ) : (
                <div className="space-y-1.5 sm:space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-0.5 sm:mb-1">
                      Nombre
                    </p>
                    <p className="text-xs sm:text-sm font-bold text-foreground">
                      {turno.mascota.nombre}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-0.5 sm:mb-1">
                        Tipo
                      </p>
                      <p className="text-xs sm:text-sm font-bold text-foreground capitalize">
                        {turno.mascota.tipo}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-0.5 sm:mb-1">
                        Raza
                      </p>
                      <p className="text-xs sm:text-sm font-bold text-foreground">
                        {mascotaDetails?.raza || "No especificada"}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-0.5 sm:mb-1">
                        Edad
                      </p>
                      <p className="text-xs sm:text-sm font-bold text-foreground">
                        {mascotaDetails?.edad || "No especificada"}{" "}
                        {mascotaDetails?.edad ? "años" : ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-0.5 sm:mb-1">
                        Peso
                      </p>
                      <p className="text-xs sm:text-sm font-bold text-foreground">
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
          <div className="p-3 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl bg-muted/50 border border-border">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
              <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5 text-foreground/80" />
              <h3 className="font-bold text-xs sm:text-sm lg:text-base text-foreground">
                Información del Turno
              </h3>
            </div>
            <div className="grid gap-2 sm:gap-3 grid-cols-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-0.5 sm:mb-1">
                  Fecha
                </p>
                <p className="text-xs sm:text-sm font-bold text-foreground">
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
                <p className="text-xs font-semibold text-muted-foreground mb-0.5 sm:mb-1">
                  Hora
                </p>
                <p className="text-xs sm:text-sm font-bold text-foreground">
                  {turno.turno.hora}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-0.5 sm:mb-1">
                  Estado
                </p>
                <div className="mt-1"><EstadoTurnoBadge estado={turno.estado} /></div>
              </div>
            </div>
            <div className="mt-2 sm:mt-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Servicio
                Requerido
              </p>
              <p className="text-xs sm:text-sm font-bold text-foreground capitalize">
                {turno.servicio || "No especificado"}
                {turno.duracionMin && turno.duracionMin !== 60 ? ` · ${turno.duracionMin} min` : ""}
              </p>
            </div>

            {turno.profesionalNombre && (
              <div className="mt-2 sm:mt-3">
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  Profesional
                </p>
                <p className="text-xs sm:text-sm font-bold text-foreground">
                  {turno.profesionalNombre}
                </p>
              </div>
            )}

            {/* NUEVO: Mostrar vacunas si el servicio es vacunación */}
            {turno.servicio === "vacunacion" && turno.vacunas && turno.vacunas.length > 0 && (
              <div className="mt-2 sm:mt-3 p-2 sm:p-2.5 lg:p-3 rounded-lg sm:rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <p className="text-xs font-bold text-blue-800 dark:text-blue-200 mb-1.5 sm:mb-2 flex items-center gap-1">
                  <Syringe className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Vacunas Seleccionadas
                </p>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {turno.vacunas.map((vacuna, index) => (
                    <Badge
                      key={index}
                      className="bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 border-0 text-[11px] sm:text-xs"
                    >
                      {vacuna}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-2 sm:mt-3 p-2 sm:p-2.5 lg:p-3 rounded-lg sm:rounded-xl bg-muted border border-input">
              <p className="text-xs font-bold text-foreground mb-1 flex items-center gap-1">
                <FileText className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Motivo de
                Consulta
              </p>
              <p className="text-xs sm:text-sm font-medium text-foreground">
                {turno.mascota.motivo || "No especificado"}
              </p>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap gap-2 sm:gap-3 pt-2 sm:pt-3 lg:pt-4 border-t border-border">
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
                  className="flex-1 bg-primary hover:bg-primary/90 text-white font-semibold shadow-lg h-8 sm:h-9 lg:h-10 text-[10px] sm:text-xs lg:text-sm"
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
              className="flex-1 border-2 border-primary/40 text-primary hover:bg-accent font-semibold h-8 sm:h-9 lg:h-10 text-[10px] sm:text-xs lg:text-sm"
            >
              <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Editar
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="flex-1 border-2 border-input text-foreground/80 hover:bg-muted font-semibold h-8 sm:h-9 lg:h-10 text-[10px] sm:text-xs lg:text-sm"
                >
                  <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  Eliminar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar este turno?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se borra de la agenda y no se puede recuperar. Si el cliente no viene, mejor usá “Cancelar”: queda registrado.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Volver</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => turno.id && onDelete(turno.id)}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Eliminar turno
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}