import { useEffect, useState } from "react"
import { getTenantFull } from "@/lib/supabase/queries"
import type { TenantFull } from "@/lib/supabase/queries"

export function useTenant(tenantId: string) {
  const [tenant, setTenant] = useState<TenantFull | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTenantFull(tenantId).then((t) => {
      setTenant(t)
      setLoading(false)
    })
  }, [tenantId])

  return { tenant, loading }
}
