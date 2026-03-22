import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useDisponibilidadTurnos } from "@/hooks/turnos/useDisponibilidadTurnos";
import type { HorarioTenant } from "@/lib/firebase/firestore";
import { diaToWeekdays, generateTimeSlots, getHorarioForDay } from "@/hooks/turnos/useTurnoForm";

interface FechaHoraSectionProps {
  selectedDate: Date | undefined;
  setSelectedDate: (date: Date | undefined) => void;
  formData: {
    hora: string;
    fecha: string;
  };
  handleChange: (field: string, value: string) => void;
  diasBloqueados: string[];
  horariosDisponibles: string[];
  closedDays: number[];
  tenantHorarios: HorarioTenant[];
}

export function FechaHoraSection({
  selectedDate,
  setSelectedDate,
  formData,
  handleChange,
  diasBloqueados,
  horariosDisponibles,
  closedDays,
  tenantHorarios,
}: FechaHoraSectionProps) {
  const { turnosExistentes } = useDisponibilidadTurnos();

  return (
    <div
      className="space-y-5 animate-in fade-in slide-in-from-left-4 duration-700"
      style={{ animationDelay: "300ms" }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <CalendarIcon className="h-5 w-5 text-primary" />
        </div>
        <h3 className="text-xl font-bold">Fecha y Hora del Turno</h3>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label
            htmlFor="fecha"
            className="text-sm font-semibold flex items-center gap-2"
          >
            <CalendarIcon className="h-4 w-4" />
            Fecha *
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full h-12 justify-start text-left font-normal border-2",
                  !selectedDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? (
                  format(selectedDate, "PPP", { locale: es })
                ) : (
                  <span>Selecciona una fecha</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  setSelectedDate(date);
                  if (date) {
                    handleChange("fecha", format(date, "yyyy-MM-dd"));
                  }
                }}
                disabled={(date) => {
                  // Fechas pasadas
                  if (date < new Date(new Date().setHours(0, 0, 0, 0))) return true;

                  // Días cerrados según configuración
                  if (closedDays.includes(date.getDay())) return true;

                  // Días bloqueados manualmente
                  const fechaStr = format(date, "yyyy-MM-dd");
                  if (diasBloqueados.includes(fechaStr)) return true;

                  // Días llenos (todos los turnos ocupados)
                  const turnosDelDia = turnosExistentes.filter(
                    (t: any) => t.turno?.fecha === fechaStr && t.estado !== "cancelado"
                  );
                  const horario = tenantHorarios.length > 0
                    ? getHorarioForDay(date.getDay(), tenantHorarios)
                    : null;
                  const totalSlots = (horario && !horario.cerrado)
                    ? generateTimeSlots(horario.apertura, horario.cierre).length
                    : 13;
                  if (turnosDelDia.length >= totalSlots) return true;

                  return false;
                }}
                initialFocus
                locale={es}
              />
            </PopoverContent>
          </Popover>
          <p className="text-xs text-muted-foreground">
            {diasBloqueados.length > 0
              ? `${diasBloqueados.length} fecha(s) bloqueada(s) por el administrador`
              : "Selecciona una fecha disponible"}
          </p>
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="hora"
            className="text-sm font-semibold flex items-center gap-2"
          >
            <Clock className="h-4 w-4" />
            Horario *
          </Label>
          <Select
            value={formData.hora}
            onValueChange={(value) => handleChange("hora", value)}
            required
          >
            <SelectTrigger className="h-12 border-2 text-base">
              <SelectValue placeholder="Selecciona un horario..." />
            </SelectTrigger>
            <SelectContent>
              {horariosDisponibles.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No hay horarios disponibles para esta fecha
                </div>
              ) : (
                horariosDisponibles.map((hora) => (
                  <SelectItem key={hora} value={hora}>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{hora} hs</span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {selectedDate
              ? `${horariosDisponibles.length} horario${horariosDisponibles.length !== 1 ? "s" : ""} disponible${horariosDisponibles.length !== 1 ? "s" : ""}`
              : "Primero seleccioná una fecha"}
          </p>
        </div>
      </div>

      <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Nota:</strong> El turno está
          sujeto a confirmación. Nos pondremos en contacto contigo para
          coordinar la visita a domicilio.
        </p>
      </div>
    </div>
  );
}
