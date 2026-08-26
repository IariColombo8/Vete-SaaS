"use client"

import { useEffect, useState } from "react"
import { Tag } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { precioFinal, precioLinea } from "@/lib/productos/precios"
import { formatCurrency } from "@/lib/format"
import type { OfertaInput } from "@/lib/supabase/productos"
import type { OfertaTipo, Producto } from "@/lib/supabase/types"
import { cn } from "@/lib/utils"

interface Props {
  producto: Producto | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onGuardar: (oferta: OfertaInput) => Promise<void>
}

const TIPOS: { value: OfertaTipo; label: string }[] = [
  { value: "monto", label: "Monto ($)" },
  { value: "porcentaje", label: "Porcentaje (%)" },
  { value: "combo", label: "Combo (Nx$)" },
]

export function OfertaDialog({ producto, open, onOpenChange, onGuardar }: Props) {
  const [activa, setActiva] = useState(false)
  const [tipo, setTipo] = useState<OfertaTipo>("monto")
  const [valor, setValor] = useState("")
  const [cantidad, setCantidad] = useState("")
  const [tieneVencimiento, setTieneVencimiento] = useState(false)
  const [hasta, setHasta] = useState("")
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!open || !producto) return
    setActiva(producto.ofertaActiva)
    setTipo(producto.ofertaTipo ?? "monto")
    setValor(producto.ofertaValor ? String(producto.ofertaValor) : "")
    setCantidad(producto.ofertaCantidad ? String(producto.ofertaCantidad) : "")
    setTieneVencimiento(!!producto.ofertaHasta)
    setHasta(producto.ofertaHasta ?? "")
  }, [open, producto])

  if (!producto) return null

  const valorNum = Number(valor) || 0
  const cantidadNum = Number(cantidad) || 0
  const esCombo = tipo === "combo"

  // Mismas reglas que el CHECK `productos_oferta_ck` de la base: si esto pasa,
  // el insert no puede fallar por la constraint.
  const invalido =
    activa &&
    ((esCombo
      ? valorNum <= 0 || cantidadNum <= 1
      : valorNum <= 0 || (tipo === "porcentaje" && valorNum >= 100)) ||
      (tieneVencimiento && !hasta))

  const preview = esCombo
    ? precioLinea(
        { precio: producto.precio, ofertaActiva: true, ofertaTipo: "combo", ofertaValor: valorNum, ofertaCantidad: cantidadNum },
        cantidadNum || 1,
      )
    : precioFinal({
        precio: producto.precio,
        costo: producto.costo,
        ofertaActiva: activa,
        ofertaTipo: tipo,
        ofertaValor: valorNum,
      })

  const guardar = async () => {
    if (invalido) return
    setGuardando(true)
    try {
      await onGuardar({
        activa,
        tipo,
        valor: valorNum,
        cantidad: esCombo ? cantidadNum : undefined,
        hasta: tieneVencimiento ? hasta : null,
      })
      onOpenChange(false)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-emerald-600" /> Oferta
          </DialogTitle>
          <DialogDescription className="line-clamp-2">{producto.nombre}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <span className="text-sm font-medium">Producto en oferta</span>
            <Switch checked={activa} onCheckedChange={setActiva} />
          </label>

          {activa && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {TIPOS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTipo(t.value)}
                    className={cn(
                      "rounded-lg border py-2 text-xs font-medium transition-colors",
                      tipo === t.value
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : "hover:bg-muted",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {esCombo ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">Cada cuántas unidades</Label>
                    <Input type="number" inputMode="numeric" min={2} autoFocus
                      value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="Ej: 3" />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">Precio del combo</Label>
                    <Input type="number" inputMode="decimal" min={0}
                      value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ej: 2500" />
                  </div>
                </div>
              ) : (
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">
                    {tipo === "monto" ? "Descuento en pesos" : "Puntos de margen a restar"}
                  </Label>
                  <Input type="number" inputMode="decimal" min={0} autoFocus
                    value={valor} onChange={(e) => setValor(e.target.value)}
                    placeholder={tipo === "monto" ? "Ej: 500" : "Ej: 10"} />
                  {tipo === "porcentaje" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      No es % del precio: si el margen es 50% y ponés 10, el margen queda en 40%.
                    </p>
                  )}
                </div>
              )}

              {invalido && (
                <p className="text-xs text-red-600">
                  {esCombo
                    ? "Poné una cantidad mayor a 1 y un precio de combo mayor a 0"
                    : tipo === "porcentaje"
                      ? "El descuento tiene que ser mayor a 0 y menor a 100"
                      : tieneVencimiento && !hasta
                        ? "Elegí hasta qué día dura la oferta"
                        : "El descuento tiene que ser mayor a 0"}
                </p>
              )}

              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">Duración</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTieneVencimiento(false)}
                    className={cn(
                      "rounded-lg border py-2 text-xs font-medium transition-colors",
                      !tieneVencimiento
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : "hover:bg-muted",
                    )}
                  >
                    Hasta que la saque
                  </button>
                  <button
                    type="button"
                    onClick={() => setTieneVencimiento(true)}
                    className={cn(
                      "rounded-lg border py-2 text-xs font-medium transition-colors",
                      tieneVencimiento
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : "hover:bg-muted",
                    )}
                  >
                    Hasta una fecha
                  </button>
                </div>
                {tieneVencimiento && (
                  <Input
                    type="date"
                    className="mt-2"
                    value={hasta}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setHasta(e.target.value)}
                  />
                )}
              </div>

              <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2.5">
                <span className="text-sm text-muted-foreground">
                  {esCombo ? `Precio llevando ${cantidadNum || "N"}` : "Precio final"}
                </span>
                <span className="flex items-baseline gap-2">
                  {!esCombo && (
                    <span className="text-xs text-muted-foreground line-through">
                      {formatCurrency(producto.precio)}
                    </span>
                  )}
                  <span className="text-lg font-bold text-emerald-600">{formatCurrency(preview)}</span>
                </span>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={guardando || invalido} onClick={guardar}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
