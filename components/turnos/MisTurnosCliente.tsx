"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Clock, Calendar, XCircle } from "lucide-react";
import type { Turno } from "@/lib/firebase/firestore";
import { TurnoForm } from "@/components/turnos/TurnoForm";

interface MisTurnosClienteProps {
  turnos: Turno[];
  onCancelar: (turno: Turno) => void;
  onRefresh: () => void;
}

function getFechaTurno(t: Turno) {
  return t.turno?.fecha ?? t.fecha ?? "";
}

export function MisTurnosCliente({ turnos, onCancelar, onRefresh }: MisTurnosClienteProps) {
  const [agendarOpen, setAgendarOpen] = useState(false);
  const hoy = new Date().toISOString().slice(0, 10);
  const manana = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const ordenados = useMemo(() => {
    return [...turnos].sort((a, b) => {
      const fa = getFechaTurno(a);
      const fb = getFechaTurno(b);
      if (fa !== fb) return fa.localeCompare(fb);
      return (a.turno?.hora ?? "").localeCompare(b.turno?.hora ?? "");
    });
  }, [turnos]);

  const isCancelable = (turno: Turno) => {
    const fecha = getFechaTurno(turno);
    return turno.estado === "pendiente" && fecha && fecha >= manana;
  };

  const esHoy = (turno: Turno) => {
    const fecha = getFechaTurno(turno);
    return turno.estado === "pendiente" && fecha === hoy;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
            Mis turnos
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Turnos registrados
          </p>
        </div>
        <Button onClick={() => setAgendarOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
          Agendar nuevo
        </Button>
      </div>

      {ordenados.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-6 text-center text-sm text-slate-500">
          No tenés turnos registrados.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {ordenados.map((turno) => {
            const fechaStr = getFechaTurno(turno);
            const fecha = fechaStr
              ? new Date(fechaStr + "T00:00:00").toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "—";
            return (
              <Card key={turno.id} className="border-slate-200 dark:border-slate-700">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {turno.mascota?.nombre || "Mascota"}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {turno.mascota?.tipo || "—"}
                      </p>
                    </div>
                    <Badge
                      className={
                        turno.estado === "pendiente"
                          ? "bg-amber-100 text-amber-700 border-0"
                          : turno.estado === "completado"
                          ? "bg-emerald-100 text-emerald-700 border-0"
                          : "bg-slate-200 text-slate-700 border-0"
                      }
                    >
                      {turno.estado}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{fecha}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{turno.turno?.hora ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {turno.servicio || "Consulta"}
                    </span>
                    {isCancelable(turno) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => onCancelar(turno)}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        Cancelar
                      </Button>
                    )}
                  </div>
                  {esHoy(turno) && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 pt-1">
                      El médico ya está de recorrido.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={agendarOpen} onOpenChange={setAgendarOpen}>
        <DialogContent className="sm:max-w-3xl border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Agendar turno</DialogTitle>
            <DialogDescription className="text-sm text-slate-600 dark:text-slate-400">
              Completá el formulario para reservar un nuevo turno.
            </DialogDescription>
          </DialogHeader>
          <TurnoForm
            redirectOnSuccess={false}
            onSuccess={() => {
              setAgendarOpen(false);
              onRefresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
