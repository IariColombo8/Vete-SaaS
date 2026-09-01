"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2, X } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { uploadFotoTenant } from "@/lib/supabase/storage"
import { getProductos } from "@/lib/supabase/productos"
import { formatCurrency } from "@/lib/format"
import type { SorteoInput } from "@/lib/supabase/sorteos"
import type { Producto, Sorteo, SorteoCompraModo } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  /** Si viene un sorteo, el diálogo edita ese sorteo en vez de crear uno nuevo. */
  sorteo?: Sorteo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onGuardar: (input: SorteoInput) => Promise<void>
}

interface PremioForm {
  tipo: "producto" | "otro"
  nombre: string
  descripcion: string
  fotoFile: File | null
  /** Foto ya guardada (edición): se conserva si no se elige un archivo nuevo. */
  fotoUrlActual: string | undefined
  productoId: string | undefined
  busqueda: string
  resultados: Producto[]
}

const PREMIO_VACIO: PremioForm = {
  tipo: "otro", nombre: "", descripcion: "", fotoFile: null, fotoUrlActual: undefined,
  productoId: undefined, busqueda: "", resultados: [],
}

export function SorteoDialog({ tenantId, sorteo, open, onOpenChange, onGuardar }: Props) {
  const [nombre, setNombre] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [fotoUrlActual, setFotoUrlActual] = useState<string | undefined>(undefined)
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [premios, setPremios] = useState<PremioForm[]>([{ ...PREMIO_VACIO }])
  const [guardando, setGuardando] = useState(false)

  const [chanceRegistro, setChanceRegistro] = useState(true)
  const [chanceCompra, setChanceCompra] = useState(true)
  const [compraModo, setCompraModo] = useState<SorteoCompraModo>("venta")
  const [compraMontoUmbral, setCompraMontoUmbral] = useState("")
  const [chanceFoto, setChanceFoto] = useState(false)

  useEffect(() => {
    if (!open) return
    setNombre(sorteo?.nombre ?? "")
    setDescripcion(sorteo?.descripcion ?? "")
    setFotoFile(null)
    setFotoUrlActual(sorteo?.fotoUrl)
    setDesde(sorteo?.desde ?? "")
    setHasta(sorteo?.hasta ?? "")
    setPremios(
      sorteo && sorteo.premios.length > 0
        ? sorteo.premios.map((p) => ({
            tipo: p.productoId ? "producto" : "otro",
            nombre: p.nombre, descripcion: p.descripcion ?? "", fotoFile: null,
            fotoUrlActual: p.fotoUrl, productoId: p.productoId, busqueda: "", resultados: [],
          }))
        : [{ ...PREMIO_VACIO }],
    )
    setChanceRegistro(sorteo?.mecanicas.registro ?? true)
    setChanceCompra(sorteo?.mecanicas.compra ?? true)
    setCompraModo(sorteo?.mecanicas.compraModo ?? "venta")
    setCompraMontoUmbral(sorteo?.mecanicas.compraMontoUmbral ? String(sorteo.mecanicas.compraMontoUmbral) : "")
    setChanceFoto(sorteo?.mecanicas.foto ?? false)
  }, [open, sorteo])

  const agregarPremio = () => setPremios((prev) => [...prev, { ...PREMIO_VACIO }])
  const quitarPremio = (i: number) => setPremios((prev) => prev.filter((_, idx) => idx !== i))
  const cambiarPremio = (i: number, cambios: Partial<PremioForm>) =>
    setPremios((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...cambios } : p)))

  const buscarProducto = (i: number, termino: string) => {
    cambiarPremio(i, { busqueda: termino })
    if (termino.trim().length < 2) {
      cambiarPremio(i, { resultados: [] })
      return
    }
    getProductos(tenantId, { busqueda: termino.trim(), porPagina: 6 }).then(({ productos }) =>
      cambiarPremio(i, { resultados: productos }),
    )
  }

  const elegirProducto = (i: number, producto: Producto) => {
    cambiarPremio(i, {
      productoId: producto.id, nombre: producto.nombre, busqueda: "", resultados: [],
    })
  }

  const invalido =
    !nombre.trim() || !desde || !hasta || hasta < desde ||
    premios.length === 0 || premios.some((p) => !p.nombre.trim() || (p.tipo === "producto" && !p.productoId)) ||
    (chanceCompra && compraModo === "monto" && (!compraMontoUmbral || Number(compraMontoUmbral) <= 0)) ||
    (!chanceRegistro && !chanceCompra && !chanceFoto)

  const guardar = async () => {
    if (invalido) return
    setGuardando(true)
    try {
      const fotoUrl = fotoFile ? await uploadFotoTenant(tenantId, "sorteos", fotoFile) : fotoUrlActual
      const premiosConFoto = await Promise.all(
        premios.map(async (p, i) => ({
          orden: i + 1,
          nombre: p.nombre.trim(),
          descripcion: p.descripcion.trim() || undefined,
          fotoUrl: p.fotoFile ? await uploadFotoTenant(tenantId, "sorteos/premios", p.fotoFile) : p.fotoUrlActual,
          productoId: p.tipo === "producto" ? p.productoId : undefined,
        })),
      )
      await onGuardar({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        fotoUrl,
        desde,
        hasta,
        premios: premiosConFoto,
        mecanicas: {
          registro: chanceRegistro,
          compra: chanceCompra,
          compraModo,
          compraMontoUmbral: compraModo === "monto" ? Number(compraMontoUmbral) : undefined,
          foto: chanceFoto,
        },
      })
      onOpenChange(false)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{sorteo ? "Editar sorteo" : "Nuevo sorteo"}</DialogTitle>
          <DialogDescription>Nombre, fechas, mecánicas de chance y premios del sorteo.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Sorteo Día del Animal" />
          </div>

          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Descripción (opcional)</Label>
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
          </div>

          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Foto (opcional)</Label>
            {fotoUrlActual && !fotoFile && (
              <div className="relative mb-2 inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fotoUrlActual} alt="" className="h-20 w-20 rounded-lg border object-cover" />
                <button
                  type="button"
                  aria-label="Quitar foto"
                  onClick={() => setFotoUrlActual(undefined)}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <Input type="file" accept="image/*" onChange={(e) => setFotoFile(e.target.files?.[0] ?? null)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
          </div>

          {/* ── Mecánicas de chance ── */}
          <div className="space-y-3 rounded-lg border p-3">
            <Label className="text-xs text-muted-foreground">¿Cómo se ganan las chances?</Label>

            <label className="flex items-center justify-between">
              <span className="text-sm">Ser cliente registrado</span>
              <Switch checked={chanceRegistro} onCheckedChange={setChanceRegistro} />
            </label>

            <label className="flex items-center justify-between">
              <span className="text-sm">Comprar</span>
              <Switch checked={chanceCompra} onCheckedChange={setChanceCompra} />
            </label>
            {chanceCompra && (
              <div className="ml-2 space-y-2 border-l-2 pl-3">
                <Select value={compraModo} onValueChange={(v) => setCompraModo(v as SorteoCompraModo)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="venta">1 chance por cada venta</SelectItem>
                    <SelectItem value="monto">1 chance cada $X gastados (acumulado)</SelectItem>
                  </SelectContent>
                </Select>
                {compraModo === "monto" && (
                  <Input
                    type="number" min={1} placeholder="Ej: 5000"
                    value={compraMontoUmbral}
                    onChange={(e) => setCompraMontoUmbral(e.target.value)}
                  />
                )}
              </div>
            )}

            <label className="flex items-center justify-between">
              <span className="text-sm">Subir foto de su mascota en la veterinaria</span>
              <Switch checked={chanceFoto} onCheckedChange={setChanceFoto} />
            </label>

            {!chanceRegistro && !chanceCompra && !chanceFoto && (
              <p className="text-xs text-destructive">Activá al menos una mecánica.</p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Premios</Label>
              <Button size="sm" variant="outline" onClick={agregarPremio}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Agregar premio
              </Button>
            </div>
            {premios.map((p, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Premio #{i + 1}</span>
                  {premios.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => quitarPremio(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                <Select
                  value={p.tipo}
                  onValueChange={(v) => cambiarPremio(i, {
                    tipo: v as "producto" | "otro", productoId: undefined, nombre: v === "producto" ? "" : p.nombre,
                  })}
                >
                  <SelectTrigger className="h-9"><SelectValue placeholder="¿Producto del negocio u otro premio?" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="producto">Producto del negocio</SelectItem>
                    <SelectItem value="otro">Otro premio</SelectItem>
                  </SelectContent>
                </Select>

                {p.tipo === "producto" ? (
                  <div className="relative">
                    <Input
                      placeholder="Buscar producto…"
                      value={p.productoId ? p.nombre : p.busqueda}
                      onChange={(e) => {
                        cambiarPremio(i, { productoId: undefined })
                        buscarProducto(i, e.target.value)
                      }}
                    />
                    {p.resultados.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-lg border bg-card shadow-lg">
                        {p.resultados.map((prod) => (
                          <button
                            key={prod.id}
                            type="button"
                            onClick={() => elegirProducto(i, prod)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                          >
                            <span>{prod.nombre}</span>
                            <span className="text-muted-foreground">{formatCurrency(prod.precio)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Input
                    placeholder="Nombre del premio"
                    value={p.nombre}
                    onChange={(e) => cambiarPremio(i, { nombre: e.target.value })}
                  />
                )}

                <Textarea
                  placeholder="Descripción (opcional)"
                  rows={2}
                  value={p.descripcion}
                  onChange={(e) => cambiarPremio(i, { descripcion: e.target.value })}
                />
                {p.fotoUrlActual && !p.fotoFile && (
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.fotoUrlActual} alt="" className="h-16 w-16 rounded-lg border object-cover" />
                    <button
                      type="button"
                      aria-label="Quitar foto"
                      onClick={() => cambiarPremio(i, { fotoUrlActual: undefined })}
                      className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <Input
                  type="file" accept="image/*"
                  onChange={(e) => cambiarPremio(i, { fotoFile: e.target.files?.[0] ?? null })}
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={guardando || invalido} onClick={guardar}>
            {guardando ? "Guardando…" : sorteo ? "Guardar cambios" : "Crear sorteo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
