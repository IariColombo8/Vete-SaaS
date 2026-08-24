"use client"

import { useEffect, useState } from "react"
import { Package, History, TrendingDown } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { getHistorialPrecio, getMovimientos, type ProductoInput } from "@/lib/supabase/productos"
import type { AjusteStockTipo, CambioPrecio, MovimientoStock, Producto, ProductoUnidad } from "@/lib/supabase/types"
import { margenPct } from "@/lib/productos/precios"
import { formatCurrency, formatCantidad, formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

interface Props {
  tenantId: string
  /** null = alta de un producto nuevo. */
  producto: Producto | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onGuardar: (input: ProductoInput) => Promise<void>
  onAjustarStock: (tipo: AjusteStockTipo, cantidad: number, referencia: string) => Promise<void>
}

const TIPOS_AJUSTE: { value: AjusteStockTipo; label: string; ayuda: string }[] = [
  { value: "entrada", label: "Entrada", ayuda: "Llegó mercadería del proveedor" },
  { value: "uso", label: "Uso", ayuda: "Se consumió en una consulta" },
  { value: "rotura", label: "Rotura", ayuda: "Se rompió, venció o se perdió" },
  { value: "ajuste", label: "Ajuste", ayuda: "Corregir el stock al valor real contado" },
]

const ETIQUETA_MOVIMIENTO: Record<MovimientoStock["tipo"], string> = {
  entrada: "Entrada",
  uso: "Uso",
  rotura: "Rotura",
  ajuste: "Ajuste",
  venta: "Venta",
}

/** Campo de texto con etiqueta, para no repetir el mismo bloque 12 veces. */
function Campo({
  label, children, className, ayuda,
}: {
  label: string
  children: React.ReactNode
  className?: string
  ayuda?: string
}) {
  return (
    <div className={className}>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      {children}
      {ayuda && <p className="mt-1 text-[11px] text-muted-foreground">{ayuda}</p>}
    </div>
  )
}

export function ProductoDialog({
  tenantId, producto, open, onOpenChange, onGuardar, onAjustarStock,
}: Props) {
  const esNuevo = producto === null

  const [codigo, setCodigo] = useState("")
  const [codigoBarras, setCodigoBarras] = useState("")
  const [nombre, setNombre] = useState("")
  const [categoria, setCategoria] = useState("")
  const [imagenUrl, setImagenUrl] = useState("")
  const [precio, setPrecio] = useState("")
  const [costo, setCosto] = useState("")
  const [stockMinimo, setStockMinimo] = useState("0")
  const [stockInicial, setStockInicial] = useState("0")
  const [unidad, setUnidad] = useState<ProductoUnidad>("un")
  const [unidadesPorBulto, setUnidadesPorBulto] = useState("")
  const [marca, setMarca] = useState("")
  const [linea, setLinea] = useState("")
  const [pesoKg, setPesoKg] = useState("")
  const [fechaVencimiento, setFechaVencimiento] = useState("")
  const [controlaStock, setControlaStock] = useState(true)
  const [activo, setActivo] = useState(true)
  const [revisar, setRevisar] = useState(false)

  const [historial, setHistorial] = useState<CambioPrecio[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([])
  const [guardando, setGuardando] = useState(false)

  const [ajusteTipo, setAjusteTipo] = useState<AjusteStockTipo>("entrada")
  const [ajusteCantidad, setAjusteCantidad] = useState("")
  const [ajusteNota, setAjusteNota] = useState("")
  const [ajustando, setAjustando] = useState(false)

  useEffect(() => {
    if (!open) return

    setAjusteTipo("entrada")
    setAjusteCantidad("")
    setAjusteNota("")

    if (!producto) {
      setCodigo(""); setCodigoBarras(""); setNombre(""); setCategoria(""); setImagenUrl("")
      setPrecio(""); setCosto(""); setStockMinimo("0"); setStockInicial("0")
      setUnidad("un"); setUnidadesPorBulto(""); setFechaVencimiento("")
      setControlaStock(true); setActivo(true); setRevisar(false)
      setHistorial([]); setMovimientos([])
      return
    }

    setCodigo(producto.codigo ?? "")
    setCodigoBarras(producto.codigoBarras ?? "")
    setNombre(producto.nombre)
    setCategoria(producto.categoria)
    setImagenUrl(producto.imagenUrl ?? "")
    setPrecio(String(producto.precio))
    setCosto(producto.costo != null ? String(producto.costo) : "")
    setStockMinimo(String(producto.stockMinimo))
    setUnidad(producto.unidad)
    setUnidadesPorBulto(producto.unidadesPorBulto ? String(producto.unidadesPorBulto) : "")
    setMarca(producto.marca ?? "")
    setLinea(producto.linea ?? "")
    setPesoKg(producto.pesoKg ? String(producto.pesoKg) : "")
    setFechaVencimiento(producto.fechaVencimiento ?? "")
    setControlaStock(producto.controlaStock)
    setActivo(producto.activo)
    setRevisar(producto.revisar)

    // El historial es informativo: si falla, el diálogo igual tiene que abrir.
    getHistorialPrecio(tenantId, producto.id).then(setHistorial).catch(() => setHistorial([]))
    getMovimientos(tenantId, producto.id, 8).then(setMovimientos).catch(() => setMovimientos([]))
  }, [open, producto, tenantId])

  const precioNum = Number(precio) || 0
  const costoNum = costo.trim() ? Number(costo) : undefined
  const margen = margenPct(precioNum, costoNum)
  const nombreInvalido = !nombre.trim()

  const guardar = async () => {
    if (nombreInvalido) return
    setGuardando(true)
    try {
      await onGuardar({
        codigo,
        codigoBarras,
        nombre,
        categoria,
        imagenUrl,
        precio: precioNum,
        costo: costoNum,
        stockMinimo: Number(stockMinimo) || 0,
        controlaStock,
        unidad,
        unidadesPorBulto: unidadesPorBulto.trim() ? Number(unidadesPorBulto) : undefined,
        marca,
        linea,
        // Una bolsa suelta se vende por kilo: el peso de la bolsa no aplica.
        pesoKg: unidad === "kg" || !pesoKg.trim() ? undefined : Number(pesoKg),
        fechaVencimiento,
        activo,
        revisar,
        stockInicial: esNuevo && controlaStock ? Number(stockInicial) || 0 : 0,
      })
      onOpenChange(false)
    } finally {
      setGuardando(false)
    }
  }

  const aplicarAjuste = async () => {
    const n = Number(ajusteCantidad)
    if (ajusteCantidad === "" || !Number.isFinite(n)) return
    setAjustando(true)
    try {
      await onAjustarStock(ajusteTipo, n, ajusteNota)
      setAjusteCantidad("")
      setAjusteNota("")
      if (producto) {
        getMovimientos(tenantId, producto.id, 8).then(setMovimientos).catch(() => {})
      }
    } finally {
      setAjustando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-emerald-600" />
            {esNuevo ? "Nuevo producto" : producto.nombre}
          </DialogTitle>
          <DialogDescription>
            {esNuevo
              ? "Cargá la mercadería que vendés en el mostrador."
              : "El stock no se edita acá: usá el bloque de movimientos para que quede registrado quién lo tocó."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Campo label="Nombre">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Alimento balanceado adulto 15kg" />
            {nombreInvalido && <p className="mt-1 text-xs text-red-600">El nombre es obligatorio</p>}
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Código de barras">
              <Input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} placeholder="Opcional" />
            </Campo>
            <Campo label="Código interno">
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Opcional" />
            </Campo>
          </div>

          <Campo label="Rubro / Subrubro">
            <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ej: Alimentos / Perro" />
          </Campo>

          <Campo label="Foto" ayuda="URL de la imagen. Subila a Storage o pegá un enlace.">
            <div className="flex items-center gap-3">
              {imagenUrl.trim() ? (
                // <img> y no next/image: la URL es libre y no queremos configurar
                // remotePatterns por cada host que el usuario decida usar.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imagenUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-md border object-cover"
                  onError={(e) => { e.currentTarget.style.visibility = "hidden" }}
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border bg-muted">
                  <Package className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <Input
                value={imagenUrl}
                onChange={(e) => setImagenUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Precio de venta">
              <Input type="number" inputMode="decimal" min={0} value={precio} onChange={(e) => setPrecio(e.target.value)} />
            </Campo>
            <Campo label="Costo" ayuda="Opcional. Sin esto no se calcula el margen.">
              <Input type="number" inputMode="decimal" min={0} value={costo} onChange={(e) => setCosto(e.target.value)} />
            </Campo>
          </div>

          {margen !== null && (
            <div className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
              margen < 0
                ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
            )}>
              {margen < 0 && <TrendingDown className="h-4 w-4 shrink-0" />}
              <span>
                Margen: <strong>{margen.toFixed(1)}%</strong>
                {margen < 0 && " — estás vendiendo por debajo del costo"}
              </span>
            </div>
          )}

          <label className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <span className="text-sm font-medium">
              Es un servicio
              <span className="block text-xs font-normal text-muted-foreground">
                Ej: baño, peluquería, corte de uñas — se cobra pero no lleva stock
              </span>
            </span>
            <Switch checked={!controlaStock} onCheckedChange={(v) => setControlaStock(!v)} />
          </label>

          {controlaStock && (
            <>
              <div className="grid grid-cols-3 gap-3">
                {esNuevo && (
                  <Campo label="Stock inicial">
                    <Input type="number" inputMode="decimal" min={0} value={stockInicial} onChange={(e) => setStockInicial(e.target.value)} />
                  </Campo>
                )}
                <Campo label="Stock mínimo" ayuda="Avisa cuando baja de acá">
                  <Input type="number" inputMode="decimal" min={0} value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} />
                </Campo>
                <Campo label="Se vende por">
                  <select
                    value={unidad}
                    onChange={(e) => setUnidad(e.target.value as ProductoUnidad)}
                    className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                  >
                    <option value="un">Unidad</option>
                    <option value="kg">Peso (kg)</option>
                  </select>
                </Campo>
                {!esNuevo && (
                  <Campo label="Unidades por bulto">
                    <Input type="number" inputMode="numeric" min={1} value={unidadesPorBulto} onChange={(e) => setUnidadesPorBulto(e.target.value)} placeholder="Ej: 12" />
                  </Campo>
                )}
              </div>

              {esNuevo && (
                <Campo label="Unidades por bulto" ayuda="Cuántas unidades trae el paquete cerrado del proveedor">
                  <Input type="number" inputMode="numeric" min={1} value={unidadesPorBulto} onChange={(e) => setUnidadesPorBulto(e.target.value)} placeholder="Ej: 12" />
                </Campo>
              )}

              {/* Alimento: con estos tres campos el mostrador arma el selector
                  guiado marca → línea → presentación. Vacíos = producto común,
                  que se busca por nombre como siempre. */}
              <div className="grid grid-cols-3 gap-3">
                <Campo label="Marca" ayuda="Ej: Royal Canin">
                  <Input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Opcional" />
                </Campo>
                <Campo label="Línea" ayuda="Ej: Adulto Mediano">
                  <Input value={linea} onChange={(e) => setLinea(e.target.value)} placeholder="Opcional" />
                </Campo>
                <Campo
                  label="Kilos de la bolsa"
                  ayuda={unidad === "kg" ? "No aplica: se vende suelto" : "Ej: 15"}
                >
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.5}
                    value={unidad === "kg" ? "" : pesoKg}
                    disabled={unidad === "kg"}
                    onChange={(e) => setPesoKg(e.target.value)}
                    placeholder="Opcional"
                  />
                </Campo>
              </div>

              <Campo label="Fecha de vencimiento" ayuda="Opcional. Se avisa 30 días antes.">
                <Input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} />
              </Campo>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <span className="text-sm font-medium">Activo</span>
              <Switch checked={activo} onCheckedChange={setActivo} />
            </label>
            <label className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <span className="text-sm font-medium">A revisar</span>
              <Switch checked={revisar} onCheckedChange={setRevisar} />
            </label>
          </div>

          {/* Movimientos de stock: solo tiene sentido sobre un producto ya creado */}
          {!esNuevo && producto.controlaStock && (
            <div className="rounded-lg border p-3">
              <p className="mb-3 text-sm font-medium">
                Mover stock{" "}
                <span className="font-normal text-muted-foreground">
                  (actual: {formatCantidad(producto.stock)} {producto.unidad})
                </span>
              </p>

              <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TIPOS_AJUSTE.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setAjusteTipo(t.value)}
                    title={t.ayuda}
                    className={cn(
                      "rounded-lg border py-2 text-sm font-medium transition-colors",
                      ajusteTipo === t.value
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : "hover:bg-muted",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <p className="mb-2 text-xs text-muted-foreground">
                {TIPOS_AJUSTE.find((t) => t.value === ajusteTipo)?.ayuda}
              </p>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="number" inputMode="decimal" min={0}
                  placeholder={ajusteTipo === "ajuste" ? "Stock real contado" : "Cantidad"}
                  value={ajusteCantidad}
                  onChange={(e) => setAjusteCantidad(e.target.value)}
                  className="sm:w-44"
                />
                <Input
                  placeholder="Nota (opcional)"
                  value={ajusteNota}
                  onChange={(e) => setAjusteNota(e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  disabled={ajustando || ajusteCantidad === ""}
                  onClick={aplicarAjuste}
                >
                  {ajustando ? "Aplicando…" : "Aplicar"}
                </Button>
              </div>

              {movimientos.length > 0 && (
                <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
                  {movimientos.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        <span className={cn(
                          "font-medium",
                          m.cantidad >= 0 ? "text-emerald-600" : "text-red-600",
                        )}>
                          {m.cantidad >= 0 ? "+" : ""}{formatCantidad(m.cantidad)}
                        </span>
                        {" "}· {ETIQUETA_MOVIMIENTO[m.tipo]}
                        {m.usuarioNombre && ` · ${m.usuarioNombre}`}
                        {m.referencia && ` · ${m.referencia}`}
                      </span>
                      <span className="shrink-0">{formatDateTime(m.fecha)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {historial.length > 0 && (
            <div className="rounded-lg border p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <History className="h-3.5 w-3.5" /> Cambios de precio
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {historial.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {formatCurrency(Number(h.valorAnterior))} →{" "}
                      <strong className="text-foreground">{formatCurrency(Number(h.valorNuevo))}</strong>
                      {h.usuarioNombre && ` · ${h.usuarioNombre}`}
                    </span>
                    <span className="shrink-0">{formatDateTime(h.fecha)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={guardando || nombreInvalido}
            onClick={guardar}
          >
            {guardando ? "Guardando…" : esNuevo ? "Crear producto" : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
