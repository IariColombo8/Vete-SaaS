"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { PLANS, normalizePlan, PLAN_RECOMENDADO } from "@/lib/plans"
import { iniciarCheckout } from "@/components/billing/use-billing"
import { track } from "@vercel/analytics"
import { Loader2, ArrowUpCircle } from "lucide-react"

interface Props {
  tenantId: string
  planActual: string | undefined
  /** Texto alternativo del botón (por defecto "Mejorar a Pro"). */
  texto?: string
  size?: "sm" | "default" | "lg"
  className?: string
}

/**
 * Lleva al checkout de Mercado Pago para pasar a Pro. Se oculta si el tenant
 * ya está en Pro: con dos planes no hay "siguiente".
 */
export function UpgradePlanButton({ tenantId, planActual, texto, size = "sm", className }: Props) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const actual = normalizePlan(planActual)
  if (actual === PLAN_RECOMENDADO) return null

  const handleUpgrade = async () => {
    setLoading(true)
    track("plan_upgrade_click", { tenant: tenantId, desde: actual, hacia: PLAN_RECOMENDADO })
    try {
      // Navega fuera de la página: nada de lo que venga después se ejecuta.
      window.location.href = await iniciarCheckout(tenantId, PLAN_RECOMENDADO)
    } catch (error) {
      toast({
        title: "No se pudo iniciar el pago",
        description: error instanceof Error ? error.message : "Intentá más tarde.",
        variant: "destructive",
      })
      setLoading(false)
    }
  }

  return (
    <Button
      size={size}
      onClick={handleUpgrade}
      disabled={loading}
      className={className ?? "bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"}
    >
      {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ArrowUpCircle className="mr-1.5 h-3.5 w-3.5" />}
      {texto ?? `Mejorar a ${PLANS[PLAN_RECOMENDADO].nombre}`}
    </Button>
  )
}
