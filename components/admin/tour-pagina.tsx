"use client"

import { useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { driver } from "driver.js"
import "driver.js/dist/driver.css"
import type { AdminSection } from "@/lib/auth/permissions"
import { TOURS, claveTourVisto } from "@/lib/ayuda/tours"

interface Props {
  slug: string
  seccion: AdminSection
  /**
   * Si arranca solo la primera vez que se entra a la pantalla. Solo el
   * Dashboard lo hace: en Vender o Caja un tour que aparece de golpe
   * interrumpiría a alguien que está atendiendo. Esos se piden con "Ayuda".
   */
  automatico?: boolean
}

function yaVisto(clave: string): boolean {
  try {
    return localStorage.getItem(clave) === "done"
  } catch {
    // Storage bloqueado (modo privado, permisos): mejor no repetir el tour solo.
    return true
  }
}

function marcarVisto(clave: string): void {
  try {
    localStorage.setItem(clave, "done")
  } catch {
    // Recordar que ya se vio es una comodidad; si no se puede, no pasa nada.
  }
}

/**
 * Tour guiado de una pantalla del panel. Lo arranca el botón "Ayuda" del
 * header, que agrega `?tour=1` a la URL de la página actual.
 */
export function TourPagina({ slug, seccion, automatico = false }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const forzado = searchParams.get("tour") === "1"

  useEffect(() => {
    const pasos = TOURS[seccion]
    if (!pasos) return
    const clave = claveTourVisto(slug, seccion)
    if (!forzado && (!automatico || yaVisto(clave))) return

    // Esperar a que el contenido de la pantalla esté montado.
    const timer = setTimeout(() => {
      const visibles = pasos.filter((p) => document.querySelector(p.element))
      if (visibles.length === 0) return

      const d = driver({
        showProgress: visibles.length > 1,
        progressText: "{{current}} de {{total}}",
        nextBtnText: "Siguiente",
        prevBtnText: "Atrás",
        doneBtnText: "Listo",
        steps: visibles,
        onDestroyed: () => {
          marcarVisto(clave)
          if (forzado) router.replace(pathname)
        },
      })
      d.drive()
    }, 600)

    return () => clearTimeout(timer)
  }, [slug, seccion, automatico, forzado, router, pathname])

  return null
}
