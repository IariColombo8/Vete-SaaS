"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TIPOS_AJUSTE } from "@/lib/productos/ajuste-stock"
import { ajustarStockMasivo } from "@/lib/supabase/productos"
import type { AjusteStockTipo, Producto } from "@/lib/supabase/types"
import { cn } from "@/lib/utils"

interface Props {
  productos: Producto[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onAplicado: () => void
}

/**
 * Mueve el stock de la selección múltiple del listado con un solo
 * movimiento repetido: "Ajuste" deja a todos en el mismo valor final,
 * "Entrada"/"Uso"/"Rotura" suman o restan la misma cantidad a todos.
 * Cada producto genera su propio registro — nunca se pisa el stock directo.
 */
export function StockMasivoDialog({ productos, open, onOpenChange, onAplicado }: Props) {
  const [tipo, setTipo] = useState<AjusteStockTipo>("entrada")
  const [cantidad, setCantidad] = useState("")
  const [nota, setNota] = useState("")
  const [guardando, setGuardando] = useState(false)

  const cerrar = (abierto: boolean) => {
    if (!abierto) { setTipo("entrada"); setCantidad(""); setNota("") }
    onOpenChange(abierto)
  }

  const confirmar = async () => {
    const n = Number(cantidad)
    if (cantidad === "" || !Number.isFinite(n)) {
      toast.error("Ingresá una cantidad válida")
      return
    }
    setGuardando(true)
    try {
      const actualizados = await ajustarStockMasivo(productos, tipo, n, nota)
      toast.success(`${actualizados} producto${actualizados === 1 ? "" : "s"} actualizado${actualizados === 1 ? "" : "s"}`)
      onAplicado()
      cerrar(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo mover el stock")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mover stock</DialogTitle>
          <DialogDescription>
            {productos.length === 1 ? productos[0].nombre : `${productos.length} productos seleccionados`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TIPOS_AJUSTE.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTipo(t.value)}
              title={t.ayuda}
              className={cn(
                "rounded-lg border py-2 text-sm font-medium transition-colors",
                tipo === t.value
                  ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : "hover:bg-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          {TIPOS_AJUSTE.find((t) => t.value === tipo)?.ayuda}
        </p>

        <Input
          type="number" inputMode="decimal" min={0}
          placeholder={tipo === "ajuste" ? "Stock final para todos" : "Cantidad para todos"}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
        />
        <Input placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />

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
