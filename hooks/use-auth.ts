"use client"

import { useState, useEffect } from "react"
import type { User } from "@/lib/supabase/auth"

interface OpcionesAuth {
  /**
   * Esperar a que el navegador esté ocioso antes de cargar Supabase. Para las
   * superficies públicas (landing, blog, precios): ahí la sesión solo sirve
   * para mostrar "Mi panel", y si el chunk de Supabase (~70 KB) se descarga
   * antes del primer pintado, Lighthouse lo suma al LCP. En el panel se deja
   * en false: la pantalla depende de la sesión para mostrarse.
   */
  diferido?: boolean
}

function cuandoOcioso(fn: () => void): () => void {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(fn, { timeout: 2000 })
    return () => window.cancelIdleCallback(id)
  }
  const id = setTimeout(fn, 300)
  return () => clearTimeout(id)
}

export function useAuth({ diferido = false }: OpcionesAuth = {}) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let cancelado = false

    // El cliente de Supabase se importa en diferido: así no entra en el JS
    // inicial de las páginas públicas. En el panel el chunk ya está cargado
    // por las queries, así que no cambia nada.
    const cargar = () => {
      import("@/lib/supabase/auth").then(({ onAuthStateChanged }) => {
        if (cancelado) return
        // Supabase devuelve el unsubscribe directamente (no recibe `auth` como Firebase).
        unsubscribe = onAuthStateChanged((usuario) => {
          setUser(usuario)
          setLoading(false)
        })
      })
    }
    const cancelarEspera = diferido ? cuandoOcioso(cargar) : (cargar(), undefined)

    return () => {
      cancelado = true
      cancelarEspera?.()
      unsubscribe?.()
    }
  }, [diferido])

  return { user, loading }
}
