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
import {
  buscarConsumidorFinal, conConsumidorFinalPrimero, esConsumidorFinal, normalizarTexto,
} from "@/lib/clientes/consumidor-final"
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
  const [dniNuevo, setDniNuevo] = useState("")
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

  const consumidorFinal = useMemo(() => buscarConsumidorFinal(clientes), [clientes])

  // Sin nadie elegido se vende al público, así que en cuanto se conoce la fila
  // "Consumidor final" queda puesta sola. En cuenta corriente no: ahí hace
  // falta una persona de verdad y la fila al público no cuenta como elegir.
  useEffect(() => {
    if (!obligatorio && !seleccionado && consumidorFinal) onCambiar(consumidorFinal)
  }, [obligatorio, seleccionado, consumidorFinal, onCambiar])

  // El teléfono entra en la búsqueda: muchas veces es lo único que se sabe.
  // El id va al final del `value` porque cmdk lo usa como identidad del item:
  // dos clientes homónimos sin teléfono ni DNI colapsaban en uno solo y elegir
  // al segundo seleccionaba al primero.
  // Con `obligatorio` la fila al público no se lista: ofrecerla y después
  // rechazarla al cobrar es un ítem que no hace nada. Acá hace falta una
  // persona real (cuenta corriente), así que directamente no es una opción.
  const opciones = useMemo(
    () =>
      (obligatorio
        ? clientes.filter((c) => !esConsumidorFinal(c))
        : conConsumidorFinalPrimero(clientes)
      ).map((c) => ({
        cliente: c,
        buscable: `${normalizarTexto(`${c.nombre} ${c.telefono ?? ""} ${c.dni ?? ""}`)} ${c.id}`,
      })),
    [clientes, obligatorio],
  )

  const crearCliente = async () => {
    if (!nombreNuevo.trim()) return
    setGuardando(true)
    try {
      const creado = await createCliente(tenantId, {
        nombre: nombreNuevo.trim(),
        dni: dniNuevo.trim(),
        telefono: telefonoNuevo.trim(),
        email: "",
      })
      setClientes((actual) => [...actual, creado])
      onCambiar(creado)
      setCreando(false)
      setAbierto(false)
      setNombreNuevo("")
      setDniNuevo("")
      setTelefonoNuevo("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el cliente")
    } finally {
      setGuardando(false)
    }
  }

  // Un solo popover para elegir y para cambiar: con un cliente ya elegido el
  // trigger muestra sus datos y vuelve a abrir la misma lista. Antes la ficha
  // del cliente era un callejón sin salida — sólo se podía quitar, y con
  // `obligatorio` ni eso, así que corregir una equivocación era imposible.
  return (
    <div className="flex items-center gap-2">
      <Popover
        open={abierto}
        onOpenChange={(v) => {
          setAbierto(v)
          if (!v) setCreando(false)
        }}
      >
        <PopoverTrigger asChild>
          {seleccionado ? (
            <Button
              variant="outline"
              className="h-auto min-w-0 flex-1 justify-between gap-2 py-2 font-normal"
            >
              <span className="flex min-w-0 items-center gap-2">
                <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 text-left">
                  <span className="block truncate text-sm font-medium">{seleccionado.nombre}</span>
                  {seleccionado.telefono && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {seleccionado.telefono}
                    </span>
                  )}
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">Cambiar</span>
            </Button>
          ) : (
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
          )}
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
                <Label htmlFor="nuevo-cliente-dni" className="text-xs">DNI (opcional)</Label>
                <Input
                  id="nuevo-cliente-dni"
                  value={dniNuevo}
                  onChange={(e) => setDniNuevo(e.target.value)}
                  placeholder="30123456"
                />
              </div>
              <div>
                <Label htmlFor="nuevo-cliente-telefono" className="text-xs">Celular (opcional)</Label>
                <Input
                  id="nuevo-cliente-telefono"
                  value={telefonoNuevo}
                  onChange={(e) => setTelefonoNuevo(e.target.value)}
                  placeholder="11 1234-5678"
                />
              </div>
              <div className="flex justify-end gap-1.5 pt-1">
                <Button variant="ghost" size="sm" disabled={guardando} onClick={() => setCreando(false)}>
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
              filter={(value, search) => (value.includes(normalizarTexto(search)) ? 1 : 0)}
            >
              <CommandInput placeholder="Buscar por nombre, teléfono o DNI" />
              <CommandList>
                <CommandEmpty>No se encontró ningún cliente</CommandEmpty>
                <CommandGroup>
                  {/* Sin la fila "Consumidor final" creada, volver a nadie
                      sigue siendo `null`; con ella, el ítem fijo de arriba ya
                      es esa opción y no hace falta duplicarla. */}
                  {seleccionado && !obligatorio && !consumidorFinal && (
                    <CommandItem
                      value="consumidor final sin-cliente"
                      onSelect={() => {
                        onCambiar(null)
                        setAbierto(false)
                      }}
                    >
                      <X className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Consumidor final (sin cliente)</span>
                    </CommandItem>
                  )}
                  {opciones.map(({ cliente, buscable }) => (
                    <CommandItem
                      key={cliente.id}
                      value={buscable}
                      onSelect={() => {
                        onCambiar(cliente)
                        setAbierto(false)
                      }}
                    >
                      <Check
                        className={`mr-2 h-4 w-4 ${seleccionado?.id === cliente.id ? "" : "opacity-0"}`}
                      />
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

      {/* Quitar el cliente es volver a la venta al público: a la fila
          "Consumidor final" si existe, o a `null` si el tenant no la creó. */}
      {seleccionado && !obligatorio && !esConsumidorFinal(seleccionado) && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => onCambiar(consumidorFinal)}
          aria-label="Quitar cliente"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
