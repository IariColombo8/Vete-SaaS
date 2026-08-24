"use client"

import { useState } from "react"
import { Ban, Download, Loader2, MessageCircle, Receipt } from "lucide-react"
import { toast } from "sonner"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { anularVenta } from "@/lib/supabase/ventas"
import { descargarRemitoPDF, linkWhatsApp, type EmisorRemito } from "@/lib/ventas/remito"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { MEDIOS_PAGO, type Venta } from "@/lib/supabase/types"
import { COLOR_MEDIO_PAGO } from "./colores-medio-pago"

interface Props {
  ventas: Venta[]
  emisor: EmisorRemito
  cargando: boolean
  /** Se llama después de anular, para que el contenedor recargue. */
  onCambio: () => void
}

export function HistorialVentas({ ventas, emisor, cargando, onCambio }: Props) {
  const [aAnular, setAAnular] = useState<Venta | null>(null)

  const descargar = async (venta: Venta) => {
    try {
      await descargarRemitoPDF(venta, emisor)
    } catch {
      toast.error("No se pudo generar el remito")
    }
  }

  if (cargando) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (ventas.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <Receipt className="mx-auto mb-3 h-8 w-8 opacity-40" />
        No hay ventas en este período
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">N°</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-32 text-right">Remito</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ventas.map((venta) => {
              const anulada = venta.estado === "anulada"

              return (
                <TableRow key={venta.id} className={anulada ? "opacity-55" : undefined}>
                  <TableCell>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums">
                      {String(venta.numero).padStart(5, "0")}
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
                  <TableCell className="text-sm">
                    {anulada ? (
                      <Badge variant="destructive">Anulada</Badge>
                    ) : (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          COLOR_MEDIO_PAGO[venta.medioPago],
                        )}
                      >
                        {MEDIOS_PAGO.find((m) => m.id === venta.medioPago)?.label}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(venta.total)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Descargar PDF"
                        onClick={() => void descargar(venta)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Enviar por WhatsApp"
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
                  </TableCell>
                </TableRow>
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
