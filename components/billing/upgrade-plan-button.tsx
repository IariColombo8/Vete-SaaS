"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { PLANS, normalizePlan, PLAN_RECOMENDADO } from "@/lib/plans"
import { CheckoutDialog } from "@/components/billing/checkout-dialog"
import { track } from "@vercel/analytics"
import { ArrowUpCircle } from "lucide-react"

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
  const [abierto, setAbierto] = useState(false)

  const actual = normalizePlan(planActual)
  if (actual === PLAN_RECOMENDADO) return null

  const handleUpgrade = () => {
    track("plan_upgrade_click", { tenant: tenantId, desde: actual, hacia: PLAN_RECOMENDADO })
    setAbierto(true)
  }

  return (
    <>
      <Button
        size={size}
        onClick={handleUpgrade}
        className={className ?? "bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"}
      >
        <ArrowUpCircle className="mr-1.5 h-3.5 w-3.5" />
        {texto ?? `Mejorar a ${PLANS[PLAN_RECOMENDADO].nombre}`}
      </Button>
      <CheckoutDialog tenantId={tenantId} plan={abierto ? PLAN_RECOMENDADO : null} onClose={() => setAbierto(false)} />
    </>
  )
}
