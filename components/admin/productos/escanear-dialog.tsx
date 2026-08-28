"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Search } from "lucide-react"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { BarcodeScannerDialog } from "@/components/shared/barcode-scanner-dialog"
import {
  asignarCodigoBarras, ajustarStock, getProductoPorCodigo, getProductos,
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

const DEBOUNCE_MS = 250

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
  const [busqueda, setBusqueda] = useState("")
  const [resultados, setResultados] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(false)
  const [asignandoId, setAsignandoId] = useState<string | null>(null)

  useEffect(() => {
    const termino = busqueda.trim()
    if (termino.length < 2) { setResultados([]); return }

    let vigente = true
    setCargando(true)
    const timer = setTimeout(() => {
      getProductos(tenantId, { busqueda: termino, porPagina: 10 })
        .then(({ productos }) => { if (vigente) setResultados(productos) })
        .finally(() => { if (vigente) setCargando(false) })
    }, DEBOUNCE_MS)

    return () => { vigente = false; clearTimeout(timer) }
  }, [busqueda, tenantId])

  const asignar = async (producto: Producto) => {
    setAsignandoId(producto.id)
    try {
      await asignarCodigoBarras(tenantId, producto.id, codigo)
      toast.success(`Código asignado a "${producto.nombre}"`)
      onAsignado({ ...producto, codigoBarras: codigo })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo asignar el código")
    } finally {
      setAsignandoId(null)
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Código sin asignar</DialogTitle>
        <DialogDescription>&ldquo;{codigo}&rdquo; no está en ningún producto.</DialogDescription>
      </DialogHeader>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, marca…"
          className="pl-9"
        />
      </div>

      <div className="max-h-64 overflow-y-auto">
        {cargando ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : resultados.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {busqueda.trim().length >= 2 ? "Sin resultados" : "Escribí al menos 2 letras"}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {resultados.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={asignandoId !== null}
                  onClick={() => asignar(p)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-60 dark:hover:bg-emerald-950/40"
                >
                  <span className="min-w-0 truncate">
                    {p.nombre}
                    {p.marca && <span className="text-muted-foreground"> · {p.marca}</span>}
                  </span>
                  {asignandoId === p.id ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : p.codigoBarras ? (
                    <span className="shrink-0 text-xs text-amber-600">ya tiene código</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DialogFooter className="sm:justify-between">
        <Button variant="outline" onClick={onVolverAEscanear}>Volver a escanear</Button>
        <Button onClick={onCrearNuevo} className="bg-emerald-600 hover:bg-emerald-700">
          Crear producto nuevo
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
