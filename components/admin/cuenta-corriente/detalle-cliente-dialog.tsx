"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getMovimientosCliente, registrarPagoCtaCte, type ClienteConSaldo, type MovimientoCtaCte,
} from "@/lib/supabase/cuentaCorriente"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { MEDIOS_PAGO_SIMPLES, type MedioPago } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  cliente: ClienteConSaldo | null
  onCerrar: () => void
  onCambio: () => void
}

/** Historial de movimientos de un cliente y el formulario para registrar un pago. */
export function DetalleClienteDialog({ tenantId, cliente, onCerrar, onCambio }: Props) {
  const [movimientos, setMovimientos] = useState<MovimientoCtaCte[]>([])
  const [cargando, setCargando] = useState(true)
  const [monto, setMonto] = useState("")
  const [medioPago, setMedioPago] = useState<MedioPago>("efectivo")
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!cliente) return
    setCargando(true)
    getMovimientosCliente(tenantId, cliente.clienteId)
      .then(setMovimientos)
      .finally(() => setCargando(false))
  }, [tenantId, cliente])

  const registrarPago = async () => {
    if (!cliente) return
    const montoNum = Number(monto)
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      toast.error("El monto tiene que ser mayor a cero")
      return
    }

    setGuardando(true)
    try {
      await registrarPagoCtaCte(tenantId, cliente.clienteId, montoNum, medioPago)
      toast.success(`Pago de ${formatCurrency(montoNum)} registrado`)
      setMonto("")
      onCambio()
      const actualizados = await getMovimientosCliente(tenantId, cliente.clienteId)
      setMovimientos(actualizados)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar el pago")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={cliente !== null} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{cliente?.nombre}</DialogTitle>
          <DialogDescription>
            Saldo pendiente: {cliente ? formatCurrency(cliente.saldo) : "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
          <Label className="text-xs text-muted-foreground">Registrar pago</Label>
          <div className="flex gap-1.5">
            <Input
              type="number"
              min={0}
              placeholder="Monto"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
            <select
              value={medioPago}
              onChange={(e) => setMedioPago(e.target.value as MedioPago)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              {MEDIOS_PAGO_SIMPLES.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <Button onClick={() => void registrarPago()} disabled={guardando}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cobrar"}
            </Button>
          </div>
        </div>

        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {cargando ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            movimientos.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {formatDateTime(m.createdAt)} · {m.tipo === "venta" ? "Venta" : "Pago"}
                  {m.ventaNumero ? ` #${String(m.ventaNumero).padStart(5, "0")}` : ""}
                </span>
                <span className={m.tipo === "venta" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}>
                  {m.tipo === "venta" ? "+" : "-"} {formatCurrency(m.monto)}
                </span>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
