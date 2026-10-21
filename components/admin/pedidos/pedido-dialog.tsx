"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle, Bike, Loader2, Mail, MessageCircle, Pencil, Phone, Store, Wallet, XCircle,
} from "lucide-react"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getProductosPublicadosPorIds } from "@/lib/supabase/productos"
import {
  cambiarEstadoPedido, cancelarPedido, editarPedido, registrarVentaPedido,
} from "@/lib/supabase/pedidos"
import { accionSiguiente, esEditable, esPagoOnline, siguienteEstado } from "@/lib/pedidos/reglas"
import { etiquetaMedioWeb, numeroPedido, ESTADOS_PEDIDO, type EntregaPedido, type Pedido } from "@/lib/pedidos/tipos"
import { montoDescuento, SIN_DESCUENTO, type Descuento } from "@/lib/ventas/carrito"
import { telefonoWhatsApp } from "@/lib/telefono"
import { formatCantidad, formatCurrency, formatDateTime } from "@/lib/format"
import type { EmisorRemito } from "@/lib/ventas/remito"
import type { EstadoFacturacion } from "@/lib/supabase/comprobantes"
import type { MedioPago } from "@/lib/supabase/types"
import { EditorItems, recalcular, type LineaEdicion } from "./editor-items"
import { DocumentosPedido } from "./documentos-pedido"

interface Props {
  tenantId: string
  pedido: Pedido | null
  emisor: EmisorRemito
  facturacion: EstadoFacturacion | null
  onCerrar: () => void
  /** Algo cambió en la base: el padre recarga la lista. */
  onCambio: () => Promise<void> | void
}

const MEDIOS_COBRO: { id: MedioPago; label: string }[] = [
  { id: "efectivo", label: "Efectivo" },
  { id: "transferencia", label: "Transferencia" },
  { id: "debito", label: "Débito" },
  { id: "credito", label: "Crédito" },
]

/** Medio sugerido para cobrar según lo que eligió el cliente en la web. */
function medioSugerido(p: Pedido): MedioPago {
  if (p.medioPago === "efectivo") return "efectivo"
  if (p.medioPago === "tarjeta") return "debito"
  return "transferencia"
}

export function PedidoDialog({ tenantId, pedido, emisor, facturacion, onCerrar, onCambio }: Props) {
  const [editando, setEditando] = useState(false)
  const [lineas, setLineas] = useState<LineaEdicion[]>([])
  const [descuento, setDescuento] = useState<Descuento>(SIN_DESCUENTO)
  const [entrega, setEntrega] = useState<EntregaPedido>("retiro")
  const [direccion, setDireccion] = useState("")
  const [nota, setNota] = useState("")
  const [telefono, setTelefono] = useState("")

  const [cobrando, setCobrando] = useState(false)
  const [medioCobro, setMedioCobro] = useState<MedioPago>("efectivo")
  const [cuotas, setCuotas] = useState(1)
  const [completarAlCobrar, setCompletarAlCobrar] = useState(false)
  const [recienCobrado, setRecienCobrado] = useState(false)

  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [ocupado, setOcupado] = useState(false)

  // Al abrir otro pedido (o al recargarse este) se vuelve al modo lectura.
  useEffect(() => {
    setEditando(false)
    setCobrando(false)
    setCancelando(false)
    setMotivo("")
    setRecienCobrado(false)
    if (pedido) setMedioCobro(medioSugerido(pedido))
  }, [pedido?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const editable = pedido ? esEditable(pedido) : false
  const siguiente = pedido ? siguienteEstado(pedido.estado, pedido.entrega) : null
  const textoSiguiente = pedido ? accionSiguiente(pedido.estado, pedido.entrega) : null
  const cobrado = Boolean(pedido?.ventaId)

  const empezarEdicion = async () => {
    if (!pedido) return
    const base: LineaEdicion[] = pedido.items
      .filter((i) => i.productoId)
      .map((i) => ({
        productoId: i.productoId as string,
        nombre: [i.marca, i.nombre].filter(Boolean).join(" ") + (i.presentacion ? ` (${i.presentacion})` : ""),
        unidad: i.unidad,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        subtotal: i.subtotal,
      }))
    // Con el catálogo, cambiar la cantidad recalcula ofertas y combos.
    const productos = await getProductosPublicadosPorIds(tenantId, base.map((l) => l.productoId)).catch(() => [])
    const porId = new Map(productos.map((p) => [p.id, p]))
    setLineas(base.map((l) => ({ ...l, producto: porId.get(l.productoId) })))
    setDescuento({ tipo: "monto", valor: pedido.descuento })
    setEntrega(pedido.entrega)
    setDireccion(pedido.direccion)
    setNota(pedido.nota)
    setTelefono(pedido.clienteTelefono)
    setEditando(true)
  }

  const guardar = async () => {
    if (!pedido) return
    if (lineas.length === 0) return toast.error("El pedido tiene que tener al menos un producto")
    if (entrega === "envio" && !direccion.trim()) return toast.error("Falta la dirección de entrega")
    setOcupado(true)
    try {
      const subtotal = lineas.reduce((acc, l) => acc + l.subtotal, 0)
      await editarPedido(
        pedido.id,
        lineas.map((l) => recalcular(l, l.cantidad)).map((l) => ({
          producto_id: l.productoId,
          cantidad: l.cantidad,
          precio_unitario: l.precioUnitario,
          subtotal: l.subtotal,
        })),
        montoDescuento(subtotal, descuento),
        { entrega, direccion: direccion.trim(), nota: nota.trim(), clienteTelefono: telefono.trim() },
      )
      toast.success("Pedido actualizado")
      setEditando(false)
      await onCambio()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setOcupado(false)
    }
  }

  const avanzar = async () => {
    if (!pedido || !siguiente) return
    if (siguiente === "completado" && !cobrado) {
      // Para cerrar el pedido primero tiene que estar cobrado.
      setCompletarAlCobrar(true)
      setCobrando(true)
      return
    }
    setOcupado(true)
    try {
      await cambiarEstadoPedido(pedido.id, siguiente)
      toast.success(`${numeroPedido(pedido.numero)}: ${ESTADOS_PEDIDO.find((e) => e.id === siguiente)?.label}`)
      await onCambio()
      if (siguiente === "completado") onCerrar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar el estado")
    } finally {
      setOcupado(false)
    }
  }

  const cobrar = async () => {
    if (!pedido) return
    setOcupado(true)
    try {
      const r = await registrarVentaPedido(pedido.id, medioCobro, medioCobro === "credito" ? cuotas : undefined)
      toast.success(`Cobrado · Venta #${r.numero}`)
      if (completarAlCobrar) await cambiarEstadoPedido(pedido.id, "completado")
      setCobrando(false)
      setCompletarAlCobrar(false)
      setRecienCobrado(true)
      await onCambio()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar el cobro")
    } finally {
      setOcupado(false)
    }
  }

  const cancelar = async () => {
    if (!pedido) return
    setOcupado(true)
    try {
      await cancelarPedido(pedido.id, motivo.trim())
      toast.success(`${numeroPedido(pedido.numero)} cancelado`)
      await onCambio()
      onCerrar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cancelar")
    } finally {
      setOcupado(false)
    }
  }

  const whatsapp = useMemo(() => (pedido ? telefonoWhatsApp(pedido.clienteTelefono) : null), [pedido])

  if (!pedido) return null

  const estadoLabel = ESTADOS_PEDIDO.find((e) => e.id === pedido.estado)?.label

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {numeroPedido(pedido.numero)}
            <Badge variant="secondary">{estadoLabel}</Badge>
            <Badge variant="outline" className="gap-1">
              {pedido.entrega === "envio" ? <Bike className="h-3 w-3" /> : <Store className="h-3 w-3" />}
              {pedido.entrega === "envio" ? "Envío" : "Retiro"}
            </Badge>
          </DialogTitle>
          <DialogDescription>Tienda web · {formatDateTime(pedido.createdAt)}</DialogDescription>
        </DialogHeader>

        {/* ── Cliente ── */}
        <section className="space-y-1.5 rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-base font-semibold">{pedido.clienteNombre}</p>
            <div className="flex gap-1">
              {whatsapp && (
                <Button asChild size="sm" variant="outline" className="h-8">
                  <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp
                  </a>
                </Button>
              )}
              {pedido.clienteTelefono && (
                <Button asChild size="sm" variant="outline" className="h-8">
                  <a href={`tel:${pedido.clienteTelefono}`}><Phone className="h-3.5 w-3.5" /></a>
                </Button>
              )}
              {pedido.clienteEmail && (
                <Button asChild size="sm" variant="outline" className="h-8">
                  <a href={`mailto:${pedido.clienteEmail}`}><Mail className="h-3.5 w-3.5" /></a>
                </Button>
              )}
            </div>
          </div>
          <p className="text-muted-foreground">
            {[pedido.clienteTelefono, pedido.clienteEmail, pedido.clienteDni && `DNI ${pedido.clienteDni}`].filter(Boolean).join(" · ")}
          </p>
          {!editando && (
            <>
              <p>
                {pedido.entrega === "envio"
                  ? <>Enviar a <strong>{pedido.direccion}</strong> <span className="text-muted-foreground">(el envío lo cobra el cadete)</span></>
                  : "Retira en el local"}
              </p>
              {pedido.nota && <p className="rounded bg-amber-50 px-2 py-1 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Nota: {pedido.nota}</p>}
            </>
          )}
        </section>

        {/* ── Productos ── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Productos</h3>
            {editable && !editando && (
              <Button size="sm" variant="outline" onClick={empezarEdicion}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar pedido
              </Button>
            )}
          </div>

          {editando ? (
            <div className="space-y-4">
              <EditorItems
                tenantId={tenantId} lineas={lineas} onLineas={setLineas}
                descuento={descuento} onDescuento={setDescuento}
              />
              <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                <div className="sm:col-span-2 flex gap-2">
                  {(["retiro", "envio"] as const).map((e) => (
                    <Button key={e} type="button" size="sm" variant={entrega === e ? "default" : "outline"} onClick={() => setEntrega(e)}>
                      {e === "envio" ? <Bike className="mr-1.5 h-3.5 w-3.5" /> : <Store className="mr-1.5 h-3.5 w-3.5" />}
                      {e === "envio" ? "Envío a domicilio" : "Retiro en local"}
                    </Button>
                  ))}
                </div>
                {entrega === "envio" && (
                  <div className="sm:col-span-2">
                    <Label className="mb-1 block text-xs">Dirección</Label>
                    <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
                  </div>
                )}
                <div>
                  <Label className="mb-1 block text-xs">Teléfono</Label>
                  <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Nota</Label>
                  <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={1} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditando(false)} disabled={ocupado}>Descartar</Button>
                <Button onClick={guardar} disabled={ocupado}>
                  {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar cambios
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border text-sm">
              <ul className="divide-y">
                {pedido.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3 px-3 py-2">
                    <span className="min-w-0">
                      {[i.marca, i.nombre].filter(Boolean).join(" ")}
                      {i.presentacion && <span className="text-muted-foreground"> ({i.presentacion})</span>}
                      <span className="text-muted-foreground"> × {formatCantidad(i.cantidad)}{i.unidad === "kg" ? " kg" : ""}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatCurrency(i.subtotal)}</span>
                  </li>
                ))}
              </ul>
              <div className="space-y-0.5 border-t px-3 py-2 text-right">
                {pedido.descuento > 0 && (
                  <p className="text-muted-foreground">Descuento − {formatCurrency(pedido.descuento)}</p>
                )}
                <p className="text-base font-bold">Total {formatCurrency(pedido.total)}</p>
              </div>
            </div>
          )}
          {!editable && !cobrado && pedido.estado === "reparto" && (
            <p className="text-xs text-muted-foreground">Un pedido en reparto ya no se edita.</p>
          )}
        </section>

        {/* ── Pago ── */}
        <section className="space-y-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              Eligió pagar con <strong>{etiquetaMedioWeb(pedido.medioPago)}</strong>
              {esPagoOnline(pedido.medioPago) && " (Mercado Pago)"}
            </span>
            <Badge
              className={
                cobrado || pedido.pagoEstado === "aprobado"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : pedido.pagoEstado === "rechazado"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
              }
            >
              {cobrado || pedido.pagoEstado === "aprobado" ? "Cobrado" : pedido.pagoEstado === "rechazado" ? "Pago rechazado" : "Sin cobrar"}
            </Badge>
          </div>

          {pedido.ventaError && (
            <p className="flex items-start gap-2 rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Mercado Pago aprobó el pago pero la venta no se pudo registrar: {pedido.ventaError}. Corregí el stock y registrá el cobro.
            </p>
          )}
          {pedido.facturaError && (
            <p className="flex items-start gap-2 rounded bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              La factura automática falló: {pedido.facturaError}. Podés reintentarla abajo.
            </p>
          )}

          {pedido.ventaId ? (
            <DocumentosPedido
              key={pedido.ventaId}
              tenantId={tenantId} ventaId={pedido.ventaId} emisor={emisor} facturacion={facturacion}
              recienCobrado={recienCobrado}
            />
          ) : pedido.estado !== "cancelado" && (
            cobrando ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">¿Cómo pagó?</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {MEDIOS_COBRO.map((m) => (
                    <Button
                      key={m.id} type="button" size="sm"
                      variant={medioCobro === m.id ? "default" : "outline"}
                      onClick={() => setMedioCobro(m.id)}
                    >
                      {m.label}
                    </Button>
                  ))}
                </div>
                {medioCobro === "credito" && (
                  <div className="flex items-center gap-2 text-sm">
                    <Label>Cuotas</Label>
                    <Input type="number" min={1} max={24} value={cuotas} onChange={(e) => setCuotas(Math.max(1, Number(e.target.value) || 1))} className="h-8 w-20" />
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Se registra la venta por {formatCurrency(pedido.total)} (descuenta stock y entra a la caja abierta).
                  {medioCobro !== "transferencia" && facturacion?.listo && " La factura sale sola."}
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => { setCobrando(false); setCompletarAlCobrar(false) }} disabled={ocupado}>Volver</Button>
                  <Button onClick={cobrar} disabled={ocupado}>
                    {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {completarAlCobrar ? "Cobrar y completar" : "Registrar cobro"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setCobrando(true)} disabled={editando}>
                <Wallet className="mr-2 h-4 w-4" /> Registrar cobro
              </Button>
            )
          )}
        </section>

        {/* ── Cancelar ── */}
        {cancelando && (
          <section className="space-y-2 rounded-lg border border-red-200 p-3 dark:border-red-900">
            {(pedido.pagoEstado === "aprobado" && esPagoOnline(pedido.medioPago)) && (
              <p className="text-xs text-red-700 dark:text-red-300">
                Este pedido se pagó por Mercado Pago: la devolución del dinero se hace desde tu cuenta de Mercado Pago.
              </p>
            )}
            {cobrado && (
              <p className="text-xs text-muted-foreground">
                Se anula la venta y vuelve el stock. Si tenía factura, hacé la nota de crédito desde Ventas.
              </p>
            )}
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCancelando(false)} disabled={ocupado}>Volver</Button>
              <Button variant="destructive" onClick={cancelar} disabled={ocupado}>Cancelar pedido</Button>
            </div>
          </section>
        )}

        {pedido.estado !== "completado" && pedido.estado !== "cancelado" && !editando && !cobrando && !cancelando && (
          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setCancelando(true)}>
              <XCircle className="mr-1.5 h-4 w-4" /> Cancelar pedido
            </Button>
            {textoSiguiente && (
              <Button onClick={avanzar} disabled={ocupado}>
                {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {textoSiguiente}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
