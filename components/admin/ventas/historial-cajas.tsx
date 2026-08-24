"use client"

import { useState } from "react"
import { Download, Loader2, Wallet } from "lucide-react"
import { toast } from "sonner"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getVentasDeCaja } from "@/lib/supabase/ventas"
import { descargarCajaPDF, type EmisorCaja } from "@/lib/ventas/caja-pdf"
import { formatCurrency, formatDateTime } from "@/lib/format"
import type { Caja } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  cajas: Caja[]
  cargando: boolean
  emisor: EmisorCaja
}

/** Un peso de diferencia es redondeo; a partir de acá se marca en rojo. */
const TOLERANCIA_ARQUEO = 1

export function HistorialCajas({ tenantId, cajas, cargando, emisor }: Props) {
  const [descargando, setDescargando] = useState<string | null>(null)

  const descargar = async (caja: Caja) => {
    setDescargando(caja.id)
    try {
      const ventas = await getVentasDeCaja(tenantId, caja.id)
      await descargarCajaPDF(caja, ventas, emisor)
    } catch {
      toast.error("No se pudo generar el PDF de la caja")
    } finally {
      setDescargando(null)
    }
  }

  if (cargando) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (cajas.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <Wallet className="mx-auto mb-3 h-8 w-8 opacity-40" />
        Todavía no se abrió ninguna caja
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Apertura</TableHead>
            <TableHead>Cierre</TableHead>
            <TableHead>Responsable</TableHead>
            <TableHead className="text-right">Inicial</TableHead>
            <TableHead className="text-right">Ventas</TableHead>
            <TableHead className="text-right">Esperado</TableHead>
            <TableHead className="text-right">Contado</TableHead>
            <TableHead className="text-right">Diferencia</TableHead>
            <TableHead className="w-16 text-right">PDF</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cajas.map((caja) => {
            const abierta = caja.estado === "abierta"
            const dif = caja.diferencia ?? 0
            const descuadrada = !abierta && Math.abs(dif) >= TOLERANCIA_ARQUEO

            return (
              <TableRow key={caja.id}>
                <TableCell className="whitespace-nowrap text-sm">
                  {formatDateTime(caja.aperturaAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {abierta ? (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600">Abierta</Badge>
                  ) : (
                    formatDateTime(caja.cierreAt)
                  )}
                </TableCell>
                <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">
                  {caja.cerradaPorNombre || caja.abiertaPorNombre || "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(caja.saldoInicial)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {abierta ? "—" : formatCurrency(caja.totalVentas)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {caja.saldoEsperado != null ? formatCurrency(caja.saldoEsperado) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {caja.saldoDeclarado != null ? formatCurrency(caja.saldoDeclarado) : "—"}
                </TableCell>
                <TableCell
                  className={`text-right font-medium tabular-nums ${
                    descuadrada ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                  }`}
                >
                  {abierta
                    ? "—"
                    : `${dif > 0 ? "+" : ""}${formatCurrency(dif)}`}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Descargar PDF de la caja"
                    disabled={descargando === caja.id}
                    onClick={() => void descargar(caja)}
                  >
                    {descargando === caja.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
