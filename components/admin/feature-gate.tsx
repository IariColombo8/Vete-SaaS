"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { Loader2, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getTenantConfig } from "@/lib/supabase/queries"
import { getPlan, planAllows, type Feature } from "@/lib/plans"

interface Props {
  tenantId: string
  feature: Feature
  titulo: string
  /** Qué hace la sección, para el cartel de upsell. */
  descripcion: string
  /** Nombre del plan mínimo que la habilita ("Plus", "Pro"). */
  planMinimo: string
  icono: ReactNode
  children: ReactNode
}

/**
 * Muestra la sección solo si el plan del tenant la incluye; si no, un cartel
 * con el link a los planes.
 *
 * Está extraído porque productos, el mostrador y el dashboard de ventas
 * necesitan exactamente lo mismo, incluido el detalle importante: si la lectura
 * del plan falla se bloquea, que es la opción segura frente a habilitar una
 * feature paga por un error de red.
 */
export function FeatureGate({
  tenantId,
  feature,
  titulo,
  descripcion,
  planMinimo,
  icono,
  children,
}: Props) {
  const [habilitado, setHabilitado] = useState<boolean | null>(null)
  const [planActual, setPlanActual] = useState("")

  useEffect(() => {
    let vigente = true

    getTenantConfig(tenantId)
      .then((config) => {
        if (!vigente) return
        setPlanActual(getPlan(config?.plan).nombre)
        setHabilitado(planAllows(config?.plan, feature))
      })
      .catch(() => {
        if (vigente) setHabilitado(false)
      })

    return () => {
      vigente = false
    }
  }, [tenantId, feature])

  if (habilitado === null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!habilitado) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
          {icono}
        </div>
        <h1 className="mb-2 text-xl font-bold">{titulo}</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {descripcion} Disponible desde el plan {planMinimo}
          {planActual && (
            <>
              {" "}
              — tu plan actual es <strong>{planActual}</strong>
            </>
          )}
          .
        </p>
        <Link href="/pricing">
          <Button className="bg-emerald-600 hover:bg-emerald-700">
            <Lock className="mr-2 h-4 w-4" /> Ver planes
          </Button>
        </Link>
      </div>
    )
  }

  return <>{children}</>
}
