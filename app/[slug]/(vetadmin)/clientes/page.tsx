"use client"

import { useSlug } from "@/context/slug-context"
import { ClientesManagement } from "@/components/admin/clientes-management"

export default function ClientesPage() {
  const slug = useSlug()

  return <ClientesManagement tenantId={slug} />
}
