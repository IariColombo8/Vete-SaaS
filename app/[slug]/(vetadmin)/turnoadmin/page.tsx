"use client"

import { useSlug } from "@/context/slug-context"
import TurnosManagement from "@/components/admin/turnos-management"

export default function TurnoAdminPage() {
  const slug = useSlug()

  return <TurnosManagement tenantId={slug} />
}
