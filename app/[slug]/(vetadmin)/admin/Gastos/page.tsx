"use client"

import { HandCoins } from "lucide-react"
import { useSlug } from "@/context/slug-context"
import { FeatureGate } from "@/components/admin/feature-gate"
import { GastosManagement } from "@/components/admin/gastos-management"

export default function GastosPage() {
  const slug = useSlug()

  return (
    <FeatureGate
      tenantId={slug}
      feature="ventas"
      titulo="Gastos"
      descripcion="Cargá los gastos fijos de todos los meses y los de única vez, y elegí si salen de la caja."
      planMinimo="Pro"
      icono={<HandCoins className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />}
    >
      <GastosManagement tenantId={slug} />
    </FeatureGate>
  )
}
