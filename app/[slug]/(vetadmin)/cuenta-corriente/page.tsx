"use client"

import { Wallet } from "lucide-react"
import { useSlug } from "@/context/slug-context"
import { FeatureGate } from "@/components/admin/feature-gate"
import { CuentaCorrienteManagement } from "@/components/admin/cuenta-corriente-management"

export default function CuentaCorrientePage() {
  const slug = useSlug()

  return (
    <FeatureGate
      tenantId={slug}
      feature="ventas"
      titulo="Cuenta corriente"
      descripcion="Vendé a cuenta y llevá el saldo de cada cliente, con sus pagos y su historial."
      planMinimo="Pro"
      icono={<Wallet className="h-6 w-6 text-rose-600 dark:text-rose-400" />}
    >
      <CuentaCorrienteManagement tenantId={slug} />
    </FeatureGate>
  )
}
