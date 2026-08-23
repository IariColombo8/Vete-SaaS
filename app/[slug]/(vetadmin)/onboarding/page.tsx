"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSlug } from "@/context/slug-context"
import { updateTenantConfig, updateTurnoConfig } from "@/lib/supabase/queries"
import { ONBOARDING_TEMPLATES, type OnboardingTemplate } from "@/lib/onboarding/templates"
import { VACUNAS_DEFAULT } from "@/lib/turno-defaults"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { Check, ArrowRight, Loader2, Sparkles } from "lucide-react"

export default function OnboardingPage() {
  const slug = useSlug()
  const router = useRouter()
  const { toast } = useToast()
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const aplicarTemplate = async (template: OnboardingTemplate) => {
    setGuardando(true)
    try {
      await Promise.all([
        updateTenantConfig(slug, {
          modalidad: template.modalidad,
          horarios: template.horarios,
          servicios: template.serviciosPagina,
          onboardingCompletado: true,
        }),
        updateTurnoConfig(slug, {
          servicios: template.serviciosTurno,
          mascotas: template.mascotas,
          vacunas: VACUNAS_DEFAULT,
        }),
      ])
      toast({ title: "¡Listo!", description: "Tu veterinaria quedó configurada. Ajustá lo que quieras en Configuración." })
      router.push(`/${slug}/admin`)
    } catch (error) {
      console.error("Error aplicando template:", error)
      toast({ title: "Error", description: "No se pudo guardar. Intentá de nuevo.", variant: "destructive" })
      setGuardando(false)
    }
  }

  const saltar = async () => {
    setGuardando(true)
    try {
      await updateTenantConfig(slug, { onboardingCompletado: true })
    } catch {
      // best-effort
    }
    router.push(`/${slug}/admin`)
  }

  return (
    <>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <Sparkles className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-2xl font-extrabold">Configurá tu veterinaria en un click</h1>
          <p className="text-sm text-muted-foreground">
            Elegí un punto de partida. Pre-cargamos servicios y horarios — después ajustás todo en Configuración.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          {ONBOARDING_TEMPLATES.map((t) => {
            const activo = seleccionado === t.id
            return (
              <Card
                key={t.id}
                className={`cursor-pointer transition-all ${
                  activo ? "border-2 border-emerald-500 shadow-lg" : "border hover:border-emerald-300"
                }`}
                onClick={() => setSeleccionado(t.id)}
              >
                <CardContent className="p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">{t.emoji}</span>
                    {activo && <Check className="h-5 w-5 text-emerald-600" />}
                  </div>
                  <h3 className="font-bold text-sm">{t.nombre}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{t.descripcion}</p>
                  <ul className="text-[11px] text-muted-foreground space-y-0.5 pt-1">
                    {t.serviciosTurno.slice(0, 4).map((s) => (
                      <li key={s.id}>• {s.nombre} ({s.duracionMin} min)</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={saltar} disabled={guardando} className="text-muted-foreground">
            Saltar por ahora
          </Button>
          <Button
            onClick={() => {
              const t = ONBOARDING_TEMPLATES.find((x) => x.id === seleccionado)
              if (t) aplicarTemplate(t)
            }}
            disabled={!seleccionado || guardando}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Usar este template
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
      <Toaster />
    </>
  )
}
