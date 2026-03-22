"use client"

import { useSlug } from "@/context/slug-context"
import { LibretaSanitariaManagement } from "@/components/admin/libreta-sanitaria-management"

export default function LibretaSanitariaPage() {
  const slug = useSlug()

  return <LibretaSanitariaManagement tenantId={slug} />
}
