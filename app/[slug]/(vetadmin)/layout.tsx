"use client"

import { useSlug } from "@/context/slug-context"
import { VetAdminLayout } from "@/components/vet-admin-layout"
import type React from "react"

export default function VetAdminGroupLayout({ children }: { children: React.ReactNode }) {
  const slug = useSlug()
  return <VetAdminLayout slug={slug}>{children}</VetAdminLayout>
}
