// /components/turnos/MascotaSection.tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Heart, PlusCircle, Edit3 } from "lucide-react";
import type { MascotaTurnoConfig } from "@/lib/supabase/queries";
import { MASCOTAS_DEFAULT } from "@/lib/turno-defaults";

interface MascotaSectionProps {
  formData: {
    mascotaExistenteId: string;
    nombreMascota: string;
    tipoMascota: string;
    edadMascota: string;
    razaMascota: string;
    pesoMascota: string;
  };
  handleChange: (field: string, value: string) => void;
  mascotas: { id?: string; nombre: string; tipo: string; raza?: string }[];
  mostrarNuevaMascota: boolean;
  setMostrarNuevaMascota: (value: boolean) => void;
  mascotasConfig?: MascotaTurnoConfig[];
}

export function MascotaSection({
  formData,
  handleChange,
  mascotas,
  mostrarNuevaMascota,
  setMostrarNuevaMascota,
  mascotasConfig,
}: MascotaSectionProps) {
  const tiposMascota = mascotasConfig?.length ? mascotasConfig : MASCOTAS_DEFAULT;
  const mascotaSeleccionada = mascotas.find(
    (m) => m.id === formData.mascotaExistenteId
  );
  const esMascotaExistente =
    formData.mascotaExistenteId && formData.mascotaExistenteId !== "nueva";

  return (
    <div
      className="space-y-5 animate-in fade-in slide-in-from-left-4 duration-700"
      style={{ animationDelay: "200ms" }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Heart className="h-5 w-5 text-primary fill-current" />
        </div>
        <h3 className="text-xl font-bold">Informacion de la Mascota</h3>
      </div>

      {/* Selector OBLIGATORIO de mascota */}
      <div className="space-y-2">
        <Label htmlFor="mascotaExistente" className="text-sm font-semibold">
          Elegir Mascota *
        </Label>
        <Select
          value={formData.mascotaExistenteId || ""}
          onValueChange={(value) => handleChange("mascotaExistenteId", value)}
          required
        >
          <SelectTrigger
            id="mascotaExistente"
            className={`h-11 border-2 ${
              !formData.mascotaExistenteId
                ? "border-red-300 dark:border-red-800"
                : ""
            }`}
          >
            <SelectValue placeholder="Selecciona una mascota..." />
          </SelectTrigger>
          <SelectContent>
            {/* Opcion de registrar nueva mascota PRIMERO */}
            <SelectItem value="nueva">
              <div className="flex items-center gap-2">
                <PlusCircle className="h-4 w-4 text-primary" />
                <span className="font-semibold">+ Registrar nueva mascota</span>
              </div>
            </SelectItem>

            {/* Separador visual si hay mascotas */}
            {mascotas.length > 0 && (
              <div className="border-t border-border/50 my-2" />
            )}

            {/* Mascotas existentes */}
            {mascotas.map((mascota) => (
              <SelectItem key={mascota.id} value={mascota.id!}>
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {mascota.nombre} - {mascota.tipo}
                    {mascota.raza && ` (${mascota.raza})`}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Mensaje de ayuda */}
        {mascotas.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Tienes {mascotas.length} mascota{mascotas.length !== 1 ? "s" : ""}{" "}
            registrada{mascotas.length !== 1 ? "s" : ""}. Selecciona una o
            registra una nueva.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            No tienes mascotas registradas. Selecciona &quot;+ Registrar nueva
            mascota&quot;
          </p>
        )}
      </div>

      {/* Mensaje si es mascota existente */}
      {esMascotaExistente && (
        <div className="p-4 rounded-lg bg-blue-500/10 border-2 border-blue-500/20 animate-in fade-in duration-300">
          <p className="text-sm font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2">
            <Edit3 className="h-4 w-4" />
            Puedes modificar los datos de {mascotaSeleccionada?.nombre} si lo
            deseas
          </p>
        </div>
      )}

      {/* Formulario de mascota (solo se muestra si selecciono "nueva" o una existente) */}
      {formData.mascotaExistenteId && (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nombreMascota" className="text-sm font-semibold">
                Nombre de la Mascota *
              </Label>
              <Input
                id="nombreMascota"
                placeholder="Max"
                value={formData.nombreMascota}
                onChange={(e) => handleChange("nombreMascota", e.target.value)}
                required
                className="h-11 border-2 focus-visible:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipoMascota" className="text-sm font-semibold">
                Tipo de Mascota *
              </Label>
              <Select
                value={formData.tipoMascota}
                onValueChange={(value) => handleChange("tipoMascota", value)}
                required
              >
                <SelectTrigger id="tipoMascota" className="h-11 border-2">
                  <SelectValue placeholder="Selecciona..." />
                </SelectTrigger>
                <SelectContent>
                  {tiposMascota.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.emoji} {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="edadMascota" className="text-sm font-semibold">
                Edad
              </Label>
              <Input
                id="edadMascota"
                placeholder="2 años"
                value={formData.edadMascota}
                onChange={(e) => handleChange("edadMascota", e.target.value)}
                className="h-11 border-2 focus-visible:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="razaMascota" className="text-sm font-semibold">
                Raza
              </Label>
              <Input
                id="razaMascota"
                placeholder="Golden Retriever"
                value={formData.razaMascota}
                onChange={(e) => handleChange("razaMascota", e.target.value)}
                className="h-11 border-2 focus-visible:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pesoMascota" className="text-sm font-semibold">
                Peso
              </Label>
              <Input
                id="pesoMascota"
                placeholder="15 kg"
                value={formData.pesoMascota}
                onChange={(e) => handleChange("pesoMascota", e.target.value)}
                className="h-11 border-2 focus-visible:ring-primary/50"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
