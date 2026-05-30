"use client"

import { useEffect } from "react"
import { driver } from "driver.js"
import "driver.js/dist/driver.css"

/**
 * Tour interactivo del panel admin. Corre una sola vez por tenant (flag en
 * localStorage). Resaltable manualmente pasando `force`. Anclado a elementos
 * con atributos `data-tour="..."` en el dashboard.
 */
export function DashboardTour({ slug }: { slug: string }) {
  useEffect(() => {
    const key = `vetpanel-tour-${slug}`
    if (typeof window === "undefined") return
    if (localStorage.getItem(key) === "done") return

    // Esperar a que el DOM del dashboard esté montado.
    const timer = setTimeout(() => {
      const d = driver({
        showProgress: true,
        nextBtnText: "Siguiente",
        prevBtnText: "Atrás",
        doneBtnText: "Listo",
        steps: [
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
        ],
        onDestroyed: () => localStorage.setItem(key, "done"),
      })
      d.drive()
    }, 600)

    return () => clearTimeout(timer)
  }, [slug])

  return null
}
