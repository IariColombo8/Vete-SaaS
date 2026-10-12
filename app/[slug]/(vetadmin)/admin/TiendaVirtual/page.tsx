"use client"

import { useSlug } from "@/context/slug-context"
import { TiendaVirtualManagement } from "@/components/admin/tienda-virtual-management"

export default function TiendaVirtualPage() {
  const slug = useSlug()
  return <TiendaVirtualManagement tenantId={slug} />
}
