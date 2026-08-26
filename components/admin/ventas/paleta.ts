import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import type { MedioPago } from "@/lib/supabase/types"

/**
 * Colores de los gráficos de ventas.
 *
 * Dos juegos de pasos, uno por modo. El modo oscuro no es el claro "aclarado":
 * los mismos hex sobre fondo oscuro se caen de la banda de luminosidad y pierden
 * contraste, así que cada modo tiene su propio paso del mismo tono.
 *
 * Ambos juegos están validados: banda de luminosidad, piso de croma, separación
 * para daltonismo (deutan/protan/tritan) y contraste contra la superficie. El
 * orden es fijo y va por entidad, nunca por ranking — si un filtro deja fuera al
 * débito, la transferencia no cambia de color.
 */

const CLARO = {
  efectivo: "#10b981",
  debito: "#6366f1",
  credito: "#f59e0b",
  transferencia: "#ec4899",
  mixto: "#0d9488",
  cuenta_corriente: "#7c3aed",
} as const

const OSCURO = {
  efectivo: "#059669",
  debito: "#6366f1",
  credito: "#d97706",
  transferencia: "#db2777",
  mixto: "#14b8a6",
  cuenta_corriente: "#8b5cf6",
} as const

export type PaletaMedios = Record<MedioPago, string>

export interface PaletaGraficos {
  medios: PaletaMedios
  /** Serie única de facturación diaria. */
  serie: string
  grilla: string
  eje: string
}

/**
 * Resuelve la paleta según el tema activo.
 *
 * El estado de montado evita el parpadeo de hidratación: en el servidor no se
 * sabe qué tema tiene el usuario, así que hasta que monta se usa el claro.
 */
export function usePaletaGraficos(): PaletaGraficos {
  const { resolvedTheme } = useTheme()
  const [montado, setMontado] = useState(false)

  useEffect(() => setMontado(true), [])

  const oscuro = montado && resolvedTheme === "dark"

  return {
    medios: oscuro ? { ...OSCURO } : { ...CLARO },
    serie: oscuro ? OSCURO.efectivo : CLARO.efectivo,
    grilla: oscuro ? "#334155" : "#e2e8f0",
    eje: oscuro ? "#94a3b8" : "#64748b",
  }
}
