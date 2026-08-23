// Guardar como: components/admin/NextAppointmentCard.tsx

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, PawPrint, ArrowRight } from "lucide-react";
import type { Turno } from "@/lib/supabase/queries";

interface NextAppointmentCardProps {
  turnos: Turno[];
  selectedDate: string;
  onViewDetails: (turno: Turno) => void;
}

export function NextAppointmentCard({
  turnos,
  selectedDate,
  onViewDetails,
}: NextAppointmentCardProps) {
  const selectedDateTurnos = turnos.filter((t) => t.turno.fecha === selectedDate);
  const pendientes = selectedDateTurnos.filter((t) => t.estado === "pendiente");

  if (pendientes.length === 0) return null;

  const proximoTurno = pendientes.sort((a, b) =>
    a.turno.hora.localeCompare(b.turno.hora)
  )[0];

  return (
    <Card className="border-0 bg-gradient-to-br from-slate-700 to-slate-800 dark:from-slate-800 dark:to-slate-900 shadow-2xl">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-2 sm:gap-3">
          <div className="p-2 sm:p-2.5 rounded-xl bg-white/20 backdrop-blur-sm">
            <Sparkles
              className="h-5 w-5 sm:h-6 sm:w-6 text-white"
              strokeWidth={2.5}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] sm:text-xs font-bold text-white/90 mb-1">
              PRÓXIMO TURNO
            </p>
            <p className="text-xl sm:text-2xl lg:text-3xl font-black text-white mb-1">
              {proximoTurno.turno.hora}
            </p>
            <p className="text-sm sm:text-base font-bold text-white/95 truncate">
              {proximoTurno.cliente.nombre}
            </p>
            <p className="text-xs sm:text-sm text-white/80 truncate flex items-center gap-1">
              <PawPrint className="h-3 w-3" />
              {proximoTurno.mascota.nombre} ({proximoTurno.mascota.tipo})
            </p>
            <Button
              onClick={() => onViewDetails(proximoTurno)}
              className="mt-2 sm:mt-3 w-full bg-white text-slate-800 hover:bg-white/90 font-bold shadow-lg text-xs sm:text-sm h-8 sm:h-9"
            >
              Ver Detalles y Aceptar
              <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 ml-1.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}