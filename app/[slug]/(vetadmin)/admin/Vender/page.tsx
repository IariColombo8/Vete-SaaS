"use client"

import { ShoppingCart } from "lucide-react"
import { useSlug } from "@/context/slug-context"
import { FeatureGate } from "@/components/admin/feature-gate"
import { PosManagement } from "@/components/admin/pos-management"

export default function PosPage() {
  const slug = useSlug()

  return (
    <FeatureGate
      tenantId={slug}
      feature="ventas"
      titulo="Punto de venta"
      descripcion="Cobrá en el mostrador con lector de código de barras, vendé alimento por kilo o por bolsa, manejá la caja y mandá el remito por WhatsApp."
      planMinimo="Pro"
      icono={<ShoppingCart className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />}
    >
      <PosManagement tenantId={slug} />
    </FeatureGate>
  )
}
