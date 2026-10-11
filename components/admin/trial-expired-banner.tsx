"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertTriangle, Loader2, MessageCircle } from "lucide-react"
import { SERVITEC } from "@/lib/marca"
import { formatPrecioPlan, type PlanId } from "@/lib/plans"
import { useToast } from "@/hooks/use-toast"
import { iniciarCheckout } from "@/components/billing/use-billing"

const WHATSAPP_SERVITEC = "https://wa.me/5493442646670"

interface Props {
  tenantId: string
  /** Solo el veterinario dueño contrata el plan; el empleado ve el aviso. */
  puedeGestionar: boolean
  /** Por qué está bloqueado: terminó la prueba, o se canceló la suscripción. */
  motivo: "trial" | "suscripcion"
}

/**
 * Aviso de panel en solo lectura: la prueba terminó o la suscripción se
 * cortó. El dueño contrata acá mismo Básico o Pro (checkout de Mercado Pago).
 * Antes mandaba a hablar con ServiTec por WhatsApp; eso queda como ayuda.
 */
export function TrialExpiredBanner({ tenantId, puedeGestionar, motivo }: Props) {
  const { toast } = useToast()
  const [ocupado, setOcupado] = useState<PlanId | null>(null)

  async function suscribirse(plan: PlanId) {
    setOcupado(plan)
    try {
      window.location.href = await iniciarCheckout(tenantId, plan)
    } catch (error) {
      toast({
        title: "No se pudo iniciar el pago",
        description: error instanceof Error ? error.message : "Intentá más tarde.",
        variant: "destructive",
      })
      setOcupado(null)
    }
  }

  const titulo =
    motivo === "trial"
      ? "Tu prueba gratis de 10 días terminó. El panel quedó en modo solo lectura."
      : "Tu suscripción no está activa. El panel quedó en modo solo lectura."

  return (
    <div className="flex flex-col gap-3 border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-2 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">{titulo}</p>
          <p className="text-xs opacity-80">
            {puedeGestionar
              ? `Elegí un plan para seguir operando: Básico ${formatPrecioPlan("basico")}/mes o Pro ${formatPrecioPlan("pro")}/mes. Tus datos están guardados y no se tocan.`
              : "Pedile al dueño de la veterinaria que contrate un plan desde Configuración → Plan."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {puedeGestionar && (
          <>
            <button
              type="button"
              onClick={() => suscribirse("pro")}
              disabled={ocupado !== null}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {ocupado === "pro" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Contratar Pro
            </button>
            <button
              type="button"
              onClick={() => suscribirse("basico")}
              disabled={ocupado !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-600 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60 dark:text-amber-300 dark:hover:bg-amber-900/40"
            >
              {ocupado === "basico" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Contratar Básico
            </button>
            <Link
              href={`/${tenantId}/admin/Configuracion?tab=plan`}
              className="inline-flex items-center rounded-md px-2 py-1.5 text-xs font-medium underline-offset-2 hover:underline"
            >
              Comparar planes
            </Link>
          </>
        )}
        <a
          href={WHATSAPP_SERVITEC}
          target="_blank"
          rel="noopener noreferrer"
          title={`Hablar con ${SERVITEC.nombre}`}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium hover:underline"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Ayuda
        </a>
      </div>
    </div>
  )
}
