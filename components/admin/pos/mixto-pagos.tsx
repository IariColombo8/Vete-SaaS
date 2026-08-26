"use client"

import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatCurrency } from "@/lib/format"
import { MEDIOS_PAGO_SIMPLES, type MedioPago } from "@/lib/supabase/types"

export interface LineaPagoMixto {
  medioPago: MedioPago
  monto: number
}

interface Props {
  total: number
  pagos: LineaPagoMixto[]
  onCambiar: (pagos: LineaPagoMixto[]) => void
}

/**
 * Desglose de "Mixto": una o más líneas de {medio, monto} que tienen que sumar
 * exactamente el total, o `registrar_venta` rechaza la venta. Se valida acá
 * mismo para no hacer esperar al usuario un viaje a la base para enterarse.
 */
export function MixtoPagos({ total, pagos, onCambiar }: Props) {
  const suma = pagos.reduce((acc, p) => acc + (Number(p.monto) || 0), 0)
  const resta = Math.round((total - suma) * 100) / 100

  const agregarLinea = () => {
    const medioUsado = new Set(pagos.map((p) => p.medioPago))
    const disponible = MEDIOS_PAGO_SIMPLES.find((m) => !medioUsado.has(m.id))
    onCambiar([
      ...pagos,
      { medioPago: disponible?.id ?? "efectivo", monto: resta > 0 ? resta : 0 },
    ])
  }

  const actualizarLinea = (indice: number, cambio: Partial<LineaPagoMixto>) => {
    onCambiar(pagos.map((p, i) => (i === indice ? { ...p, ...cambio } : p)))
  }

  const quitarLinea = (indice: number) => {
    onCambiar(pagos.filter((_, i) => i !== indice))
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-2.5">
      <Label className="text-xs text-muted-foreground">Desglose del pago</Label>

      {pagos.map((pago, indice) => (
        <div key={indice} className="flex items-center gap-1.5">
          <select
            value={pago.medioPago}
            onChange={(e) => actualizarLinea(indice, { medioPago: e.target.value as MedioPago })}
            className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
            aria-label="Medio de pago de esta línea"
          >
            {MEDIOS_PAGO_SIMPLES.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <Input
            type="number"
            min={0}
            value={pago.monto || ""}
            placeholder="Monto"
            className="w-28"
            onChange={(e) => actualizarLinea(indice, { monto: Number(e.target.value) || 0 })}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-600"
            onClick={() => quitarLinea(indice)}
            aria-label="Quitar línea"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={agregarLinea}>
        <Plus className="h-3.5 w-3.5" />
        Agregar línea
      </Button>

      <p className={`text-right text-xs font-medium ${resta !== 0 ? "text-red-600 dark:text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>
        {resta === 0 ? "Coincide con el total" : `Falta desglosar ${formatCurrency(Math.abs(resta))}`}
      </p>
    </div>
  )
}
