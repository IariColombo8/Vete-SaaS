// Guardar como: components/admin/StatsCard.tsx

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Activity, Clock, CheckCircle2 } from "lucide-react";
import type { Turno } from "@/lib/supabase/queries";

interface StatsCardProps {
  selectedDate: string;
  turnos: Turno[];
}

export function StatsCard({ selectedDate, turnos }: StatsCardProps) {
  const getTimeSlots = () => {
    const slots = [];
    for (let hour = 8; hour <= 20; hour++) {
      slots.push(`${String(hour).padStart(2, "0")}:00`);
    }
    return slots;
  };

  const selectedDateTurnos = turnos.filter((t) => t.turno.fecha === selectedDate);
  const pendientes = selectedDateTurnos.filter((t) => t.estado === "pendiente").length;
  const completados = selectedDateTurnos.filter((t) => t.estado === "completado").length;
  const totalSlots = getTimeSlots().length;
  const ocupacion = (
    (selectedDateTurnos.filter((t) => t.estado !== "cancelado").length / totalSlots) * 100
  ).toFixed(0);

  return (
    <Card>
      <CardHeader className="pb-1.5 sm:pb-2 lg:pb-3">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="p-1 sm:p-1.5 lg:p-2 rounded-md sm:rounded-lg bg-primary shadow-lg">
            <Activity
              className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-white"
              strokeWidth={2.5}
            />
          </div>
          <div>
            <CardTitle className="text-xs sm:text-sm lg:text-base font-bold text-foreground">
              Estadísticas
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("es-AR", {
                day: "numeric",
                month: "short",
              })}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 sm:space-y-2 lg:space-y-3 p-2 sm:p-3 lg:p-4">
        <div className="space-y-1 sm:space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground/80">
              Ocupación
            </span>
            <span className="font-black text-xs sm:text-sm lg:text-base text-foreground">
              {ocupacion}%
            </span>
          </div>
          <div className="h-1.5 sm:h-2 lg:h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 shadow-lg"
              style={{ width: `${ocupacion}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedDateTurnos.filter((t) => t.estado !== "cancelado").length} de {totalSlots}{" "}
            ocupados
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          <div className="p-1.5 sm:p-2 lg:p-3 rounded-md sm:rounded-lg bg-muted border border-border">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div className="p-0.5 sm:p-1 rounded-sm sm:rounded-md bg-amber-500 shadow-lg">
                <Clock
                  className="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 text-white"
                  strokeWidth={2.5}
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">
                  Pendientes
                </p>
                <p className="text-sm sm:text-base lg:text-lg font-black text-foreground">
                  {pendientes}
                </p>
              </div>
            </div>
          </div>

          <div className="p-1.5 sm:p-2 lg:p-3 rounded-md sm:rounded-lg bg-muted border border-border">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div className="p-0.5 sm:p-1 rounded-sm sm:rounded-md bg-success shadow-lg">
                <CheckCircle2
                  className="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 text-white"
                  strokeWidth={2.5}
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">
                  Completados
                </p>
                <p className="text-sm sm:text-base lg:text-lg font-black text-foreground">
                  {completados}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}