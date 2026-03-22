"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { Loader2 } from "lucide-react"

export default function AdminRedirect() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) { router.push("/login"); return }
    getDoc(doc(db, "usuarios", user.uid)).then((snap) => {
      const tenantId = snap.data()?.tenantId
      if (tenantId) {
        router.replace(`/${tenantId}/dashboard`)
      } else {
        router.replace("/registro")
      }
    })
  }, [user, loading, router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}
