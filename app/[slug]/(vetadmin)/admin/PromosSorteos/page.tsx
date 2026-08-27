"use client"

import { Gift } from "lucide-react"
import { useSlug } from "@/context/slug-context"
import { FeatureGate } from "@/components/admin/feature-gate"
import { PromosSorteosManagement } from "@/components/admin/promos-sorteos-management"

export default function PromosSorteosPage() {
  const slug = useSlug()

  return (
    <FeatureGate
      tenantId={slug}
      feature="promosSorteos"
      titulo="Ofertas, promociones y sorteos"
      descripcion="Armá ofertas, combos de productos y sorteos para tus clientes."
      planMinimo="Pro"
      icono={<Gift className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />}
    >
      <PromosSorteosManagement tenantId={slug} />
    </FeatureGate>
  )
}
