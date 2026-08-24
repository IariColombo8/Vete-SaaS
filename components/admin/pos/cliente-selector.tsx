"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, ChevronsUpDown, UserRound, X } from "lucide-react"
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { getClientesBasic } from "@/lib/supabase/clientes"
import type { Cliente } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  seleccionado: Cliente | null
  onCambiar: (cliente: Cliente | null) => void
}

/**
 * Elige a quién se le vende. Es opcional: sin cliente la venta queda como
 * consumidor final, que es lo normal en el mostrador.
 *
 * Se carga la lista entera una vez y se filtra en memoria. Una veterinaria
 * tiene cientos de clientes, no cientos de miles, y así el filtrado responde
 * mientras se tipea sin ir a la base en cada tecla.
 */
export function ClienteSelector({ tenantId, seleccionado, onCambiar }: Props) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    let vigente = true
    getClientesBasic(tenantId).then((c) => {
      if (vigente) setClientes(c)
    })
    return () => {
      vigente = false
    }
  }, [tenantId])

  // El teléfono entra en la búsqueda: muchas veces es lo único que se sabe.
  const opciones = useMemo(
    () =>
      clientes.map((c) => ({
        cliente: c,
        buscable: `${c.nombre} ${c.telefono ?? ""} ${c.dni ?? ""}`.toLowerCase(),
      })),
    [clientes],
  )

  if (seleccionado) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
        <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{seleccionado.nombre}</p>
          {seleccionado.telefono && (
            <p className="truncate text-xs text-muted-foreground">{seleccionado.telefono}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => onCambiar(null)}
          aria-label="Quitar cliente"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between font-normal">
          <span className="flex items-center gap-2 text-muted-foreground">
            <UserRound className="h-4 w-4" /> Consumidor final
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(value, search) =>
            value.includes(search.toLowerCase().trim()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Buscar por nombre, teléfono o DNI" />
          <CommandList>
            <CommandEmpty>No se encontró ningún cliente</CommandEmpty>
            <CommandGroup>
              {opciones.map(({ cliente, buscable }) => (
                <CommandItem
                  key={cliente.id}
                  value={buscable}
                  onSelect={() => {
                    onCambiar(cliente)
                    setAbierto(false)
                  }}
                >
                  <Check className="mr-2 h-4 w-4 opacity-0" />
                  <div className="min-w-0">
                    <p className="truncate">{cliente.nombre}</p>
                    {cliente.telefono && (
                      <p className="truncate text-xs text-muted-foreground">
                        {cliente.telefono}
                      </p>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
