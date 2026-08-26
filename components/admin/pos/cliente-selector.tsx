"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, ChevronsUpDown, Loader2, UserPlus, UserRound, X } from "lucide-react"
import { toast } from "sonner"
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getClientesBasic, createCliente } from "@/lib/supabase/clientes"
import type { Cliente } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  seleccionado: Cliente | null
  onCambiar: (cliente: Cliente | null) => void
  /**
   * Cuando es `true` no se puede dejar en "Consumidor final": la cuenta
   * corriente necesita saber a quién se le vendió.
   */
  obligatorio?: boolean
}

/**
 * Elige a quién se le vende. Por defecto es opcional (consumidor final); con
 * `obligatorio` (cuenta corriente) hay que elegir o crear un cliente.
 *
 * Se carga la lista entera una vez y se filtra en memoria. Una veterinaria
 * tiene cientos de clientes, no cientos de miles, y así el filtrado responde
 * mientras se tipea sin ir a la base en cada tecla.
 */
export function ClienteSelector({ tenantId, seleccionado, onCambiar, obligatorio = false }: Props) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [abierto, setAbierto] = useState(false)
  const [creando, setCreando] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState("")
  const [telefonoNuevo, setTelefonoNuevo] = useState("")
  const [guardando, setGuardando] = useState(false)

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

  const crearCliente = async () => {
    if (!nombreNuevo.trim()) return
    setGuardando(true)
    try {
      const creado = await createCliente(tenantId, {
        nombre: nombreNuevo.trim(),
        telefono: telefonoNuevo.trim(),
        email: "",
      })
      setClientes((actual) => [...actual, creado])
      onCambiar(creado)
      setCreando(false)
      setAbierto(false)
      setNombreNuevo("")
      setTelefonoNuevo("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el cliente")
    } finally {
      setGuardando(false)
    }
  }

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
        {!obligatorio && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => onCambiar(null)}
            aria-label="Quitar cliente"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    )
  }

  return (
    <Popover
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v)
        if (!v) setCreando(false)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`w-full justify-between font-normal ${obligatorio ? "border-rose-400 text-rose-600 dark:border-rose-600 dark:text-rose-400" : ""}`}
        >
          <span className="flex items-center gap-2">
            <UserRound className="h-4 w-4" />
            {obligatorio ? "Elegí un cliente (obligatorio)" : "Consumidor final"}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        {creando ? (
          <div className="space-y-2 p-3">
            <div>
              <Label htmlFor="nuevo-cliente-nombre" className="text-xs">Nombre</Label>
              <Input
                id="nuevo-cliente-nombre"
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                placeholder="Nombre y apellido"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="nuevo-cliente-telefono" className="text-xs">Teléfono (opcional)</Label>
              <Input
                id="nuevo-cliente-telefono"
                value={telefonoNuevo}
                onChange={(e) => setTelefonoNuevo(e.target.value)}
                placeholder="11 1234-5678"
              />
            </div>
            <div className="flex justify-end gap-1.5 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setCreando(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={!nombreNuevo.trim() || guardando}
                onClick={() => void crearCliente()}
              >
                {guardando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Crear y elegir
              </Button>
            </div>
          </div>
        ) : (
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
            <div className="border-t p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-muted-foreground"
                onClick={() => setCreando(true)}
              >
                <UserPlus className="h-4 w-4" />
                Nuevo cliente
              </Button>
            </div>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  )
}
