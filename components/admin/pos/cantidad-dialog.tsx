"use client"

import { useEffect, useState } from "react"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { precioFinal, precioLinea, tieneOferta } from "@/lib/productos/precios"
import { descripcionLinea } from "@/lib/ventas/carrito"
import { formatCantidad, formatCurrency } from "@/lib/format"
import type { Producto } from "@/lib/supabase/types"

interface Props {
  producto: Producto | null
  onCerrar: () => void
  onConfirmar: (cantidad: number) => void
}

/**
 * Atajos de kilos: cubren tanto pedidos chicos (0,1 kg = 100 g, sin tener que
 * cambiar de campo para pensar en gramos) como los pedidos grandes típicos.
 */
const KILOS_RAPIDOS = [0.1, 0.25, 0.5, 1, 2, 3, 5, 10]

/** Atajos de montos: los pedidos típicos cuando el cliente pide "$1000 de alimento". */
const MONTOS_RAPIDOS = [500, 1000, 1500, 2000, 3000, 5000]

/** Redondea a 3 decimales y saca ceros de más, para que el campo no muestre "1.500000000004". */
function numeroLimpio(n: number): string {
  const redondeado = Math.round(n * 1000) / 1000
  return redondeado > 0 ? String(redondeado) : ""
}

/**
 * Pide cuánto se lleva el cliente. Dos campos siempre visibles — Kilos y
 * Monto — que se recalculan entre sí en cualquier dirección: escribir en uno
 * completa el otro solo, sin tener que elegir un "modo" antes de tipear.
 *
 * Es el paso clave de la venta por peso: el vendedor escribe los kilos que
 * marcó la balanza (o el monto que pidió el cliente) y ve el total antes de
 * agregarlo al carrito, sin tener que hacer la cuenta de cabeza.
 */
export function CantidadDialog({ producto, onCerrar, onConfirmar }: Props) {
  const [valorKg, setValorKg] = useState("")
  const [valorMonto, setValorMonto] = useState("")
  const [valorUnidades, setValorUnidades] = useState("1")

  const porKg = producto?.unidad === "kg"
  // Una bolsa cerrada con peso detectado (import de alimentos) también se
  // puede vender fraccionada: alguien abre la bolsa de 6 kg y vende 1 kg
  // suelto. `pesoBolsa` es el peso de la bolsa completa; 0 si no aplica.
  const pesoBolsa = producto?.unidad === "un" ? (producto?.pesoKg ?? 0) : 0
  const fraccionable = porKg || pesoBolsa > 0
  // El monto en pesos asume precio unitario fijo: no tiene forma limpia de
  // invertirse cuando hay un combo (N unidades a precio fijo) de por medio.
  const esCombo = producto ? tieneOferta(producto) && producto.ofertaTipo === "combo" : false

  const precioPorKg = producto && pesoBolsa > 0 ? precioFinal(producto) / pesoBolsa : (producto ? precioFinal(producto) : 0)

  /** Kilos reales → cantidad que espera el carrito (fracción de bolsa, o kilos directo). */
  const kgACantidad = (kg: number) => (pesoBolsa > 0 ? kg / pesoBolsa : kg)

  // Cada vez que se abre con otro producto se reinicia: arrastrar "2,5" de la
  // venta anterior es una forma muy fácil de despachar de más. Una bolsa con
  // peso arranca en su propio peso completo — la venta más común es la bolsa
  // entera — para que un simple Enter la agregue igual.
  useEffect(() => {
    if (!producto) return
    setValorUnidades("1")
    if (!fraccionable) {
      setValorKg("")
      setValorMonto("")
      return
    }
    const kgInicial = pesoBolsa > 0 ? pesoBolsa : 0
    setValorKg(kgInicial > 0 ? String(kgInicial) : "")
    setValorMonto(kgInicial > 0 && precioPorKg > 0 ? numeroLimpio(kgInicial * precioPorKg) : "")
  }, [producto, fraccionable, pesoBolsa, precioPorKg])

  const escribirKg = (texto: string) => {
    setValorKg(texto)
    const kg = Number(texto.replace(",", "."))
    setValorMonto(Number.isFinite(kg) && kg > 0 && precioPorKg > 0 ? numeroLimpio(kg * precioPorKg) : "")
  }

  const escribirMonto = (texto: string) => {
    setValorMonto(texto)
    const monto = Number(texto.replace(",", "."))
    setValorKg(Number.isFinite(monto) && monto > 0 && precioPorKg > 0 ? numeroLimpio(monto / precioPorKg) : "")
  }

  const cantidad = fraccionable
    ? kgACantidad(Number(valorKg.replace(",", ".")) || 0)
    : Number(valorUnidades.replace(",", ".")) || 0

  const importe = producto && cantidad > 0 ? precioLinea(producto, cantidad) : 0
  const excedeStock =
    producto?.controlaStock === true && cantidad > producto.stock

  const confirmar = () => {
    if (cantidad <= 0 || excedeStock) return
    onConfirmar(cantidad)
  }

  // El peso de la bolsa entera va primero en los atajos, para que vender la
  // bolsa completa (el caso más común) sea un solo click.
  const atajosKilos =
    pesoBolsa > 0 ? [pesoBolsa, ...KILOS_RAPIDOS.filter((k) => k !== pesoBolsa)] : KILOS_RAPIDOS

  return (
    <Dialog open={producto !== null} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{fraccionable ? "¿Cuánto se lleva?" : "¿Cuántas unidades?"}</DialogTitle>
          <DialogDescription>
            {producto ? descripcionLinea(producto) : ""}
          </DialogDescription>
        </DialogHeader>

        {producto && (
          <div className="space-y-4">
            {!fraccionable ? (
              <div className="space-y-2">
                <Label htmlFor="cantidad">Unidades</Label>
                <Input
                  id="cantidad"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step={1}
                  value={valorUnidades}
                  autoFocus
                  placeholder="1"
                  onChange={(e) => setValorUnidades(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmar()
                  }}
                  className="h-12 text-lg"
                />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="kilos">Kilos</Label>
                  <Input
                    id="kilos"
                    type="number"
                    inputMode="decimal"
                    min={0.001}
                    step={0.1}
                    value={valorKg}
                    autoFocus
                    placeholder="Ej: 0,1 para 100 g"
                    onChange={(e) => escribirKg(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmar()
                    }}
                    className="h-12 text-lg"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {atajosKilos.map((n) => (
                      <Button
                        key={n}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => escribirKg(String(n))}
                      >
                        {n === pesoBolsa
                          ? `Bolsa (${formatCantidad(n)} kg)`
                          : n < 1
                            ? `${formatCantidad(n * 1000)} g`
                            : `${formatCantidad(n)} kg`}
                      </Button>
                    ))}
                  </div>
                </div>

                {!esCombo && (
                  <div className="space-y-2">
                    <Label htmlFor="monto">Monto ($)</Label>
                    <Input
                      id="monto"
                      type="number"
                      inputMode="decimal"
                      min={1}
                      step={100}
                      value={valorMonto}
                      placeholder="Ej: 1000"
                      onChange={(e) => escribirMonto(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmar()
                      }}
                      className="h-12 text-lg"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {MONTOS_RAPIDOS.map((n) => (
                        <Button
                          key={n}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => escribirMonto(String(n))}
                        >
                          {formatCurrency(n)}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </>
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
