import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useReadOnly } from "@/lib/auth/read-only-context";

interface EditTurnoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editData: { fecha: string; hora: string };
  onEditDataChange: (data: { fecha: string; hora: string }) => void;
  onSave: () => void;
}

export function EditTurnoModal({
  open,
  onOpenChange,
  editData,
  onEditDataChange,
  onSave,
}: EditTurnoModalProps) {
  const readOnly = useReadOnly();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl">
        <DialogHeader className="border-b border-slate-200 dark:border-slate-800 pb-3 sm:pb-4">
          <DialogTitle className="text-base sm:text-lg lg:text-xl font-black text-slate-900 dark:text-slate-100">
            Editar Turno
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Modifica la fecha y hora del turno
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 sm:space-y-4 py-2 sm:py-3 lg:py-4">
          <div className="space-y-1.5 sm:space-y-2">
            <Label
              htmlFor="edit-fecha"
              className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300"
            >
              Fecha
            </Label>
            <Input
              id="edit-fecha"
              type="date"
              value={editData.fecha}
              onChange={(e) =>
                onEditDataChange({ ...editData, fecha: e.target.value })
              }
              className="border-2 border-slate-300 dark:border-slate-700 focus:border-indigo-500 dark:focus:border-indigo-500 font-semibold h-8 sm:h-9 lg:h-10 text-xs sm:text-sm"
            />
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label
              htmlFor="edit-hora"
              className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300"
            >
              Hora
            </Label>
            <Input
              id="edit-hora"
              type="time"
              value={editData.hora}
              onChange={(e) =>
                onEditDataChange({ ...editData, hora: e.target.value })
              }
              className="border-2 border-slate-300 dark:border-slate-700 focus:border-indigo-500 dark:focus:border-indigo-500 font-semibold h-8 sm:h-9 lg:h-10 text-xs sm:text-sm"
            />
          </div>
        </div>
        <DialogFooter className="flex gap-2 sm:gap-3 pt-2 sm:pt-3 lg:pt-4 border-t border-slate-200 dark:border-slate-800">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 border-2 border-slate-300 dark:border-slate-700 font-semibold h-8 sm:h-9 lg:h-10 text-[10px] sm:text-xs lg:text-sm"
          >
            Cancelar
          </Button>
          <Button
            onClick={onSave}
            disabled={readOnly}
            title={readOnly ? "Reactivá tu cuenta para editar" : undefined}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-lg h-8 sm:h-9 lg:h-10 text-[10px] sm:text-xs lg:text-sm"
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}