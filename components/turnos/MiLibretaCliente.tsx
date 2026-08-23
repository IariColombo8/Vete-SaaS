"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Mascota, Turno } from "@/lib/supabase/queries";
import { Calendar, Clock, FileText } from "lucide-react";

interface MiLibretaClienteProps {
  mascotas: Mascota[];
  turnos: Turno[];
}

export function MiLibretaCliente({ mascotas, turnos }: MiLibretaClienteProps) {
  const [selectedMascotaId, setSelectedMascotaId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedMascotaId && mascotas.length > 0) {
      setSelectedMascotaId(mascotas[0].id ?? null);
    }
  }, [mascotas, selectedMascotaId]);

  const turnosMascota = useMemo(() => {
    const mascota = mascotas.find((m) => m.id === selectedMascotaId);
    if (!mascota) return [];
    const nombre = (mascota.nombre ?? "").trim().toLowerCase();
    const turnosMascota = turnos.filter((t) => {
      const tn = (t.mascota?.nombre ?? "").trim().toLowerCase();
      return t.mascotaId === mascota.id || tn === nombre;
    });
    return turnosMascota.sort((a, b) => {
      const fa = a.turno?.fecha ?? a.fecha ?? "";
      const fb = b.turno?.fecha ?? b.fecha ?? "";
      if (fa !== fb) return fb.localeCompare(fa);
      return (b.turno?.hora ?? "").localeCompare(a.turno?.hora ?? "");
    });
  }, [mascotas, selectedMascotaId, turnos]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {mascotas.map((m) => (
          <Button
            key={m.id}
            variant={selectedMascotaId === m.id ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setSelectedMascotaId(m.id ?? null)}
          >
            {m.nombre}
          </Button>
        ))}
      </div>

      {turnosMascota.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-6 text-center text-sm text-slate-500">
          No hay turnos para esta mascota.
        </div>
      ) : (
        <div className="space-y-3">
          {turnosMascota.map((t) => {
            const fechaStr = t.turno?.fecha ?? t.fecha ?? "";
            const fecha = fechaStr
              ? new Date(fechaStr + "T00:00:00").toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "—";
            return (
              <Card key={t.id} className="border-slate-200 dark:border-slate-700">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge
                      className={
                        t.estado === "pendiente"
                          ? "bg-amber-100 text-amber-700 border-0"
                          : t.estado === "completado"
                          ? "bg-emerald-100 text-emerald-700 border-0"
                          : "bg-slate-200 text-slate-700 border-0"
                      }
                    >
                      {t.estado}
                    </Badge>
                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5" />
                      {fecha}
                      <Clock className="h-3.5 w-3.5" />
                      {t.turno?.hora ?? "—"}
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {t.mascota?.motivo || "Turno"}
                  </p>
                  <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    {t.servicio || "Consulta"}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
