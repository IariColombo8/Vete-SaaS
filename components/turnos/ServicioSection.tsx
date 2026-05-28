import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText } from "lucide-react";
import type { ServicioTurnoConfig } from "@/lib/firebase/firestore";
import { SERVICIOS_DEFAULT } from "@/lib/turno-defaults";

interface ServicioSectionProps {
  formData: {
    servicio: string;
    motivo: string;
  };
  handleChange: (field: string, value: string) => void;
  serviciosConfig?: ServicioTurnoConfig[];
}

export function ServicioSection({
  formData,
  handleChange,
  serviciosConfig,
}: ServicioSectionProps) {
  const servicios = serviciosConfig?.length ? serviciosConfig : SERVICIOS_DEFAULT;

  return (
    <>
      {/* Selector de Servicio */}
      <div className="space-y-2">
        <Label
          htmlFor="servicio"
          className="text-sm font-semibold flex items-center gap-2"
        >
          <FileText className="h-4 w-4" />
          Servicio Requerido *
        </Label>
        <Select
          value={formData.servicio}
          onValueChange={(value) => handleChange("servicio", value)}
          required
        >
          <SelectTrigger id="servicio" className="h-auto min-h-[44px] border-2">
            <SelectValue placeholder="Selecciona el servicio que necesitas..." />
          </SelectTrigger>
          <SelectContent>
            {servicios.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <div className="flex flex-col items-start py-2">
                  <span className="font-semibold text-sm">
                    {s.emoji} {s.nombre}
                  </span>
                  {s.descripcion && (
                    <span className="text-xs text-muted-foreground mt-0.5">
                      {s.descripcion}
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="motivo" className="text-sm font-semibold">
          Motivo de la Consulta *
        </Label>
        <Textarea
          id="motivo"
          placeholder="Describe brevemente el motivo de la consulta..."
          value={formData.motivo}
          onChange={(e) => handleChange("motivo", e.target.value)}
          required
          rows={4}
          className="border-2 focus-visible:ring-primary/50 resize-none"
        />
      </div>
    </>
  );
}
