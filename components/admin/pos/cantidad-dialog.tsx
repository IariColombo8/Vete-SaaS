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

/** Atajos de unidades sueltas de un paquete divisible (ej. golosinas de a una). */
const UNIDADES_RAPIDAS = [1, 2, 3, 5, 10]

/** Atajos de montos: los pedidos típicos cuando el cliente pide "$1000 de alimento". */
const MONTOS_RAPIDOS = [500, 1000, 1500, 2000, 3000, 5000]

/** Redondea a 3 decimales y saca ceros de más, para que el campo no muestre "1.500000000004". */
function numeroLimpio(n: number): string {
  const redondeado = Math.round(n * 1000) / 1000
  return redondeado > 0 ? String(redondeado) : ""
}

/**
 * Pide cuánto se lleva el cliente. Dos campos siempre visibles — el campo
 * "natural" (kilos, o unidades sueltas de un paquete) y el Monto — que se
 * recalculan entre sí en cualquier dirección: escribir en uno completa el
 * otro solo, sin tener que elegir un "modo" antes de tipear.
 *
 * Hay tres formas de vender algo fraccionado, y las tres comparten la misma
 * mecánica (una "escala" que representa el producto completo, y una cantidad
 * parcial de esa escala):
 *  - Suelto por peso (`unidad === "kg"`): sin escala, el campo es kilos reales.
 *  - Bolsa cerrada con peso conocido (`pesoKg`): la escala es el peso de la
 *    bolsa; el campo sigue siendo kilos reales, la cantidad que ve el
 *    carrito es la fracción de bolsa.
 *  - Paquete divisible (`unidadesPorBulto`, ej. una caja de 100 golosinas):
 *    la escala es cuántas unidades trae el paquete; el campo es la cantidad
 *    de unidades sueltas, la cantidad que ve el carrito es la fracción del
 *    paquete.
 */
export function CantidadDialog({ producto, onCerrar, onConfirmar }: Props) {
  const [valorNatural, setValorNatural] = useState("")
  const [valorMonto, setValorMonto] = useState("")
  const [valorUnidades, setValorUnidades] = useState("1")

  const porKg = producto?.unidad === "kg"
  // Un paquete con cantidad de unidades tiene prioridad sobre el peso: si un
  // producto tuviera los dos (una caja de sobres con peso por sobre
  // detectado), tiene más sentido venderlo contando sobres que pesándolos.
  const bultoUnidades = producto?.unidad === "un" ? (producto?.unidadesPorBulto ?? 0) : 0
  const bultoPeso = producto?.unidad === "un" && bultoUnidades <= 0 ? (producto?.pesoKg ?? 0) : 0
  const modoNatural: "kg" | "u" = bultoUnidades > 0 ? "u" : "kg"
  // Tamaño del producto completo en su unidad natural: kilos de la bolsa, o
  // unidades del paquete. 0 cuando se vende suelto por kg sin bolsa de por medio.
  const escala = bultoUnidades > 0 ? bultoUnidades : bultoPeso
  const fraccionable = porKg || escala > 0
  // El monto en pesos asume precio unitario fijo: no tiene forma limpia de
  // invertirse cuando hay un combo (N unidades a precio fijo) de por medio.
  const esCombo = producto ? tieneOferta(producto) && producto.ofertaTipo === "combo" : false

  const precioPorNatural = producto && escala > 0 ? precioFinal(producto) / escala : (producto ? precioFinal(producto) : 0)

  /** Cantidad en la unidad natural → cantidad que espera el carrito (fracción del completo, o directo). */
  const naturalACantidad = (n: number) => (escala > 0 ? n / escala : n)

  // Cada vez que se abre con otro producto se reinicia: arrastrar "2,5" de la
  // venta anterior es una forma muy fácil de despachar de más. Un paquete o
  // una bolsa arrancan en su propio tamaño completo — la venta más común es
  // el producto entero — para que un simple Enter lo agregue igual.
  useEffect(() => {
    if (!producto) return
    setValorUnidades("1")
    if (!fraccionable) {
      setValorNatural("")
      setValorMonto("")
      return
    }
    const naturalInicial = escala > 0 ? escala : 0
    const precioInicial = escala > 0 ? precioFinal(producto) / escala : precioFinal(producto)
    setValorNatural(naturalInicial > 0 ? String(naturalInicial) : "")
    setValorMonto(naturalInicial > 0 && precioInicial > 0 ? numeroLimpio(naturalInicial * precioInicial) : "")
  }, [producto, fraccionable, escala])

  const escribirNatural = (texto: string) => {
    setValorNatural(texto)
    const n = Number(texto.replace(",", "."))
    setValorMonto(Number.isFinite(n) && n > 0 && precioPorNatural > 0 ? numeroLimpio(n * precioPorNatural) : "")
  }

  const escribirMonto = (texto: string) => {
    setValorMonto(texto)
    const monto = Number(texto.replace(",", "."))
    setValorNatural(Number.isFinite(monto) && monto > 0 && precioPorNatural > 0 ? numeroLimpio(monto / precioPorNatural) : "")
  }

  const cantidad = fraccionable
    ? naturalACantidad(Number(valorNatural.replace(",", ".")) || 0)
    : Number(valorUnidades.replace(",", ".")) || 0

  const importe = producto && cantidad > 0 ? precioLinea(producto, cantidad) : 0
  const excedeStock =
    producto?.controlaStock === true && cantidad > producto.stock

  const confirmar = () => {
    if (cantidad <= 0 || excedeStock) return
    onConfirmar(cantidad)
  }

  // El tamaño completo (bolsa o paquete) va primero en los atajos, para que
  // vender el producto entero (el caso más común) sea un solo click.
  const atajosNaturales =
    modoNatural === "u"
      ? escala > 0 && !UNIDADES_RAPIDAS.includes(escala)
        ? [escala, ...UNIDADES_RAPIDAS]
        : UNIDADES_RAPIDAS
      : escala > 0 && !KILOS_RAPIDOS.includes(escala)
        ? [escala, ...KILOS_RAPIDOS]
        : KILOS_RAPIDOS

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
                  <Label htmlFor="natural">{modoNatural === "u" ? "Unidades sueltas" : "Kilos"}</Label>
                  <Input
                    id="natural"
                    type="number"
                    inputMode="decimal"
                    min={modoNatural === "u" ? 1 : 0.001}
                    step={modoNatural === "u" ? 1 : 0.1}
                    value={valorNatural}
                    autoFocus
                    placeholder={modoNatural === "u" ? "Ej: 3" : "Ej: 0,1 para 100 g"}
                    onChange={(e) => escribirNatural(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmar()
                    }}
                    className="h-12 text-lg"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {atajosNaturales.map((n) => (
                      <Button
                        key={n}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => escribirNatural(String(n))}
                      >
                        {n === escala
                          ? modoNatural === "u"
                            ? `Paquete completo (${formatCantidad(n)})`
                            : `Bolsa (${formatCantidad(n)} kg)`
                          : modoNatural === "u"
                            ? `${n} u.`
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
