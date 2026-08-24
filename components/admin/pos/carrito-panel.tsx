"use client"

import { Loader2, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ClienteSelector } from "./cliente-selector"
import {
  descripcionLinea, subtotalLinea, totalesCarrito,
  type Descuento, type LineaCarrito,
} from "@/lib/ventas/carrito"
import { formatCantidad, formatCurrency } from "@/lib/format"
import { MEDIOS_PAGO, type Cliente, type MedioPago } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  carrito: LineaCarrito[]
  cliente: Cliente | null
  medioPago: MedioPago
  descuento: Descuento
  cobrando: boolean
  onCliente: (c: Cliente | null) => void
  onMedioPago: (m: MedioPago) => void
  onDescuento: (d: Descuento) => void
  onCantidad: (productoId: string, cantidad: number) => void
  onQuitar: (productoId: string) => void
  onVaciar: () => void
  onCobrar: () => void
}

/** Panel derecho del mostrador: qué se lleva, a quién y cómo paga. */
export function CarritoPanel({
  tenantId,
  carrito,
  cliente,
  medioPago,
  descuento,
  cobrando,
  onCliente,
  onMedioPago,
  onDescuento,
  onCantidad,
  onQuitar,
  onVaciar,
  onCobrar,
}: Props) {
  const totales = totalesCarrito(carrito, descuento)
  const vacio = carrito.length === 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShoppingCart className="h-4 w-4" />
          Carrito
          {!vacio && (
            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs text-white">
              {totales.items}
            </span>
          )}
        </h2>
        {!vacio && (
          <Button variant="ghost" size="sm" onClick={onVaciar} className="text-muted-foreground">
            Vaciar
          </Button>
        )}
      </div>

      <Separator />

      {/* Las líneas son lo único que scrollea: el total y el botón de cobrar
          tienen que quedar siempre a la vista. */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {vacio ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <ShoppingCart className="h-8 w-8 opacity-30" />
            El carrito está vacío
          </div>
        ) : (
          <ul className="space-y-1">
            {carrito.map((linea) => (
              <LineaItem
                key={linea.producto.id}
                linea={linea}
                onCantidad={(c) => onCantidad(linea.producto.id, c)}
                onQuitar={() => onQuitar(linea.producto.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <Separator />

      <div className="space-y-3 p-4">
        <ClienteSelector tenantId={tenantId} seleccionado={cliente} onCambiar={onCliente} />

        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Medio de pago</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {MEDIOS_PAGO.map(({ id, label }) => (
              <Button
                key={id}
                type="button"
                variant={medioPago === id ? "default" : "outline"}
                size="sm"
                onClick={() => onMedioPago(id)}
                className={medioPago === id ? "bg-emerald-600 hover:bg-emerald-700" : ""}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="descuento" className="mb-1.5 block text-xs text-muted-foreground">
            Descuento
          </Label>
          <div className="flex gap-1.5">
            <Input
              id="descuento"
              type="number"
              min={0}
              max={descuento.tipo === "porcentaje" ? 100 : undefined}
              step={descuento.tipo === "porcentaje" ? 5 : 100}
              value={descuento.valor || ""}
              placeholder="0"
              onChange={(e) =>
                onDescuento({ ...descuento, valor: Number(e.target.value) || 0 })
              }
            />
            {/* Toggle $ / %: el mismo campo cambia de significado, así que el
                tipo tiene que estar pegado al número y no en otro lado. */}
            <div className="flex shrink-0 overflow-hidden rounded-md border">
              {(["monto", "porcentaje"] as const).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => onDescuento({ ...descuento, tipo })}
                  aria-pressed={descuento.tipo === tipo}
                  aria-label={tipo === "monto" ? "Descuento en pesos" : "Descuento en porcentaje"}
                  className={`w-9 text-sm font-medium transition-colors ${
                    descuento.tipo === tipo
                      ? "bg-emerald-600 text-white"
                      : "bg-transparent text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {tipo === "monto" ? "$" : "%"}
                </button>
              ))}
            </div>
          </div>
          {descuento.tipo === "porcentaje" && totales.descuento > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {descuento.valor}% = {formatCurrency(totales.descuento)}
            </p>
          )}
        </div>

        <div className="space-y-1 text-sm">
          {totales.ahorro > 0 && (
            <div className="flex justify-between text-amber-600 dark:text-amber-500">
              <span>Ahorro por ofertas</span>
              <span className="tabular-nums">{formatCurrency(totales.ahorro)}</span>
            </div>
          )}
          {totales.descuento > 0 && (
            <>
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCurrency(totales.subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Descuento</span>
                <span className="tabular-nums">- {formatCurrency(totales.descuento)}</span>
              </div>
            </>
          )}
          <div className="flex items-baseline justify-between pt-1">
            <span className="font-semibold">Total</span>
            <span className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatCurrency(totales.total)}
            </span>
          </div>
        </div>

        <Button
          onClick={onCobrar}
          disabled={vacio || cobrando}
          className="h-12 w-full bg-emerald-600 text-base hover:bg-emerald-700"
        >
          {cobrando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {cobrando ? "Cobrando…" : "Cobrar"}
        </Button>
      </div>
    </div>
  )
}

/**
 * Una línea del carrito. Los +/- suman de a una unidad, o de a medio kilo
 * cuando el producto se vende suelto — sumar de a 1 kg es demasiado grueso para
 * corregir un despacho.
 */
function LineaItem({
  linea,
  onCantidad,
  onQuitar,
}: {
  linea: LineaCarrito
  onCantidad: (cantidad: number) => void
  onQuitar: () => void
}) {
  const porKg = linea.producto.unidad === "kg"
  const paso = porKg ? 0.5 : 1

  return (
    <li className="rounded-lg border bg-card p-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium leading-snug">
          {descripcionLinea(linea.producto)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-red-600"
          onClick={onQuitar}
          aria-label="Quitar del carrito"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => onCantidad(Math.max(0, linea.cantidad - paso))}
            aria-label="Restar"
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="min-w-[3.5rem] text-center text-sm tabular-nums">
            {formatCantidad(linea.cantidad)}
            {porKg ? " kg" : ""}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => onCantidad(linea.cantidad + paso)}
            aria-label="Sumar"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <span className="font-semibold tabular-nums">
          {formatCurrency(subtotalLinea(linea))}
        </span>
      </div>
    </li>
  )
}
