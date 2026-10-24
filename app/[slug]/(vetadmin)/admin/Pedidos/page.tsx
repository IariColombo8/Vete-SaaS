"use client"

import { ClipboardList } from "lucide-react"
import { useSlug } from "@/context/slug-context"
import { FeatureGate } from "@/components/admin/feature-gate"
import { PedidosManagement } from "@/components/admin/pedidos-management"

export default function PedidosPage() {
  const slug = useSlug()

  return (
    <FeatureGate
      tenantId={slug}
      feature="ventas"
      titulo="Pedidos de la tienda web"
      descripcion="Tus clientes compran desde la vidriera y vos preparás, cobrás y despachás desde acá."
      planMinimo="Pro"
      icono={<ClipboardList className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />}
    >
      <PedidosManagement tenantId={slug} />
    </FeatureGate>
  )
}
