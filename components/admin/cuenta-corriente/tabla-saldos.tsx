"use client"

import { Loader2, Wallet } from "lucide-react"
import { EstadoVacio } from "@/components/admin/estado-vacio"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import type { ClienteConSaldo } from "@/lib/supabase/cuentaCorriente"

interface Props {
  clientes: ClienteConSaldo[]
  cargando: boolean
  onVerDetalle: (cliente: ClienteConSaldo) => void
}

export function TablaSaldos({ clientes, cargando, onVerDetalle }: Props) {
  if (cargando) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (clientes.length === 0) {
    return (
      <EstadoVacio
        icono={<Wallet />}
        titulo="Nadie te debe nada todavía"
        descripcion="Cuando cobres una venta con el medio de pago Cta Cte, o registres un cobro pendiente desde el botón de arriba, el cliente aparece acá con su saldo."
      />
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          {/* En celular el teléfono va debajo del nombre: con 4 columnas el saldo quedaba fuera de pantalla. */}
          <TableHead className="hidden sm:table-cell">Teléfono</TableHead>
          <TableHead className="text-right">Saldo</TableHead>
          <TableHead className="text-right sm:w-32">
            <span className="sr-only sm:not-sr-only">Detalle</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {clientes.map((c) => (
          <TableRow key={c.clienteId}>
            <TableCell className="max-w-[9rem] whitespace-normal font-medium sm:max-w-none">
              {c.nombre}
              {c.telefono && <span className="block text-xs font-normal text-muted-foreground sm:hidden">{c.telefono}</span>}
            </TableCell>
            <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{c.telefono || "—"}</TableCell>
            <TableCell className="text-right">
              {c.saldo > 0 ? (
                <span className="font-semibold tabular-nums text-destructive">
                  {formatCurrency(c.saldo)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                  Al día
                </span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <Button variant="outline" size="sm" onClick={() => onVerDetalle(c)}>
                <span className="sm:hidden">Ver</span>
                <span className="hidden sm:inline">Ver / cobrar</span>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
