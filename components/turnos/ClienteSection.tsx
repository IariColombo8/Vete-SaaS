import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Heart, CreditCard, MapPin, Loader2 } from "lucide-react";
import type { Cliente } from "@/lib/firebase/firestore";

interface ClienteSectionProps {
  formData: {
    nombre: string;
    telefono: string;
    email: string;
    dni: string;
    domicilio: string;
  };
  handleChange: (field: string, value: string) => void;
  clienteExistente: Cliente | null;
  loadingCliente: boolean;
  lockDni?: boolean;
}

export function ClienteSection({
  formData,
  handleChange,
  clienteExistente,
  loadingCliente,
  lockDni,
}: ClienteSectionProps) {
  return (
    <div
      className="space-y-5 animate-in fade-in slide-in-from-left-4 duration-700"
      style={{ animationDelay: "100ms" }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <User className="h-5 w-5 text-primary" />
        </div>
        <h3 className="text-xl font-bold">Información del Cliente</h3>
      </div>

      {/* Mensaje de cliente encontrado */}
      {clienteExistente && (
        <div className="p-4 rounded-lg bg-green-500/10 border-2 border-green-500/20 animate-in fade-in duration-300">
          <p className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
            <Heart className="h-4 w-4 fill-current" />
            ¡Cliente encontrado! Puedes modificar tus datos si lo deseas.
          </p>
        </div>
      )}

      {/* DNI - Campo principal de búsqueda */}
      <div className="space-y-2">
        <Label
          htmlFor="dni"
          className="text-sm font-semibold flex items-center gap-2"
        >
          <CreditCard className="h-4 w-4" />
          DNI *
        </Label>
        <div className="relative">
          <Input
            id="dni"
            placeholder="12345678"
            value={formData.dni}
            onChange={(e) => handleChange("dni", e.target.value)}
            required
            disabled={!!lockDni}
            className="h-11 border-2 focus-visible:ring-primary/50"
          />
          {loadingCliente && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Ingresa tu DNI para verificar si ya estás registrado
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nombre" className="text-sm font-semibold">
            Nombre y Apellido *
          </Label>
          <Input
            id="nombre"
            placeholder="Juan Pérez"
            value={formData.nombre}
            onChange={(e) => handleChange("nombre", e.target.value)}
            required
            className="h-11 border-2 focus-visible:ring-primary/50"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="telefono" className="text-sm font-semibold">
            Teléfono *
          </Label>
          <Input
            id="telefono"
            type="tel"
            placeholder="+54 9 379 466-2600"
            value={formData.telefono}
            onChange={(e) => handleChange("telefono", e.target.value)}
            required
            className="h-11 border-2 focus-visible:ring-primary/50"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-semibold">
          Email *
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="juan@ejemplo.com"
          value={formData.email}
          onChange={(e) => handleChange("email", e.target.value)}
          required
          className="h-11 border-2 focus-visible:ring-primary/50"
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="domicilio"
          className="text-sm font-semibold flex items-center gap-2"
        >
          <MapPin className="h-4 w-4" />
          Domicilio (para la visita) *
        </Label>
        <Input
          id="domicilio"
          placeholder="Calle 123, Barrio, Ciudad, Provincia"
          value={formData.domicilio}
          onChange={(e) => handleChange("domicilio", e.target.value)}
          required
          className="h-11 border-2 focus-visible:ring-primary/50"
        />
      </div>
    </div>
  );
}
