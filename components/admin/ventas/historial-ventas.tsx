"use client"

import { Fragment, useState } from "react"
import { Ban, ChevronDown, Download, MessageCircle, Receipt } from "lucide-react"
import { EstadoVacio } from "@/components/admin/estado-vacio"
import { toast } from "sonner"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { anularVenta } from "@/lib/supabase/ventas"
import { descargarRemitoPDF, linkWhatsApp, type EmisorRemito } from "@/lib/ventas/remito"
import { formatCantidad, formatCurrency, formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { MEDIOS_PAGO, type Venta, type VentaItem } from "@/lib/supabase/types"
import type { Comprobante, EstadoFacturacion } from "@/lib/supabase/comprobantes"
import { FacturarButton } from "@/components/admin/pos/facturar-button"
import { COLOR_MEDIO_PAGO } from "./colores-medio-pago"
import { EstadoBadge } from "@/components/admin/estado-badge"
import { Skeleton } from "@/components/ui/skeleton"

interface Props {
  ventas: Venta[]
  emisor: EmisorRemito
  cargando: boolean
  /** Se llama después de anular, para que el contenedor recargue. */
  onCambio: () => void
  /** Factura electrónica: estado de la integración y facturas ya emitidas por venta. */
  tenantId?: string
  facturacion?: EstadoFacturacion | null
  facturas?: Map<string, Comprobante>
  notasCredito?: Map<string, Comprobante>
}

export function HistorialVentas({ ventas, emisor, cargando, onCambio, tenantId, facturacion, facturas, notasCredito }: Props) {
  const [aAnular, setAAnular] = useState<Venta | null>(null)
  // Ventas desplegadas: tocar una muestra qué se vendió, sin bajar el remito.
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
  const alternar = (id: string) =>
    setAbiertas((prev) => {
      const sig = new Set(prev)
      if (sig.has(id)) sig.delete(id)
      else sig.add(id)
      return sig
    })

  const descargar = async (venta: Venta) => {
    try {
      await descargarRemitoPDF(venta, emisor)
    } catch {
      toast.error("No se pudo generar el remito")
    }
  }

  if (cargando) {
    return (
      <div className="space-y-2 py-2" aria-busy="true" aria-label="Cargando ventas">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (ventas.length === 0) {
    return (
      <EstadoVacio
        icono={<Receipt />}
        titulo="No hay ventas en este período"
        descripcion="Probá con un rango de fechas más amplio. Las ventas se cargan desde el Punto de venta y aparecen acá con su remito."
      />
    )
  }

  const pago = (venta: Venta, anulada: boolean) => (
    anulada ? (
      <EstadoBadge tono="peligro">Anulada</EstadoBadge>
    ) : venta.esPagoCtaCte ? (
      <EstadoBadge tono="info">Pago cta. cte.</EstadoBadge>
    ) : (
      <span className="flex items-center gap-1">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            COLOR_MEDIO_PAGO[venta.medioPago],
          )}
        >
          {MEDIOS_PAGO.find((m) => m.id === venta.medioPago)?.label}
          {venta.medioPago === "credito" && venta.cuotas ? ` x${venta.cuotas}` : ""}
        </span>
        {venta.medioPago === "mixto" && venta.pagos && venta.pagos.length > 0 && (
          <span
            className="text-xs text-muted-foreground"
            title={venta.pagos
              .map((p) => `${MEDIOS_PAGO.find((m) => m.id === p.medioPago)?.label}: ${formatCurrency(p.monto)}`)
              .join(" · ")}
          >
            ⓘ
          </span>
        )}
      </span>
    )
  )

  const acciones = (venta: Venta, anulada: boolean) => (
    <div className="flex justify-end gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title="Descargar remito"
        onClick={() => void descargar(venta)}
      >
        <Download className="h-3.5 w-3.5" />
      </Button>
      {tenantId && facturacion && (
        <FacturarButton
          tenantId={tenantId}
          venta={venta}
          emisor={emisor}
          facturacion={facturacion}
          comprobante={facturas?.get(venta.id) ?? null}
          notaCredito={notasCredito?.get(venta.id) ?? null}
          variante="fila"
        />
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title="Enviar remito por WhatsApp"
        onClick={() => {
          // La ventana se abre antes de generar el PDF: después
          // del await el navegador la bloquea como popup.
          window.open(
            linkWhatsApp(venta, emisor),
            "_blank",
            "noopener,noreferrer",
          )
          void descargar(venta)
        }}
      >
        <MessageCircle className="h-3.5 w-3.5" />
      </Button>
      {!anulada && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-red-600"
          title="Anular venta"
          onClick={() => setAAnular(venta)}
        >
          <Ban className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )

  return (
    <>
      {/* Celular: una tarjeta por venta con el total a la vista. En la tabla,
          el total y las acciones quedaban fuera de pantalla. */}
      <ul className="divide-y md:hidden">
        {ventas.map((venta) => {
          const anulada = venta.estado === "anulada"
          const abierta = abiertas.has(venta.id)
          return (
            <li key={venta.id} className={cn("space-y-2 px-4 py-3", anulada && "opacity-55")}>
              <button
                type="button"
                className="flex w-full items-start justify-between gap-3 text-left"
                onClick={() => alternar(venta.id)}
                aria-expanded={abierta}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {venta.clienteNombre || <span className="text-muted-foreground">Consumidor final</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono tabular-nums">N° {String(venta.numero).padStart(5, "0")}</span>
                    {" · "}
                    {formatDateTime(venta.createdAt)}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{resumenItems(venta)}</p>
                </div>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="text-base font-semibold tabular-nums">{formatCurrency(venta.total)}</span>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", abierta && "rotate-180")} />
                </span>
              </button>
              {abierta && <DetalleVenta venta={venta} />}
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm">{pago(venta, anulada)}</div>
                {acciones(venta, anulada)}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">N°</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-32 text-right">Remito</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ventas.map((venta) => {
              const anulada = venta.estado === "anulada"
              const abierta = abiertas.has(venta.id)

              return (
                <Fragment key={venta.id}>
                  <TableRow
                    className={cn("cursor-pointer", anulada && "opacity-55", abierta && "border-b-0 bg-muted/40")}
                    onClick={() => alternar(venta.id)}
                    aria-expanded={abierta}
                    title={abierta ? "Ocultar detalle" : "Ver detalle"}
                  >
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <ChevronDown
                        className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", abierta && "rotate-180")}
                      />
                      <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums">
                        {String(venta.numero).padStart(5, "0")}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(venta.createdAt)}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate text-sm">
                    {venta.clienteNombre || (
                      <span className="text-muted-foreground">Consumidor final</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate text-sm text-muted-foreground">
                    {resumenItems(venta)}
                  </TableCell>
                  <TableCell className="text-sm">{pago(venta, anulada)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(venta.total)}
                  </TableCell>
                  {/* Las acciones no despliegan la fila. */}
                  <TableCell onClick={(e) => e.stopPropagation()}>{acciones(venta, anulada)}</TableCell>
                  </TableRow>
                  {abierta && (
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={7} className="pt-0">
                        <DetalleVenta venta={venta} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <AnularDialog
        venta={aAnular}
        onCerrar={() => setAAnular(null)}
        onListo={onCambio}
      />
    </>
  )
}

const nombreMedio = (medio: string) => MEDIOS_PAGO.find((m) => m.id === medio)?.label ?? medio

/** "2 un" / "1,5 kg" */
function cantidadItem(item: VentaItem): string {
  return `${formatCantidad(item.cantidad)} ${item.unidad === "kg" ? "kg" : "un"}`
}

/** Qué se vendió, en una línea: "2× Royal Canin Adulto 15 kg · Corte de uñas". */
function resumenItems(venta: Venta): string {
  if (venta.esPagoCtaCte) return "Pago de cuenta corriente"
  const items = venta.items ?? []
  if (items.length === 0) return venta.observaciones || "—"
  return items
    .map((i) => {
      const nombre = [i.nombre, i.presentacion].filter(Boolean).join(" ")
      if (i.unidad === "kg") return `${nombre} (${formatCantidad(i.cantidad)} kg)`
      return i.cantidad === 1 ? nombre : `${formatCantidad(i.cantidad)}× ${nombre}`
    })
    .join(" · ")
}

/** Detalle desplegado de una venta: productos, ajustes y cómo se pagó. */
function DetalleVenta({ venta }: { venta: Venta }) {
  const items = venta.items ?? []
  return (
    <div className="space-y-3 rounded-lg border bg-background p-3 text-sm">
      {items.length > 0 ? (
        <table className="w-full">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="pb-1 text-left font-medium">Producto</th>
              <th className="pb-1 text-right font-medium">Cant.</th>
              <th className="pb-1 text-right font-medium">Precio</th>
              <th className="pb-1 text-right font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item, i) => (
              <tr key={item.id ?? i}>
                <td className="py-1.5 pr-2">
                  <span className="font-medium">{item.nombre}</span>
                  {(item.marca || item.presentacion) && (
                    <span className="block text-xs text-muted-foreground">
                      {[item.marca, item.presentacion].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{cantidadItem(item)}</td>
                <td className="whitespace-nowrap py-1.5 text-right tabular-nums">
                  {formatCurrency(item.precioUnitario)}
                  {item.unidad === "kg" && <span className="text-xs text-muted-foreground">/kg</span>}
                </td>
                <td className="whitespace-nowrap py-1.5 text-right font-medium tabular-nums">
                  {formatCurrency(item.subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-muted-foreground">
          {venta.esPagoCtaCte ? "Pago a cuenta corriente: no tiene productos." : "Esta venta no tiene productos cargados."}
        </p>
      )}

      <dl className="grid gap-x-6 gap-y-1 border-t pt-2 sm:grid-cols-2">
        {venta.descuento > 0 && <Dato etiqueta="Descuento" valor={`− ${formatCurrency(venta.descuento)}`} />}
        {venta.recargo > 0 && <Dato etiqueta="Recargo" valor={`+ ${formatCurrency(venta.recargo)}`} />}
        <Dato etiqueta="Total" valor={formatCurrency(venta.total)} fuerte />
        {venta.medioPago === "mixto" && venta.pagos && venta.pagos.length > 0 && (
          <Dato
            etiqueta="Pagó"
            valor={venta.pagos.map((p) => `${nombreMedio(p.medioPago)} ${formatCurrency(p.monto)}`).join(" + ")}
          />
        )}
        {venta.vendedorNombre && <Dato etiqueta="Vendió" valor={venta.vendedorNombre} />}
        {venta.observaciones && items.length > 0 && <Dato etiqueta="Nota" valor={venta.observaciones} />}
        {venta.estado === "anulada" && <Dato etiqueta="Anulada" valor={venta.anuladaMotivo || "Sin motivo"} />}
      </dl>
    </div>
  )
}

function Dato({ etiqueta, valor, fuerte = false }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className={cn("text-right tabular-nums", fuerte && "font-semibold")}>{valor}</dd>
    </div>
  )
}

/**
 * Anular devuelve el stock de todos los items. La venta no se borra: el
 * correlativo del remito no puede tener agujeros.
 */
function AnularDialog({
  venta,
  onCerrar,
  onListo,
}: {
  venta: Venta | null
  onCerrar: () => void
  onListo: () => void
}) {
  const [motivo, setMotivo] = useState("")
  const [anulando, setAnulando] = useState(false)

  const confirmar = async () => {
    if (!venta) return

    setAnulando(true)
    try {
      await anularVenta(venta.id, motivo)
      toast.success(`Venta #${venta.numero} anulada — el stock volvió al catálogo`)
      setMotivo("")
      onListo()
      onCerrar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo anular la venta")
    } finally {
      setAnulando(false)
    }
  }

  return (
    <AlertDialog open={venta !== null} onOpenChange={(v) => !v && onCerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            ¿Anular la venta #{venta ? String(venta.numero).padStart(5, "0") : ""}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            El stock de los productos vuelve al catálogo y la venta deja de contar en el
            arqueo de caja. La venta no se borra: queda marcada como anulada.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Input
          value={motivo}
          placeholder="Motivo (opcional)"
          onChange={(e) => setMotivo(e.target.value)}
        />

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              void confirmar()
            }}
            disabled={anulando}
            className="bg-red-600 hover:bg-red-700"
          >
            {anulando ? "Anulando…" : "Anular venta"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
