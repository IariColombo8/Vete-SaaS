"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { actualizarFormatoVenta, type FormatoVenta } from "@/lib/supabase/productos"
import type { Producto } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  productos: Producto[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onAplicado: () => void
}

type Opcion = "kg" | "un" | "bulto"

/**
 * Cambia el formato de venta de uno o varios productos de una: por peso
 * suelto, por unidad simple, o por unidad dentro de un paquete divisible
 * (ej. una caja de 100 golosinas que se puede vender de a una).
 *
 * Se usa tanto desde Productos (selección múltiple) como desde el POS
 * (un producto elegido en el momento) — por eso recibe siempre un array,
 * aunque tenga un solo elemento.
 */
export function FormatoVentaDialog({ tenantId, productos, open, onOpenChange, onAplicado }: Props) {
  const [opcion, setOpcion] = useState<Opcion>("un")
  const [unidadesPorBulto, setUnidadesPorBulto] = useState("100")
  const [guardando, setGuardando] = useState(false)

  const cerrar = (abierto: boolean) => {
    if (!abierto) {
      setOpcion("un")
      setUnidadesPorBulto("100")
    }
    onOpenChange(abierto)
  }

  const confirmar = async () => {
    const n = Number(unidadesPorBulto)
    if (opcion === "bulto" && (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n))) {
      toast.error("La cantidad de unidades tiene que ser un entero mayor a cero")
      return
    }

    const formato: FormatoVenta =
      opcion === "bulto" ? { tipo: "bulto", unidadesPorBulto: n } : { tipo: opcion }

    setGuardando(true)
    try {
      const { actualizados, sinPrecioRecalculado } = await actualizarFormatoVenta(tenantId, productos, formato)

      if (sinPrecioRecalculado.length > 0) {
        toast.warning(
          `${actualizados} producto${actualizados === 1 ? "" : "s"} actualizado${actualizados === 1 ? "" : "s"}. ` +
            `${sinPrecioRecalculado.length} no tenían el peso de la bolsa cargado, así que el precio quedó ` +
            `igual — hay que corregirlo a mano: ${sinPrecioRecalculado.slice(0, 3).join(", ")}` +
            (sinPrecioRecalculado.length > 3 ? ` y ${sinPrecioRecalculado.length - 3} más` : ""),
        )
      } else {
        toast.success(`${actualizados} producto${actualizados === 1 ? "" : "s"} actualizado${actualizados === 1 ? "" : "s"}`)
      }

      onAplicado()
      cerrar(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar el formato de venta")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cambiar formato de venta</DialogTitle>
          <DialogDescription>
            {productos.length === 1
              ? productos[0].nombre
              : `${productos.length} productos seleccionados`}
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={opcion} onValueChange={(v) => setOpcion(v as Opcion)} className="gap-3">
          <label className="flex items-start gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-emerald-600 has-[[data-state=checked]]:bg-emerald-50 dark:has-[[data-state=checked]]:bg-emerald-950/30">
            <RadioGroupItem value="un" id="formato-un" className="mt-0.5" />
            <div>
              <p className="text-sm font-medium">Por unidad</p>
              <p className="text-xs text-muted-foreground">
                Se vende entero, tal cual (una lata, un juguete, una bolsa cerrada).
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-emerald-600 has-[[data-state=checked]]:bg-emerald-50 dark:has-[[data-state=checked]]:bg-emerald-950/30">
            <RadioGroupItem value="kg" id="formato-kg" className="mt-0.5" />
            <div>
              <p className="text-sm font-medium">Por peso</p>
              <p className="text-xs text-muted-foreground">
                Se vende suelto, pesado en el momento. Si el producto ya tenía el peso de la
                bolsa cargado, el precio se recalcula solo a precio por kilo.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-emerald-600 has-[[data-state=checked]]:bg-emerald-50 dark:has-[[data-state=checked]]:bg-emerald-950/30">
            <RadioGroupItem value="bulto" id="formato-bulto" className="mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium">Cantidad de unidades</p>
              <p className="text-xs text-muted-foreground">
                Viene en un paquete de varias unidades (ej. golosinas x100) que también se puede
                vender de a una — el precio del paquete se divide solo.
              </p>
              {opcion === "bulto" && (
                <div className="mt-2 flex items-center gap-2">
                  <Label htmlFor="unidades-bulto" className="text-xs shrink-0">
                    Unidades por paquete
                  </Label>
                  <Input
                    id="unidades-bulto"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={unidadesPorBulto}
                    onChange={(e) => setUnidadesPorBulto(e.target.value)}
                    className="h-8 w-24"
                  />
                </div>
              )}
            </div>
          </label>
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => cerrar(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={guardando} className="bg-emerald-600 hover:bg-emerald-700">
            {guardando ? "Aplicando…" : "Aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
