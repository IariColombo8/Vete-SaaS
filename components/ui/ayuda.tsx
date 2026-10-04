"use client"

import { CircleHelp } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TEXTOS_AYUDA, type TemaAyuda } from "@/lib/ayuda/textos"
import { cn } from "@/lib/utils"

interface Props {
  tema: TemaAyuda
  className?: string
}

/**
 * Cartelito de ayuda: un "?" chico al lado de un label o un título que, al
 * tocarlo, explica el término en una o dos oraciones.
 *
 * Es un Popover y no un Tooltip a propósito: el Tooltip de Radix no abre con
 * el dedo, y el mostrador se usa mucho desde tablet o celular.
 */
export function Ayuda({ tema, className }: Props) {
  const { titulo, texto } = TEXTOS_AYUDA[tema]

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Ayuda: ${titulo}`}
          // Suele ir dentro de un <label> que envuelve al control: sin esto el
          // click llega al label y activa el switch o el input de al lado.
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-full align-middle",
            "text-muted-foreground/70 transition-colors hover:bg-accent hover:text-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "data-[state=open]:bg-accent data-[state=open]:text-primary",
            className,
          )}
        >
          <CircleHelp className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        collisionPadding={16}
        className="w-64 space-y-1 p-3 text-left"
      >
        <p className="text-sm font-semibold leading-tight">{titulo}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{texto}</p>
      </PopoverContent>
    </Popover>
  )
}
