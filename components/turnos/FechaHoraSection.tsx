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
import { useSlug } from "@/context/slug-context";
import type { HorarioTenant, ServicioTurnoConfig } from "@/lib/supabase/queries";
import { getHorariosForDay, computeSlotsForHorarios, computeClosedDays } from "@/hooks/turnos/useTurnoForm";

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
  /** Servicio elegido: si tiene horarios/cupo propios (ej: cirugía solo jueves), rigen sobre los del tenant. */
  servicioSel?: ServicioTurnoConfig;
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
  servicioSel,
}: FechaHoraSectionProps) {
  const slug = useSlug();
  const { turnosExistentes } = useDisponibilidadTurnos(slug);

  const horariosEfectivos = servicioSel?.horarios?.length ? servicioSel.horarios : tenantHorarios;
  const closedDaysEfectivos = servicioSel?.horarios?.length ? computeClosedDays(horariosEfectivos) : closedDays;
  const cupoSimultaneo = servicioSel?.cupoSimultaneo ?? 1;

  // Si hay slots con minutos (ej: cada 15 min), separamos la seleccion en Hora + Minutos
  // para no forzar una lista larga tipo "10:00, 10:15, 10:30...". Si todo es en punto, un solo Select alcanza.
  const usaMinutos = horariosDisponibles.some((h) => !h.endsWith(":00"));
  const [horaSel, minSel] = formData.hora ? formData.hora.split(":") : ["", ""];
  const horasDisponibles = Array.from(new Set(horariosDisponibles.map((h) => h.split(":")[0]))).sort();
  const minutosDisponibles = horaSel
    ? horariosDisponibles.filter((h) => h.startsWith(`${horaSel}:`)).map((h) => h.split(":")[1])
    : [];

  function onHoraSelect(hora: string) {
    const mins = horariosDisponibles.filter((h) => h.startsWith(`${hora}:`)).map((h) => h.split(":")[1]);
    handleChange("hora", `${hora}:${mins[0] ?? "00"}`);
  }
  function onMinutoSelect(min: string) {
    handleChange("hora", `${horaSel}:${min}`);
  }

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

                  // Dias cerrados segun configuracion (o los propios del servicio, si los tiene)
                  if (closedDaysEfectivos.includes(date.getDay())) return true;

                  // Dias bloqueados manualmente
                  const fechaStr = format(date, "yyyy-MM-dd");
                  if (diasBloqueados.includes(fechaStr)) return true;

                  // Dias llenos (todos los turnos de este servicio ocupados, respetando el cupo simultaneo)
                  const turnosDelDia = turnosExistentes.filter(
                    (t) => t.turno?.fecha === fechaStr && t.estado !== "cancelado"
                      && (!servicioSel || (t.servicio ?? "") === servicioSel.id)
                  );
                  const bloques = horariosEfectivos.length > 0
                    ? getHorariosForDay(date.getDay(), horariosEfectivos)
                    : [];
                  const totalSlots = bloques.length > 0
                    ? computeSlotsForHorarios(bloques, servicioSel?.duracionMin ?? 60).length
                    : 13;
                  if (turnosDelDia.length >= totalSlots * cupoSimultaneo) return true;

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
          {usaMinutos ? (
            <div className="flex gap-2">
              <select
                value={horaSel}
                onChange={(e) => onHoraSelect(e.target.value)}
                required
                className="flex-1 h-12 rounded-md border-2 bg-transparent px-3 text-base"
              >
                <option value="" disabled>Hora...</option>
                {horasDisponibles.map((h) => (
                  <option key={h} value={h}>{h} hs</option>
                ))}
              </select>
              <select
                value={minSel}
                onChange={(e) => onMinutoSelect(e.target.value)}
                disabled={!horaSel}
                required
                className="w-24 h-12 rounded-md border-2 bg-transparent px-3 text-base disabled:opacity-50"
              >
                <option value="" disabled>Min.</option>
                {minutosDisponibles.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          ) : (
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
          )}
          <p className="text-xs text-muted-foreground">
            {selectedDate
              ? `${horariosDisponibles.length} horario${horariosDisponibles.length !== 1 ? "s" : ""} disponible${horariosDisponibles.length !== 1 ? "s" : ""}`
              : "Primero selecciona una fecha"}
          </p>
        </div>
      </div>

      <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Nota:</strong> El turno esta
          sujeto a confirmacion. Nos pondremos en contacto contigo para
          coordinar.
        </p>
      </div>
    </div>
  );
}
