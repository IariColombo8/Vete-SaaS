import type { AjusteStockTipo, MovimientoStock } from "@/lib/supabase/types"

/**
 * Compartido entre el bloque de movimientos del producto individual y el
 * diálogo de mover stock masivo: mismos tipos, mismas ayudas.
 */
export const TIPOS_AJUSTE: { value: AjusteStockTipo; label: string; ayuda: string }[] = [
  { value: "entrada", label: "Entrada", ayuda: "Llegó mercadería del proveedor" },
  { value: "uso", label: "Uso", ayuda: "Se consumió en una consulta" },
  { value: "rotura", label: "Rotura", ayuda: "Se rompió, venció o se perdió" },
  { value: "ajuste", label: "Ajuste", ayuda: "Corregir el stock al valor real contado" },
]

export const ETIQUETA_MOVIMIENTO: Record<MovimientoStock["tipo"], string> = {
  entrada: "Entrada",
  uso: "Uso",
  rotura: "Rotura",
  ajuste: "Ajuste",
  venta: "Venta",
}
