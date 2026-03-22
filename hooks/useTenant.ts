import { useEffect, useState } from "react"
import { getTenantFull } from "@/lib/firebase/firestore"
import type { TenantFull } from "@/lib/firebase/firestore"
import { DEFAULT_TENANT_ID } from "@/lib/config"

export function useTenant(tenantId: string = DEFAULT_TENANT_ID) {
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
