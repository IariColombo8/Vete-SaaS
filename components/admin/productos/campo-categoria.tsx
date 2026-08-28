"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { CATEGORIAS_FIJAS, ordenarCategorias } from "@/lib/productos/categorias"
import { cn } from "@/lib/utils"

interface Props {
  value: string
  categoriasExistentes: string[]
  onChange: (value: string) => void
  className?: string
}

const NUEVA = "__nueva__"

/**
 * Rubro como dropdown: Medicamentos/Accesorios/Alimentos siempre disponibles
 * (aunque el tenant todavía no tenga productos ahí) más lo que ya haya
 * cargado, con "+ Agregar categoría" para el día que haga falta una nueva.
 * Sigue siendo texto libre por debajo — no hay tabla de categorías.
 */
export function CampoCategoria({ value, categoriasExistentes, onChange, className }: Props) {
  const opciones = ordenarCategorias(
    Array.from(new Set([...CATEGORIAS_FIJAS, ...categoriasExistentes])),
  )
  const [creandoNueva, setCreandoNueva] = useState(false)

  // "accesorios" cargado a mano tiene que verse seleccionado como
  // "Accesorios" en vez de caer al modo de texto libre.
  const opcionCoincidente = opciones.find((o) => o.toLowerCase() === value.trim().toLowerCase())
  const escribiendoValorLibre = creandoNueva || (value.trim() !== "" && !opcionCoincidente)

  if (escribiendoValorLibre) {
    return (
      <div className={className}>
        <Input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nombre de la categoría"
        />
        <button
          type="button"
          className="mt-1 text-xs text-muted-foreground underline underline-offset-2"
          onClick={() => { setCreandoNueva(false); onChange("") }}
        >
          Elegir de la lista
        </button>
      </div>
    )
  }

  return (
    <select
      value={opcionCoincidente ?? value}
      onChange={(e) => {
        if (e.target.value === NUEVA) { setCreandoNueva(true); onChange(""); return }
        onChange(e.target.value)
      }}
      className={cn(
        "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30",
        className,
      )}
    >
      <option value="">Sin rubro</option>
      {opciones.map((c) => <option key={c} value={c}>{c}</option>)}
      <option value={NUEVA}>+ Agregar categoría</option>
    </select>
  )
}
