"use client"

import { Wallet } from "lucide-react"
import { useSlug } from "@/context/slug-context"
import { FeatureGate } from "@/components/admin/feature-gate"
import { CajaManagement } from "@/components/admin/caja-management"

export default function CajaPage() {
  const slug = useSlug()

  return (
    <FeatureGate
      tenantId={slug}
      feature="ventas"
      titulo="Caja"
      descripcion="Abrí y cerrá la caja del turno, mirá cuánto efectivo debería haber y controlá las diferencias de arqueo."
      planMinimo="Pro"
      icono={<Wallet className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />}
    >
      <CajaManagement tenantId={slug} />
    </FeatureGate>
  )
}
