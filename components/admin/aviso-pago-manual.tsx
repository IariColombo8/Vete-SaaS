"use client"

import { Banknote, CircleAlert } from "lucide-react"
import { DIA_VENCIMIENTO, nombreMes, type EstadoCobroManual } from "@/lib/billing/cobro-manual"

/**
 * Aviso del panel para las veterinarias que pagan en efectivo: aparece desde
 * el día 7 si el mes no figura pago, y cambia a "atrasado" pasado el 10. No
 * bloquea nada; desaparece cuando el superadmin registra el pago.
 */
export function AvisoPagoManual({ estado }: { estado: EstadoCobroManual }) {
  const atrasado = estado.fase === "atrasado"
  const Icono = atrasado ? CircleAlert : Banknote
  return (
    <div
      role="status"
      className={
        atrasado
          ? "flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          : "flex items-start gap-2 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
      }
    >
      <Icono className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">
          {atrasado
            ? `El pago de VetPanel de ${nombreMes(estado.periodo)} está atrasado.`
            : `El pago de VetPanel de ${nombreMes(estado.periodo)} vence el ${DIA_VENCIMIENTO}.`}
        </p>
        <p className="text-xs opacity-80">
          Si ya pagaste, ignorá este aviso: desaparece cuando se registra el pago. El panel sigue funcionando normal.
        </p>
      </div>
    </div>
  )
}
