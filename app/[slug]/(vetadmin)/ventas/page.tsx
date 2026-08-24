"use client"

import { Receipt } from "lucide-react"
import { useSlug } from "@/context/slug-context"
import { FeatureGate } from "@/components/admin/feature-gate"
import { VentasManagement } from "@/components/admin/ventas-management"

export default function VentasPage() {
  const slug = useSlug()

  return (
    <FeatureGate
      tenantId={slug}
      feature="ventas"
      titulo="Dashboard de ventas"
      descripcion="Mirá cuánto facturaste, qué se vende más, cómo te pagan y cerrá la caja con arqueo."
      planMinimo="Pro"
      icono={<Receipt className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />}
    >
      <VentasManagement tenantId={slug} />
    </FeatureGate>
  )
}
