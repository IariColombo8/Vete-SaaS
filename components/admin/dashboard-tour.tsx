"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { driver } from "driver.js"
import "driver.js/dist/driver.css"

const PASOS = [
  {
    element: '[data-tour="plan"]',
    popover: {
      title: "Tu plan",
      description: "Acá ves tu plan actual y el uso de turnos del mes. Podés mejorarlo cuando lo necesites.",
    },
  },
  {
    element: '[data-tour="accesos"]',
    popover: {
      title: "Accesos rápidos",
      description: "Desde acá llegás a turnos, libreta sanitaria, clientes y configuración.",
    },
  },
  {
    element: '[data-tour="enlaces"]',
    popover: {
      title: "Tus enlaces",
      description: "Compartí tu página pública y el link para sacar turnos con tus clientes.",
    },
  },
  {
    element: '[data-tour="metricas"]',
    popover: {
      title: "Métricas",
      description: "Seguí la evolución de tus turnos, servicios más pedidos y más.",
    },
  },
  {
    element: '[data-tour="comercio"]',
    popover: {
      title: "Comercio",
      description: "Acá vendés en el mostrador, cargás stock de productos, revisás tus ventas y controlás la caja.",
    },
  },
  {
    element: '[data-tour="cuenta"]',
    popover: {
      title: "Cuenta",
      description: "Configurá los datos de tu clínica, horarios, servicios y mascotas que atendés.",
    },
  },
]

/**
 * Tour interactivo del panel admin. Corre una sola vez por tenant (flag en
 * localStorage). Se puede volver a ver en cualquier momento desde el botón
 * "Ayuda" del panel, que agrega `?tour=1` a la URL.
 */
export function DashboardTour({ slug }: { slug: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const forzado = searchParams.get("tour") === "1"

  useEffect(() => {
    const key = `vetpanel-tour-${slug}`
    if (typeof window === "undefined") return
    if (!forzado && localStorage.getItem(key) === "done") return

    // Esperar a que el DOM del dashboard esté montado.
    const timer = setTimeout(() => {
      const d = driver({
        showProgress: true,
        nextBtnText: "Siguiente",
        prevBtnText: "Atrás",
        doneBtnText: "Listo",
        steps: PASOS,
        onDestroyed: () => {
          localStorage.setItem(key, "done")
          if (forzado) router.replace(`/${slug}/admin/Dashboard`)
        },
      })
      d.drive()
    }, 600)

    return () => clearTimeout(timer)
  }, [slug, forzado, router])

  return null
}
