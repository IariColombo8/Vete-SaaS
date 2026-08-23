import { Label } from "@/components/ui/label";
import { MapPin, Home } from "lucide-react";
import type { Modalidad } from "@/lib/supabase/queries";

interface LugarSectionProps {
  modalidad: Modalidad;
  lugar: string;
  onLugarChange: (lugar: string) => void;
}

export function LugarSection({ modalidad, lugar, onLugarChange }: LugarSectionProps) {
  // Solo mostrar selector si la modalidad es "ambos"
  if (modalidad !== "ambos") return null;

  return (
    <div className="space-y-3">
      <Label className="text-sm font-semibold flex items-center gap-2">
        <MapPin className="h-4 w-4" />
        Lugar de atencion *
      </Label>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onLugarChange("local")}
          className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
            lugar === "local"
              ? "border-primary bg-primary/5 text-primary"
              : "border-muted hover:border-muted-foreground/30 text-muted-foreground"
          }`}
        >
          <MapPin className="h-6 w-6" />
          <span className="text-sm font-semibold">En el local</span>
          <span className="text-[11px] leading-tight">Voy a la clinica</span>
        </button>
        <button
          type="button"
          onClick={() => onLugarChange("domicilio")}
          className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
            lugar === "domicilio"
              ? "border-primary bg-primary/5 text-primary"
              : "border-muted hover:border-muted-foreground/30 text-muted-foreground"
          }`}
        >
          <Home className="h-6 w-6" />
          <span className="text-sm font-semibold">A domicilio</span>
          <span className="text-[11px] leading-tight">Que vengan a mi casa</span>
        </button>
      </div>
    </div>
  );
}
