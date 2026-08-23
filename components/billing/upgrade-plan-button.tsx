"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/config"
import { PLANS, normalizePlan, type PlanId } from "@/lib/plans"
import { track } from "@vercel/analytics"
import { Loader2, ArrowUpCircle } from "lucide-react"

/** Siguiente plan pago a ofrecer según el plan actual. `null` si ya está en el tope. */
function siguientePlan(actual: PlanId): PlanId | null {
  if (actual === "basico") return "plus"
  if (actual === "plus") return "pro"
  return null
}

interface Props {
  tenantId: string
  planActual: string | undefined
}

export function UpgradePlanButton({ tenantId, planActual }: Props) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const actual = normalizePlan(planActual)
  const target = siguientePlan(actual)
  if (!target) return null

  const handleUpgrade = async () => {
    if (!user) {
      toast({ title: "Iniciá sesión", description: "Necesitás estar logueado.", variant: "destructive" })
      return
    }
    setLoading(true)
    track("plan_upgrade_click", { tenant: tenantId, desde: actual, hacia: target })
    try {
      const { data: sesion } = await supabase.auth.getSession()
      const token = sesion.session?.access_token
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenantId, planId: target }),
      })
      const json = await res.json()
      if (json?.ok && json.initPoint) {
        window.location.href = json.initPoint
        return
      }
      toast({
        title: "No se pudo iniciar el pago",
        description: json?.error || "Intentá más tarde.",
        variant: "destructive",
      })
    } catch (error) {
      console.error("Error iniciando checkout:", error)
      toast({ title: "Error", description: "No se pudo iniciar el pago.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      size="sm"
      onClick={handleUpgrade}
      disabled={loading}
      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
    >
      {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ArrowUpCircle className="mr-1.5 h-3.5 w-3.5" />}
      Mejorar a {PLANS[target].nombre}
    </Button>
  )
}
