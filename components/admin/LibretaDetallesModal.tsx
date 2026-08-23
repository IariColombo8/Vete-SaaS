"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CalendarIcon,
  Clock,
  Users,
  Phone,
  MapPin,
  PawPrint,
  Mail,
  FileText,
  Edit,
  Dog,
  Cat,
  Bird,
  Paperclip,
  Image,
  Film,
  File,
  ExternalLink,
} from "lucide-react";
import type { Cliente, Mascota, Historia, Turno } from "@/lib/supabase/queries";

function getMascotaIcon(tipo: string) {
  const t = tipo?.toLowerCase() || "";
  if (t.includes("perro") || t.includes("dog")) return Dog;
  if (t.includes("gato") || t.includes("cat")) return Cat;
  if (t.includes("ave") || t.includes("bird") || t.includes("pájaro")) return Bird;
  return PawPrint;
}

type LibretaDetallesModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo: "historia" | "turno";
  cliente: Cliente;
  mascota: Mascota;
  entrada: Historia | Turno;
  onEdit: () => void;
  /** Si la entrada es un turno completado y hay una nota clínica del mismo día, se muestra "Ver Nota Clínica". */
  historiaAsociada?: Historia | null;
  onVerNotaClinica?: () => void;
  onGenerarHistoria?: () => void;
};

export default function LibretaDetallesModal({
  open,
  onOpenChange,
  tipo,
  cliente,
  mascota,
  entrada,
  onEdit,
  historiaAsociada,
  onVerNotaClinica,
  onGenerarHistoria,
}: LibretaDetallesModalProps) {
  const MascotaIcon = getMascotaIcon(mascota?.tipo ?? "");

  const isHistoria = tipo === "historia";
  const h = isHistoria ? (entrada as Historia) : null;
  const t = !isHistoria ? (entrada as Turno) : null;

  const fechaStr = isHistoria
    ? (h?.fechaAtencion ?? "")
    : (t?.turno?.fecha ?? t?.fecha ?? "");
  const horaStr = !isHistoria ? (t?.turno?.hora ?? t?.hora ?? "") : "";
  const motivo = isHistoria ? (h?.motivo ?? "") : (t?.mascota?.motivo ?? "");
  const diagnostico = isHistoria ? (h?.diagnostico ?? "") : (t?.diagnostico ?? "");
  const tratamiento = isHistoria ? (h?.tratamiento ?? "") : (t?.tratamiento ?? "");
  const proximaVisita = isHistoria ? (h?.proximaVisita ?? "") : "";
  const observaciones = isHistoria ? (h?.observaciones ?? "") : (t?.observaciones ?? "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b border-slate-200 dark:border-slate-800 pb-3 sm:pb-4">
          <DialogTitle className="text-base sm:text-lg lg:text-xl font-black text-slate-900 dark:text-slate-100">
            Detalles de la {isHistoria ? "Consulta" : "Visita"}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Información completa del registro
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4 lg:space-y-6 py-2 sm:py-3 lg:py-4">
          {/* Grid: Cliente + Mascota (mismo layout que TurnoDetailsModal) */}
          <div className="grid gap-3 sm:gap-4 lg:gap-6 sm:grid-cols-2">
            {/* Información del Cliente */}
            <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-slate-700 dark:text-slate-300" />
                <h3 className="font-bold text-xs sm:text-sm lg:text-base text-slate-900 dark:text-slate-100">
                  Información del Cliente
                </h3>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <div>
                  <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1">
                    Nombre
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                    {cliente.nombre}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1 flex items-center gap-1">
                    <Phone className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Teléfono
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                    {cliente.telefono}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1 flex items-center gap-1">
                    <Mail className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Email
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 break-all">
                    {cliente.email}
                  </p>
                </div>
                <div className="p-2 sm:p-2.5 lg:p-3 rounded-lg sm:rounded-xl bg-slate-100 dark:bg-slate-700 border-2 border-slate-300 dark:border-slate-600">
                  <p className="text-[9px] sm:text-[10px] lg:text-xs font-bold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4" /> Dirección
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                    {cliente.domicilio || "No especificada"}
                  </p>
                </div>
              </div>
            </div>

            {/* Información de la Mascota */}
            <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                <MascotaIcon className="h-4 w-4 sm:h-5 sm:w-5 text-slate-700 dark:text-slate-300" />
                <h3 className="font-bold text-xs sm:text-sm lg:text-base text-slate-900 dark:text-slate-100">
                  Información de la Mascota
                </h3>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <div>
                  <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1">
                    Nombre
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                    {mascota.nombre}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1">
                      Tipo
                    </p>
                    <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 capitalize">
                      {mascota.tipo}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1">
                      Raza
                    </p>
                    <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                      {mascota.raza || "No especificada"}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1">
                      Edad
                    </p>
                    <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                      {mascota.edad || "No especificada"} {mascota.edad ? "años" : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1">
                      Peso
                    </p>
                    <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                      {mascota.peso || "No especificado"} {mascota.peso ? "kg" : ""}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Detalle Médico (mismo bloque que "Información del Turno" en TurnoDetailsModal) */}
          <div className="p-3 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
              <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5 text-slate-700 dark:text-slate-300" />
              <h3 className="font-bold text-xs sm:text-sm lg:text-base text-slate-900 dark:text-slate-100">
                Detalle Médico
              </h3>
            </div>
            <div className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-3">
              <div>
                <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1">
                  Fecha
                </p>
                <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                  {fechaStr
                    ? new Date(fechaStr + "T00:00:00").toLocaleDateString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })
                    : "—"}
                </p>
              </div>
              {horaStr ? (
                <div>
                  <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5 sm:mb-1 flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Hora
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                    {horaStr}
                  </p>
                </div>
              ) : null}
            </div>
            {motivo ? (
              <div className="mt-2 sm:mt-3 p-2 sm:p-2.5 lg:p-3 rounded-lg sm:rounded-xl bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600">
                <p className="text-[9px] sm:text-[10px] lg:text-xs font-bold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1">
                  <FileText className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Motivo
                </p>
                <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100">
                  {motivo}
                </p>
              </div>
            ) : null}
            <div className="mt-2 sm:mt-3">
              <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Diagnóstico
              </p>
              <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100">
                {diagnostico || "—"}
              </p>
            </div>
            <div className="mt-2 sm:mt-3">
              <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Tratamiento
              </p>
              <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100">
                {tratamiento || "—"}
              </p>
            </div>
            {proximaVisita ? (
              <div className="mt-2 sm:mt-3">
                <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Próxima visita
                </p>
                <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100">
                  {new Date(proximaVisita + "T00:00:00").toLocaleDateString("es-AR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </p>
              </div>
            ) : null}
            {observaciones ? (
              <div className="mt-2 sm:mt-3 p-2 sm:p-2.5 lg:p-3 rounded-lg sm:rounded-xl bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600">
                <p className="text-[9px] sm:text-[10px] lg:text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Observaciones
                </p>
                <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 whitespace-pre-wrap">
                  {observaciones}
                </p>
              </div>
            ) : null}
          </div>

          {/* Archivos adjuntos */}
          {isHistoria && h?.archivos && h.archivos.length > 0 && (
            <div className="p-3 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                <Paperclip className="h-4 w-4 sm:h-5 sm:w-5 text-slate-700 dark:text-slate-300" />
                <h3 className="font-bold text-xs sm:text-sm lg:text-base text-slate-900 dark:text-slate-100">
                  Adjuntos ({h.archivos.length})
                </h3>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {h.archivos.map((url, idx) => {
                  const isImage = /\.(jpg|jpeg|png|gif|webp|svg)/i.test(url);
                  const isVideo = /\.(mp4|webm|mov|avi)/i.test(url);
                  const isPdf = /\.pdf/i.test(url);
                  const IconFile = isImage ? Image : isVideo ? Film : isPdf ? FileText : File;
                  const label = isImage ? "Imagen" : isVideo ? "Video" : isPdf ? "PDF" : "Archivo";
                  return (
                    <a
                      key={idx}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                    >
                      {isImage ? (
                        <img src={url} alt={`Adjunto ${idx + 1}`} className="h-10 w-10 rounded object-cover shrink-0" />
                      ) : (
                        <div className="h-10 w-10 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                          <IconFile className="h-5 w-5 text-slate-500" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{label} {idx + 1}</p>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-emerald-500 shrink-0" />
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Acciones: Ver Nota Clínica / Generar Historia (solo para turnos) + Editar */}
          <div className="flex flex-wrap gap-2 sm:gap-3 pt-2 sm:pt-3 lg:pt-4 border-t border-slate-200 dark:border-slate-800">
            {!isHistoria && t && (
              <>
                {t.estado === "completado" && historiaAsociada && onVerNotaClinica && (
                  <Button
                    onClick={() => onVerNotaClinica()}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-semibold h-8 sm:h-9 lg:h-10 text-[10px] sm:text-xs lg:text-sm"
                  >
                    <FileText className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Ver Nota Clínica
                  </Button>
                )}
                {t.estado === "pendiente" && onGenerarHistoria && (
                  <Button
                    onClick={() => { onOpenChange(false); onGenerarHistoria(); }}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-semibold h-8 sm:h-9 lg:h-10 text-[10px] sm:text-xs lg:text-sm"
                  >
                    <FileText className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Generar Historia Clínica
                  </Button>
                )}
              </>
            )}
            <Button
              onClick={() => {
                onOpenChange(false);
                onEdit();
              }}
              variant="outline"
              className="flex-1 border-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-950/30 font-semibold h-8 sm:h-9 lg:h-10 text-[10px] sm:text-xs lg:text-sm"
            >
              <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Editar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
