"use client"

import { useEffect, useState } from "react"
import type { Pedido } from "@/lib/pedidos/tipos"

/**
 * ¿Quedó guardada una sesión de Supabase en este navegador? La cookie la
 * escribe `createBrowserClient` (`sb-<proyecto>-auth-token`, a veces partida
 * en `.0`, `.1`). Mirarla no cuesta nada; cargar Supabase para preguntar, sí.
 */
export function haySesionGuardada(): boolean {
  return typeof document !== "undefined" && /sb-[\w-]+-auth-token/.test(document.cookie)
}

/**
 * Los pedidos de la tienda web del comprador logueado en esta veterinaria.
 *
 * Sin sesión guardada no se carga nada (el visitante común no baja el chunk
 * de Supabase). Con sesión, se buscan con el navegador ocioso: nunca compiten
 * con el primer pintado.
 */
export function useMisPedidos(slug: string) {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!haySesionGuardada()) {
      setCargando(false)
      return
    }
    let cancelado = false
    const cargar = () => {
      import("@/lib/supabase/pedidos")
        .then(({ getMisPedidos }) => getMisPedidos(slug))
        .then((p) => { if (!cancelado) setPedidos(p) })
        .catch(() => {})
        .finally(() => { if (!cancelado) setCargando(false) })
    }
    // Safari no tiene requestIdleCallback.
    const ocioso = typeof window.requestIdleCallback === "function"
    const id = ocioso ? window.requestIdleCallback(cargar, { timeout: 2500 }) : setTimeout(cargar, 500)
    return () => {
      cancelado = true
      if (ocioso) window.cancelIdleCallback(id as number)
      else clearTimeout(id)
    }
  }, [slug])

  return { pedidos, cargando }
}
