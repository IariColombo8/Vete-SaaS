import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { getUsuarioData } from "@/lib/firebase/auth"
import { DEFAULT_TENANT_ID } from "@/lib/config"

export function useCurrentTenantId() {
  const { user, loading: authLoading } = useAuth()
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }

    getUsuarioData(user.uid).then((data) => {
      if (data) {
        if (data.tenantId) {
          setTenantId(data.tenantId as string)
        } else if (data.isAdmin === true) {
          setTenantId(DEFAULT_TENANT_ID)
        }
      }
      setLoading(false)
    })
  }, [user, authLoading])

  return { tenantId, loading }
}
