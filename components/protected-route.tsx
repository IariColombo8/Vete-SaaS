"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { getUserRole } from "@/lib/firebase/auth"
import type { UserRole } from "@/lib/firebase/firestore"

interface Props {
  children: React.ReactNode
  requiredRole?: UserRole | UserRole[]
}

function hasRequiredRole(role: UserRole | null, required: UserRole | UserRole[]): boolean {
  if (!role) return false
  return Array.isArray(required) ? required.includes(role) : role === required
}

export function ProtectedRoute({ children, requiredRole }: Props) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [role, setRole] = useState<UserRole | null>(null)
  const [roleLoading, setRoleLoading] = useState(!!requiredRole)

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
      return
    }
    if (user && requiredRole) {
      getUserRole(user.uid).then((r) => {
        setRole(r)
        setRoleLoading(false)
        if (!hasRequiredRole(r, requiredRole)) {
          router.push("/")
        }
      })
    }
  }, [user, loading, router, requiredRole])

  if (loading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) return null
  if (requiredRole && !hasRequiredRole(role, requiredRole)) return null

  return <>{children}</>
}
