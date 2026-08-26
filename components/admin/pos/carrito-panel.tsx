"use client"

import { useEffect, useState } from "react"
import { Loader2, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ClienteSelector } from "./cliente-selector"
import { MixtoPagos, type LineaPagoMixto } from "./mixto-pagos"
import {
  descripcionLinea, subtotalLinea, totalesCarrito,
  type Descuento, type LineaCarrito,
} from "@/lib/ventas/carrito"
import { formatCantidad, formatCurrency } from "@/lib/format"
import { MEDIOS_PAGO, type Cliente, type MedioPago } from "@/lib/supabase/types"
import { useReadOnly } from "@/lib/auth/read-only-context"

export const CUOTAS_DEFAULT: Record<number, number> = { 1: 0, 3: 10, 6: 20, 12: 35 }

interface Props {
  tenantId: string
  carrito: LineaCarrito[]
  cliente: Cliente | null
  medioPago: MedioPago
  descuento: Descuento
  recargoPct: number
  cuotas: number
  recargoPorCuotas: Record<number, number>
  pagosMixto: LineaPagoMixto[]
  cobrando: boolean
  onCliente: (c: Cliente | null) => void
  onMedioPago: (m: MedioPago) => void
  onDescuento: (d: Descuento) => void
  onRecargoPct: (pct: number) => void
  onCuotas: (cuotas: number) => void
  onRecargoPorCuotas: (recargos: Record<number, number>) => void
  onPagosMixto: (pagos: LineaPagoMixto[]) => void
  onCantidad: (lineaId: string, cantidad: number) => void
  onQuitar: (lineaId: string) => void
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
  recargoPct,
  cuotas,
  recargoPorCuotas,
  pagosMixto,
  cobrando,
  onCliente,
  onMedioPago,
  onDescuento,
  onRecargoPct,
  onCuotas,
  onRecargoPorCuotas,
  onPagosMixto,
  onCantidad,
  onQuitar,
  onVaciar,
  onCobrar,
}: Props) {
  const esDebito = medioPago === "debito"
  const esCredito = medioPago === "credito"
  const esMixto = medioPago === "mixto"
  const esCtaCte = medioPago === "cuenta_corriente"
  const pctAplicado = esDebito ? recargoPct : esCredito ? (recargoPorCuotas[cuotas] ?? 0) : 0

  const totales = totalesCarrito(carrito, descuento, pctAplicado)
  const vacio = carrito.length === 0
  const esEfectivo = medioPago === "efectivo"

  const sumaMixto = pagosMixto.reduce((acc, p) => acc + (Number(p.monto) || 0), 0)
  const mixtoValido = !esMixto || Math.abs(sumaMixto - totales.total) < 0.01
  const ctaCteValida = !esCtaCte || cliente !== null

  // "Paga con" solo tiene sentido en efectivo, y solo mientras dure el
  // total que motivó ese monto: si cambia el carrito o el medio de pago,
  // el número que quedó escrito deja de significar lo que el usuario tipeó.
  const [pagaCon, setPagaCon] = useState("")
  const readOnly = useReadOnly()
  useEffect(() => {
    setPagaCon("")
  }, [esEfectivo, totales.total])

  const montoRecibido = Number(pagaCon) || 0
  const vuelto = montoRecibido - totales.total

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
                key={linea.id}
                linea={linea}
                onCantidad={(c) => onCantidad(linea.id, c)}
                onQuitar={() => onQuitar(linea.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <Separator />

      <div className="space-y-3 p-4">
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Medio de pago</Label>
          <div className="grid grid-cols-3 gap-1.5">
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

        {esCtaCte && (
          <ClienteSelector tenantId={tenantId} seleccionado={cliente} onCambiar={onCliente} obligatorio />
        )}

        {esDebito && (
          <div>
            <Label htmlFor="recargo-debito" className="mb-1.5 block text-xs text-muted-foreground">
              Recargo %
            </Label>
            <Input
              id="recargo-debito"
              type="number"
              min={0}
              step={1}
              value={recargoPct || ""}
              placeholder="5"
              onChange={(e) => onRecargoPct(Number(e.target.value) || 0)}
            />
          </div>
        )}

        {esCredito && (
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Cuotas</Label>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(recargoPorCuotas).map(Number).sort((a, b) => a - b).map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant={cuotas === n ? "default" : "outline"}
                  size="sm"
                  onClick={() => onCuotas(n)}
                  className={cuotas === n ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                >
                  {n === 1 ? "1 pago" : `${n} cuotas`}
                </Button>
              ))}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Label htmlFor="recargo-cuotas" className="text-xs text-muted-foreground">
                Recargo de {cuotas === 1 ? "1 pago" : `${cuotas} cuotas`} %
              </Label>
              <Input
                id="recargo-cuotas"
                type="number"
                min={0}
                step={1}
                className="h-7 w-20"
                value={recargoPorCuotas[cuotas] ?? 0}
                onChange={(e) =>
                  onRecargoPorCuotas({ ...recargoPorCuotas, [cuotas]: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>
        )}

        {esMixto && (
          <MixtoPagos total={totales.total} pagos={pagosMixto} onCambiar={onPagosMixto} />
        )}

        {!esCtaCte && <ClienteSelector tenantId={tenantId} seleccionado={cliente} onCambiar={onCliente} />}

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
          {totales.recargo > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Recargo</span>
              <span className="tabular-nums">+ {formatCurrency(totales.recargo)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between pt-1">
            <span className="font-semibold">Total</span>
            <span className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatCurrency(totales.total)}
            </span>
          </div>
        </div>

        {esEfectivo && !vacio && (
          <div className="space-y-1.5 rounded-lg border bg-muted/40 p-2.5">
            <Label htmlFor="paga-con" className="block text-xs text-muted-foreground">
              ¿Con cuánto paga?
            </Label>
            <Input
              id="paga-con"
              type="number"
              min={0}
              step={50}
              value={pagaCon}
              placeholder={formatCurrency(totales.total)}
              onChange={(e) => setPagaCon(e.target.value)}
            />
            {pagaCon !== "" && (
              <div
                className={`flex items-baseline justify-between text-sm ${
                  vuelto < 0 ? "text-red-600 dark:text-red-500" : ""
                }`}
              >
                <span className="font-medium">{vuelto < 0 ? "Falta" : "Vuelto"}</span>
                <span className="text-lg font-bold tabular-nums">
                  {formatCurrency(Math.abs(vuelto))}
                </span>
              </div>
            )}
          </div>
        )}

        <Button
          onClick={onCobrar}
          disabled={vacio || cobrando || readOnly || !mixtoValido || !ctaCteValida}
          title={
            readOnly
              ? "Reactivá tu cuenta para editar"
              : !ctaCteValida
                ? "Elegí un cliente para vender a cuenta corriente"
                : !mixtoValido
                  ? "El desglose de pagos tiene que coincidir con el total"
                  : undefined
          }
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
  // Los servicios de precio libre (atención veterinaria) son de cantidad fija:
  // no tiene sentido "sumar" una segunda consulta sobre la misma línea.
  const esServicioManual = linea.precioManual != null

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

      {(linea.vinculo || linea.motivo) && (
        <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
          {linea.vinculo?.mascotaNombre}
          {linea.vinculo && linea.motivo ? " · " : ""}
          {linea.motivo}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between">
        {esServicioManual ? (
          <span className="text-xs text-muted-foreground">1 atención</span>
        ) : (
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
        )}
        <span className="font-semibold tabular-nums">
          {formatCurrency(subtotalLinea(linea))}
        </span>
      </div>
    </li>
  )
}
