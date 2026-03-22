"use client"

import { TurnoForm } from "@/components/turnos/TurnoForm"
import { Toaster } from "@/components/ui/toaster"
import { useSlug } from "@/context/slug-context"

export default function VetTurnoPage() {
  const slug = useSlug()

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-muted/30 via-muted/50 to-muted/30 py-8 md:py-16 overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute bottom-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "1s" }}
        />
      </div>

      <div className="container max-w-4xl px-4 sm:px-6 lg:px-8 space-y-6">
        <TurnoForm tenantId={slug} />
      </div>

      <Toaster />
    </main>
  )
}
