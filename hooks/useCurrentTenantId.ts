import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { getUsuarioData } from "@/lib/firebase/auth"

export function useCurrentTenantId() {
  const { user, loading: authLoading } = useAuth()
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }

    getUsuarioData(user.uid).then((data) => {
      setTenantId((data?.tenantId as string) ?? null)
      setLoading(false)
    })
  }, [user, authLoading])

  return { tenantId, loading }
}
