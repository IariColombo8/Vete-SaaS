import type React from "react"
import { ProtectedRoute } from "@/components/protected-route"

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute requiredRole="superadmin">{children}</ProtectedRoute>
}
