"use client"

import { Loader2, Wallet } from "lucide-react"
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
      <div className="py-12 text-center text-sm text-muted-foreground">
        <Wallet className="mx-auto mb-3 h-8 w-8 opacity-40" />
        Todavía no hay movimientos de cuenta corriente
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          <TableHead>Teléfono</TableHead>
          <TableHead className="text-right">Saldo</TableHead>
          <TableHead className="w-32 text-right">Detalle</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {clientes.map((c) => (
          <TableRow key={c.clienteId}>
            <TableCell className="font-medium">{c.nombre}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{c.telefono || "—"}</TableCell>
            <TableCell className="text-right">
              {c.saldo > 0 ? (
                <span className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">
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
                Ver / cobrar
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
