"use client"

import { useEffect, useMemo, useState } from "react"
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

/** Atajos de kilos: los pedidos típicos del mostrador. */
const KILOS_RAPIDOS = [0.5, 1, 2, 3, 5, 10]

/** Atajos de gramos: para pedidos chicos, donde "0,2" es menos natural que "200". */
const GRAMOS_RAPIDOS = [100, 200, 250, 500, 750]

/** Atajos de montos: los pedidos típicos cuando el cliente pide "$1000 de alimento". */
const MONTOS_RAPIDOS = [500, 1000, 1500, 2000, 3000, 5000]

type UnidadIngreso = "kg" | "g" | "$"

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
  // Una bolsa cerrada con peso detectado (import de alimentos) también se
  // puede vender fraccionada: alguien abre la bolsa de 6 kg y vende 1 kg
  // suelto. `pesoBolsa` es el peso de la bolsa completa; 0 si no aplica.
  const pesoBolsa = producto?.unidad === "un" ? (producto?.pesoKg ?? 0) : 0
  const fraccionable = porKg || pesoBolsa > 0
  // El monto en pesos asume precio unitario fijo: no tiene forma limpia de
  // invertirse cuando hay un combo (N unidades a precio fijo) de por medio.
  const esCombo = producto ? tieneOferta(producto) && producto.ofertaTipo === "combo" : false

  // Cada vez que se abre con otro producto se reinicia: arrastrar "2,5" de la
  // venta anterior es una forma muy fácil de despachar de más. Una bolsa con
  // peso arranca en su propio peso completo — la venta más común es la bolsa
  // entera, no una fracción — para que un simple Enter la agregue igual.
  useEffect(() => {
    if (producto) {
      setValor(pesoBolsa > 0 ? String(pesoBolsa) : porKg ? "" : "1")
      setUnidadIngreso("kg")
    }
  }, [producto, porKg, pesoBolsa])

  // El carrito espera la cantidad en la unidad del producto: kilos reales
  // cuando se vende suelto, o fracción de bolsa (0.5 = media bolsa) cuando es
  // una bolsa cerrada con peso. El monto en pesos no necesita distinguir los
  // dos casos: dividir por el precio de venta ya da directamente lo que hay
  // que cargar en cada caso (kilos en uno, fracción de bolsa en el otro).
  const cantidad = useMemo(() => {
    const n = Number(valor.replace(",", "."))
    if (!Number.isFinite(n) || n <= 0) return 0
    if (unidadIngreso === "$") {
      const precio = producto ? precioFinal(producto) : 0
      return precio > 0 ? n / precio : 0
    }
    const kg = unidadIngreso === "g" ? n / 1000 : n
    return pesoBolsa > 0 ? kg / pesoBolsa : kg
  }, [valor, unidadIngreso, producto, pesoBolsa])

  // Solo para mostrar el "≈" bajo el importe: cuántos kilos reales representa
  // la cantidad calculada (que para una bolsa es una fracción, no kilos).
  const kgReales = pesoBolsa > 0 ? cantidad * pesoBolsa : cantidad

  // El peso de la bolsa entera va primero en los atajos, para que vender la
  // bolsa completa (el caso más común) sea un solo click.
  const atajosKilos =
    pesoBolsa > 0 ? [pesoBolsa, ...KILOS_RAPIDOS.filter((k) => k !== pesoBolsa)] : KILOS_RAPIDOS

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
          <DialogTitle>{fraccionable ? "¿Cuánto se lleva?" : "¿Cuántas unidades?"}</DialogTitle>
          <DialogDescription>
            {producto ? descripcionLinea(producto) : ""}
          </DialogDescription>
        </DialogHeader>

        {producto && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="cantidad">
                  {fraccionable
                    ? unidadIngreso === "g"
                      ? "Peso"
                      : unidadIngreso === "$"
                        ? "Monto"
                        : "Kilos"
                    : "Unidades"}
                </Label>
                {fraccionable && (
                  <div className="flex gap-0.5 rounded-md border bg-background p-0.5">
                    {(esCombo ? (["kg", "g"] as const) : (["kg", "g", "$"] as const)).map((u) => (
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
                        {u === "kg" ? "Kilos" : u === "g" ? "Elegir peso (g)" : "Por monto ($)"}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <Input
                id="cantidad"
                type="number"
                inputMode="decimal"
                min={fraccionable ? (unidadIngreso === "g" ? 1 : unidadIngreso === "$" ? 1 : 0.001) : 1}
                step={fraccionable ? (unidadIngreso === "g" ? 10 : unidadIngreso === "$" ? 100 : 0.1) : 1}
                value={valor}
                autoFocus
                placeholder={
                  fraccionable
                    ? unidadIngreso === "g"
                      ? "Ej: 200"
                      : unidadIngreso === "$"
                        ? "Ej: 1000"
                        : "Ej: 2,5"
                    : "1"
                }
                onChange={(e) => setValor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmar()
                }}
                className="h-12 text-lg"
              />
            </div>

            {fraccionable && (
              <div className="flex flex-wrap gap-1.5">
                {(unidadIngreso === "g"
                  ? GRAMOS_RAPIDOS
                  : unidadIngreso === "$"
                    ? MONTOS_RAPIDOS
                    : atajosKilos
                ).map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setValor(String(n))}
                  >
                    {unidadIngreso === "g"
                      ? `${n} g`
                      : unidadIngreso === "$"
                        ? formatCurrency(n)
                        : n === pesoBolsa
                          ? `Bolsa (${formatCantidad(n)} kg)`
                          : `${formatCantidad(n)} kg`}
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
              {unidadIngreso === "$" && cantidad > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  ≈ {kgReales < 1 ? `${formatCantidad(kgReales * 1000)} g` : `${formatCantidad(kgReales)} kg`}
                </p>
              )}
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
