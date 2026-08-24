"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { precioLinea } from "@/lib/productos/precios"
import { descripcionLinea } from "@/lib/ventas/carrito"
import { formatCantidad, formatCurrency } from "@/lib/format"
import type { Producto } from "@/lib/supabase/types"

interface Props {
  producto: Producto | null
  onCerrar: () => void
  onConfirmar: (cantidad: number) => void
}

/** Atajos de kilos: los pedidos típicos del mostrador. */
const KILOS_RAPIDOS = [0.5, 1, 2, 3, 5, 10]

/** Atajos de gramos: para pedidos chicos, donde "0,2" es menos natural que "200". */
const GRAMOS_RAPIDOS = [100, 200, 250, 500, 750]

type UnidadIngreso = "kg" | "g"

/**
 * Pide cuánto se lleva el cliente y muestra el importe en vivo.
 *
 * Es el paso clave de la venta por peso: el vendedor escribe los kilos que marcó
 * la balanza y ve el total antes de agregarlo al carrito, sin tener que hacer la
 * cuenta de cabeza.
 */
export function CantidadDialog({ producto, onCerrar, onConfirmar }: Props) {
  const [valor, setValor] = useState("1")
  const [unidadIngreso, setUnidadIngreso] = useState<UnidadIngreso>("kg")

  const porKg = producto?.unidad === "kg"

  // Cada vez que se abre con otro producto se reinicia: arrastrar "2,5" de la
  // venta anterior es una forma muy fácil de despachar de más.
  useEffect(() => {
    if (producto) {
      setValor(porKg ? "" : "1")
      setUnidadIngreso("kg")
    }
  }, [producto, porKg])

  // La cantidad real siempre queda en kilos —es lo que espera el carrito—,
  // aunque el vendedor haya tipeado en gramos.
  const cantidad = useMemo(() => {
    const n = Number(valor.replace(",", "."))
    if (!Number.isFinite(n) || n <= 0) return 0
    return unidadIngreso === "g" ? n / 1000 : n
  }, [valor, unidadIngreso])

  const importe = producto && cantidad > 0 ? precioLinea(producto, cantidad) : 0
  const excedeStock =
    producto?.controlaStock === true && cantidad > producto.stock

  const confirmar = () => {
    if (cantidad <= 0 || excedeStock) return
    onConfirmar(cantidad)
  }

  return (
    <Dialog open={producto !== null} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{porKg ? "¿Cuántos kilos?" : "¿Cuántas unidades?"}</DialogTitle>
          <DialogDescription>
            {producto ? descripcionLinea(producto) : ""}
          </DialogDescription>
        </DialogHeader>

        {producto && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="cantidad">
                  {porKg ? (unidadIngreso === "g" ? "Peso" : "Kilos") : "Unidades"}
                </Label>
                {porKg && (
                  <div className="flex gap-0.5 rounded-md border bg-background p-0.5">
                    {(["kg", "g"] as const).map((u) => (
                      <Button
                        key={u}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={`h-6 px-2 text-xs ${
                          unidadIngreso === u ? "bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white" : ""
                        }`}
                        onClick={() => {
                          setUnidadIngreso(u)
                          setValor("")
                        }}
                      >
                        {u === "kg" ? "Kilos" : "Elegir peso (g)"}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <Input
                id="cantidad"
                type="number"
                inputMode="decimal"
                min={porKg ? (unidadIngreso === "g" ? 1 : 0.001) : 1}
                step={porKg ? (unidadIngreso === "g" ? 10 : 0.1) : 1}
                value={valor}
                autoFocus
                placeholder={porKg ? (unidadIngreso === "g" ? "Ej: 200" : "Ej: 2,5") : "1"}
                onChange={(e) => setValor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmar()
                }}
                className="h-12 text-lg"
              />
            </div>

            {porKg && (
              <div className="flex flex-wrap gap-1.5">
                {(unidadIngreso === "g" ? GRAMOS_RAPIDOS : KILOS_RAPIDOS).map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setValor(String(n))}
                  >
                    {unidadIngreso === "g" ? `${n} g` : `${formatCantidad(n)} kg`}
                  </Button>
                ))}
              </div>
            )}

            <div className="rounded-lg bg-muted/60 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Importe</span>
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(importe)}
                </span>
              </div>
              {producto.controlaStock && (
                <p
                  className={`mt-1 text-xs ${excedeStock ? "font-medium text-red-600" : "text-muted-foreground"}`}
                >
                  {excedeStock
                    ? `Solo quedan ${formatCantidad(producto.stock)} ${porKg ? "kg" : "u."}`
                    : `Stock: ${formatCantidad(producto.stock)} ${porKg ? "kg" : "u."}`}
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={cantidad <= 0 || excedeStock}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
