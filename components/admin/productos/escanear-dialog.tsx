"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { BarcodeScannerDialog } from "@/components/shared/barcode-scanner-dialog"
import { ListaParaAsignarCodigo } from "@/components/admin/productos/codigo-no-encontrado-dialog"
import {
  ajustarStock, getProductoPorCodigo,
} from "@/lib/supabase/productos"
import { TIPOS_AJUSTE } from "@/lib/productos/ajuste-stock"
import { formatCantidad } from "@/lib/format"
import type { AjusteStockTipo, Producto } from "@/lib/supabase/types"
import { cn } from "@/lib/utils"

interface Props {
  tenantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Se movió stock o se asignó un código: refrescar la lista. */
  onCambio: () => void
  /** El código no matcheó a nadie y el usuario prefiere darlo de alta. */
  onCrearNuevo: (codigo: string) => void
}

type Fase =
  | { tipo: "escaneando" }
  | { tipo: "sumando"; producto: Producto }
  | { tipo: "sinMatch"; codigo: string }

/**
 * Escanear desde Productos sirve para dos cosas: sumar stock de un producto
 * que ya tiene código asignado (llegó mercadería, se escanea uno por uno), o
 * —si el código todavía no está en ningún producto— asignárselo a uno
 * existente o dar de alta uno nuevo. Después de cada acción vuelve a
 * "escaneando" para seguir con el próximo producto sin cerrar el diálogo.
 */
export function EscanearDialog({ tenantId, open, onOpenChange, onCambio, onCrearNuevo }: Props) {
  const [fase, setFase] = useState<Fase>({ tipo: "escaneando" })

  useEffect(() => {
    if (open) setFase({ tipo: "escaneando" })
  }, [open])

  const manejarDetectado = async (codigo: string) => {
    const producto = await getProductoPorCodigo(tenantId, codigo)
    setFase(producto ? { tipo: "sumando", producto } : { tipo: "sinMatch", codigo })
  }

  if (fase.tipo === "escaneando") {
    return (
      <BarcodeScannerDialog open={open} onOpenChange={onOpenChange} onDetected={manejarDetectado} />
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {fase.tipo === "sumando" ? (
        <SumarStockPanel
          producto={fase.producto}
          onVolverAEscanear={() => setFase({ tipo: "escaneando" })}
          onAplicado={onCambio}
        />
      ) : (
        <SinMatchPanel
          tenantId={tenantId}
          codigo={fase.codigo}
          onAsignado={(producto) => { setFase({ tipo: "sumando", producto }); onCambio() }}
          onCrearNuevo={() => { onCrearNuevo(fase.codigo); onOpenChange(false) }}
          onVolverAEscanear={() => setFase({ tipo: "escaneando" })}
        />
      )}
    </Dialog>
  )
}

function SumarStockPanel({
  producto, onVolverAEscanear, onAplicado,
}: {
  producto: Producto
  onVolverAEscanear: () => void
  onAplicado: () => void
}) {
  const [tipo, setTipo] = useState<AjusteStockTipo>("entrada")
  const [cantidad, setCantidad] = useState("1")
  const [nota, setNota] = useState("")
  const [aplicando, setAplicando] = useState(false)
  const [stockActual, setStockActual] = useState(producto.stock)

  const aplicar = async () => {
    const n = Number(cantidad)
    if (cantidad === "" || !Number.isFinite(n)) return
    setAplicando(true)
    try {
      const res = await ajustarStock(producto.id, tipo, n, nota)
      setStockActual(res.stockNuevo)
      toast.success(`Stock actualizado: ${formatCantidad(res.stockNuevo)}`)
      onAplicado()
      onVolverAEscanear()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo mover el stock")
    } finally {
      setAplicando(false)
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{producto.nombre}</DialogTitle>
        <DialogDescription>
          Stock actual: {formatCantidad(stockActual)} {producto.unidad}
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
        type="number" inputMode="decimal" min={0} autoFocus
        placeholder={tipo === "ajuste" ? "Stock real contado" : "Cantidad"}
        value={cantidad}
        onChange={(e) => setCantidad(e.target.value)}
      />
      <Input placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />

      <DialogFooter>
        <Button variant="outline" onClick={onVolverAEscanear} disabled={aplicando}>
          Volver a escanear
        </Button>
        <Button onClick={aplicar} disabled={aplicando || cantidad === ""} className="bg-emerald-600 hover:bg-emerald-700">
          {aplicando ? "Aplicando…" : "Aplicar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

function SinMatchPanel({
  tenantId, codigo, onAsignado, onCrearNuevo, onVolverAEscanear,
}: {
  tenantId: string
  codigo: string
  onAsignado: (producto: Producto) => void
  onCrearNuevo: () => void
  onVolverAEscanear: () => void
}) {
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>No se encuentra el producto</DialogTitle>
        <DialogDescription>
          El código &ldquo;{codigo}&rdquo; no está en ningún producto. Agregá uno nuevo o elegí
          de la lista a cuál pertenece: el código queda guardado para la próxima.
        </DialogDescription>
      </DialogHeader>

      <Button onClick={onCrearNuevo} className="w-full bg-emerald-600 hover:bg-emerald-700">
        <Plus className="mr-2 h-4 w-4" /> Agregar
      </Button>

      <ListaParaAsignarCodigo tenantId={tenantId} codigo={codigo} onAsignado={onAsignado} />

      <DialogFooter>
        <Button variant="outline" onClick={onVolverAEscanear}>Volver a escanear</Button>
      </DialogFooter>
    </DialogContent>
  )
}
