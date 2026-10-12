import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Unlock } from "lucide-react";

interface BlockDateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  singleDateBlock: string;
  onSingleDateBlockChange: (date: string) => void;
  dateRangeStart: string;
  onDateRangeStartChange: (date: string) => void;
  dateRangeEnd: string;
  onDateRangeEndChange: (date: string) => void;
  onToggleSingleDate: (action: "block" | "unblock") => void;
  onToggleDateRange: (action: "block" | "unblock") => void;
}

export function BlockDateModal({
  open,
  onOpenChange,
  singleDateBlock,
  onSingleDateBlockChange,
  dateRangeStart,
  onDateRangeStartChange,
  dateRangeEnd,
  onDateRangeEndChange,
  onToggleSingleDate,
  onToggleDateRange,
}: BlockDateModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="border-b border-slate-200 dark:border-slate-800 pb-3 sm:pb-4">
          <DialogTitle className="text-base sm:text-lg lg:text-xl font-black text-slate-900 dark:text-slate-100">
            Gestionar Fechas Bloqueadas
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Bloquea o desbloquea un día o rango de fechas
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 sm:space-y-5 py-2 sm:py-3 lg:py-4">
          {/* Un Solo Día */}
          <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
              Un Solo Día
            </h3>
            <div className="space-y-1.5 sm:space-y-2">
              <Label
                htmlFor="single-date"
                className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300"
              >
                Fecha
              </Label>
              <Input
                id="single-date"
                type="date"
                value={singleDateBlock}
                onChange={(e) => onSingleDateBlockChange(e.target.value)}
                className="border-2 border-slate-300 dark:border-slate-700 focus:border-indigo-500 dark:focus:border-indigo-500 font-semibold h-8 sm:h-9 lg:h-10 text-xs sm:text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => onToggleSingleDate("block")}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-lg h-7 sm:h-8 text-[10px] sm:text-xs"
              >
                <Lock className="h-3 w-3 mr-1" />
                Bloquear
              </Button>
              <Button
                onClick={() => onToggleSingleDate("unblock")}
                variant="outline"
                className="flex-1 border-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30 font-semibold h-7 sm:h-8 text-[10px] sm:text-xs"
              >
                <Unlock className="h-3 w-3 mr-1" />
                Habilitar
              </Button>
            </div>
          </div>

          {/* Rango de fechas */}
          <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
              Rango de Fechas
            </h3>
            <div className="space-y-1.5 sm:space-y-2">
              <Label
                htmlFor="date-range-start"
                className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300"
              >
                Fecha de inicio
              </Label>
              <Input
                id="date-range-start"
                type="date"
                value={dateRangeStart}
                onChange={(e) => onDateRangeStartChange(e.target.value)}
                className="border-2 border-slate-300 dark:border-slate-700 focus:border-indigo-500 dark:focus:border-indigo-500 font-semibold h-8 sm:h-9 lg:h-10 text-xs sm:text-sm"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label
                htmlFor="date-range-end"
                className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300"
              >
                Fecha de fin
              </Label>
              <Input
                id="date-range-end"
                type="date"
                value={dateRangeEnd}
                onChange={(e) => onDateRangeEndChange(e.target.value)}
                className="border-2 border-slate-300 dark:border-slate-700 focus:border-indigo-500 dark:focus:border-indigo-500 font-semibold h-8 sm:h-9 lg:h-10 text-xs sm:text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => onToggleDateRange("block")}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-lg h-7 sm:h-8 text-[10px] sm:text-xs"
              >
                <Lock className="h-3 w-3 mr-1" />
                Bloquear
              </Button>
              <Button
                onClick={() => onToggleDateRange("unblock")}
                variant="outline"
                className="flex-1 border-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30 font-semibold h-7 sm:h-8 text-[10px] sm:text-xs"
              >
                <Unlock className="h-3 w-3 mr-1" />
                Habilitar
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}