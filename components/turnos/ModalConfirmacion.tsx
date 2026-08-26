import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CalendarIcon,
  Clock,
  User,
  Heart,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatearEdad, type UnidadEdad } from "@/lib/mascotas/edad";

interface ModalConfirmacionProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  formData: {
    nombre: string;
    telefono: string;
    email: string;
    dni: string;
    domicilio: string;
    nombreMascota: string;
    tipoMascota: string;
    edadValorMascota: string;
    edadUnidadMascota: UnidadEdad;
    razaMascota: string;
    pesoMascota: string;
    servicio: string;
    motivo: string;
    fecha: string;
    hora: string;
    vacunas: string[]; // NUEVO
  };
  selectedDate?: Date;
  loading: boolean;
}

export function ModalConfirmacion({
  open,
  onClose,
  onConfirm,
  formData,
  selectedDate,
  loading,
}: ModalConfirmacionProps) {
  const servicioNombres: Record<string, string> = {
    "consulta-general": "🩺 Consultas Generales",
    telemedicina: "💻 Telemedicina",
    vacunacion: "💉 Vacunación",
    urgencias: "🚨 Urgencias",
  };

  // NUEVO: Mapeo de IDs de vacunas a nombres legibles
  const vacunaNombres: Record<string, string> = {
    // Perros
    "antirrabica": "Antirrábica",
    "quintuple": "Quíntuple",
    "sextuple": "Séxtuple",
    // Gatos
    "triple-felina": "Triple Felina",
    "leucemia-felina": "Leucemia Felina",
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pb-1 space-y-1">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-primary" />
            Confirmar Turno
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Información del Cliente */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 pb-0.5 border-b">
              <User className="h-3.5 w-3.5 text-primary" />
              <h3 className="font-semibold text-xs">Cliente</h3>
            </div>
            <div className="text-[11px] space-y-0.5">
              <p className="font-medium">{formData.nombre}</p>
              <p className="text-muted-foreground">DNI: <span className="text-foreground font-medium">{formData.dni}</span> • Tel: <span className="text-foreground font-medium">{formData.telefono}</span></p>
            </div>
          </div>

          {/* Información de la Mascota */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 pb-0.5 border-b">
              <Heart className="h-3.5 w-3.5 text-primary fill-primary/20" />
              <h3 className="font-semibold text-xs">Mascota</h3>
            </div>
            <div className="text-[11px] space-y-0.5">
              <p className="font-medium">{formData.nombreMascota} • <span className="capitalize">{formData.tipoMascota}</span></p>
              {(() => {
                const edadTexto = formData.edadValorMascota
                  ? formatearEdad({ valor: Number(formData.edadValorMascota), unidad: formData.edadUnidadMascota })
                  : "";
                return (formData.razaMascota || edadTexto) && (
                  <p className="text-muted-foreground">
                    {formData.razaMascota && <span>Raza: <span className="text-foreground font-medium">{formData.razaMascota}</span></span>}
                    {formData.razaMascota && edadTexto && " • "}
                    {edadTexto && <span>Edad: <span className="text-foreground font-medium">{edadTexto}</span></span>}
                  </p>
                );
              })()}
            </div>
          </div>

          {/* Servicio */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 pb-0.5 border-b">
              <FileText className="h-3.5 w-3.5 text-primary" />
              <h3 className="font-semibold text-xs">Servicio</h3>
            </div>
            <div className="text-[11px] space-y-0.5">
              <p className="font-medium">{servicioNombres[formData.servicio] || formData.servicio}</p>
              
              {/* NUEVO: Mostrar vacunas si el servicio es vacunación */}
              {formData.servicio === "vacunacion" && formData.vacunas && formData.vacunas.length > 0 && (
                <div className="mt-1.5 pl-2 border-l-2 border-primary/30 bg-primary/5 rounded-r py-1 pr-2">
                  <p className="text-muted-foreground text-[10px] mb-0.5 font-semibold">Vacunas seleccionadas:</p>
                  <ul className="space-y-0.5">
                    {formData.vacunas.map((vacunaId, index) => (
                      <li key={index} className="text-foreground font-medium flex items-center gap-1">
                        <span className="text-primary">•</span>
                        {vacunaNombres[vacunaId] || vacunaId}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              <p className="text-muted-foreground line-clamp-1 mt-1">{formData.motivo}</p>
            </div>
          </div>

          {/* Fecha y Hora */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 pb-0.5 border-b">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <h3 className="font-semibold text-xs">Fecha y Hora</h3>
            </div>
            <div className="text-[11px]">
              <p className="font-medium">
                {selectedDate
                  ? format(selectedDate, "PPP", { locale: es })
                  : formData.fecha}
                {" • "}
                {formData.hora} hs
              </p>
            </div>
          </div>

          {/* Aviso */}
          <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-[10px] text-muted-foreground">
              <strong className="text-foreground">📧</strong> Confirmación: <strong className="text-foreground">{formData.email}</strong>
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="flex-1 sm:flex-none h-9 text-xs"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="bg-gradient-to-r from-primary to-primary/90 flex-1 sm:flex-none h-9 text-xs"
          >
            {loading ? (
              <span className="flex items-center gap-1.5">
                <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Confirmando...
              </span>
            ) : (
              "Confirmar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}