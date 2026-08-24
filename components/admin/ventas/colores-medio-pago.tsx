import type { MedioPago } from "@/lib/supabase/types"

/** Un color propio por medio de pago, compartido entre el historial y el mini resumen. */
export const COLOR_MEDIO_PAGO: Record<MedioPago, string> = {
  efectivo: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  debito: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400",
  credito: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
  transferencia: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400",
}
