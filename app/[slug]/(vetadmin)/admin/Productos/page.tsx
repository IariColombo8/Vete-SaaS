"use client"

import { Package } from "lucide-react"
import { useSlug } from "@/context/slug-context"
import { FeatureGate } from "@/components/admin/feature-gate"
import { ProductosManagement } from "@/components/admin/productos-management"

export default function ProductosPage() {
  const slug = useSlug()

  return (
    <FeatureGate
      tenantId={slug}
      feature="productos"
      titulo="Productos y stock"
      descripcion="Cargá tu mercadería, controlá el stock, marcá ofertas y avisate de los vencimientos."
      planMinimo="Plus"
      icono={<Package className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />}
    >
      <ProductosManagement tenantId={slug} />
    </FeatureGate>
  )
}
