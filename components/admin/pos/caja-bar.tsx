"use client"

import { useState } from "react"
import { Lock, LockOpen, Wallet } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { abrirCaja, cerrarCaja, getResumenCaja } from "@/lib/supabase/ventas"
import { formatCurrency, formatDateTime } from "@/lib/format"
import type { Caja } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  caja: Caja | null
  /** Se llama después de abrir o cerrar, para que el POS recargue el estado. */
  onCambio: () => void
}

/**
 * Estado de la caja arriba del mostrador, con los botones de abrir y cerrar.
 *
 * Vender sin caja abierta está permitido: la venta se registra igual, solo que
 * sin imputarse a ningún turno. Bloquear el mostrador porque nadie abrió caja
 * sería peor que tener una venta sin arqueo.
 */
export function CajaBar({ tenantId, caja, onCambio }: Props) {
  const [dialogo, setDialogo] = useState<"abrir" | "cerrar" | null>(null)

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Wallet
            className={`h-4 w-4 shrink-0 ${caja ? "text-emerald-600" : "text-muted-foreground"}`}
          />
          {caja ? (
            <div className="min-w-0 text-sm">
              <span className="font-medium">Caja abierta</span>
              <span className="text-muted-foreground">
                {" "}
                · desde {formatDateTime(caja.aperturaAt)} · inicial{" "}
                {formatCurrency(caja.saldoInicial)}
              </span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              Sin caja abierta — las ventas se registran igual, pero no entran en ningún arqueo
            </span>
          )}
        </div>

        {caja ? (
          <Button variant="outline" size="sm" onClick={() => setDialogo("cerrar")}>
            <Lock className="mr-2 h-3.5 w-3.5" /> Cerrar caja
          </Button>
        ) : (
          <Button size="sm" onClick={() => setDialogo("abrir")} className="bg-emerald-600 hover:bg-emerald-700">
            <LockOpen className="mr-2 h-3.5 w-3.5" /> Abrir caja
          </Button>
        )}
      </div>

      {dialogo === "abrir" && (
        <AbrirCajaDialog
          tenantId={tenantId}
          onCerrar={() => setDialogo(null)}
          onListo={onCambio}
        />
      )}
      {dialogo === "cerrar" && caja && (
        <CerrarCajaDialog caja={caja} onCerrar={() => setDialogo(null)} onListo={onCambio} />
      )}
    </>
  )
}

function AbrirCajaDialog({
  tenantId,
  onCerrar,
  onListo,
}: {
  tenantId: string
  onCerrar: () => void
  onListo: () => void
}) {
  const [saldo, setSaldo] = useState("")
  const [guardando, setGuardando] = useState(false)

  const abrir = async () => {
    setGuardando(true)
    try {
      await abrirCaja(tenantId, Number(saldo) || 0)
      toast.success("Caja abierta")
      onListo()
      onCerrar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo abrir la caja")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Abrir caja</DialogTitle>
          <DialogDescription>
            ¿Con cuánto efectivo arranca el turno? Es contra este monto que se hace el
            arqueo al cerrar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="saldo-inicial">Saldo inicial</Label>
          <Input
            id="saldo-inicial"
            type="number"
            min={0}
            step={100}
            value={saldo}
            autoFocus
            placeholder="0"
            onChange={(e) => setSaldo(e.target.value)}
            className="h-11 text-lg"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={abrir} disabled={guardando} className="bg-emerald-600 hover:bg-emerald-700">
            Abrir caja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Arqueo. Se muestra el esperado recién después de escribir lo contado — a
 * propósito: si el número aparece antes, es muy fácil "contar" ese mismo número
 * y el arqueo deja de servir para detectar diferencias.
 */
function CerrarCajaDialog({
  caja,
  onCerrar,
  onListo,
}: {
  caja: Caja
  onCerrar: () => void
  onListo: () => void
}) {
  const [declarado, setDeclarado] = useState("")
  const [observaciones, setObservaciones] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [esperado, setEsperado] = useState<number | null>(null)

  const cerrar = async () => {
    const monto = Number(declarado)
    if (!Number.isFinite(monto) || monto < 0) {
      toast.error("Ingresá cuánto efectivo contaste")
      return
    }

    setGuardando(true)
    try {
      // El esperado lo recalcula la RPC sumando las ventas del turno, así que
      // este resultado es la fuente de verdad de la diferencia.
      const resultado = await cerrarCaja(caja.id, monto, observaciones)
      setEsperado(resultado.saldoEsperado)

      const dif = resultado.diferencia
      if (Math.abs(dif) < 0.01) {
        toast.success("Caja cerrada sin diferencias")
      } else {
        toast.warning(
          `Caja cerrada con una diferencia de ${formatCurrency(Math.abs(dif))} ` +
            (dif > 0 ? "a favor" : "en contra"),
        )
      }
      onListo()
      onCerrar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cerrar la caja")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cerrar caja</DialogTitle>
          <DialogDescription>
            Contá el efectivo del cajón y anotá cuánto hay. El sistema compara contra lo
            que debería haber.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="declarado">Efectivo contado</Label>
            <Input
              id="declarado"
              type="number"
              min={0}
              step={100}
              value={declarado}
              autoFocus
              placeholder="0"
              onChange={(e) => setDeclarado(e.target.value)}
              className="h-11 text-lg"
            />
          </div>

          {esperado !== null && (
            <p className="text-sm text-muted-foreground">
              Esperado: {formatCurrency(esperado)}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="obs">Observaciones (opcional)</Label>
            <Textarea
              id="obs"
              rows={2}
              value={observaciones}
              placeholder="Ej: se pagó un flete con plata de la caja"
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={cerrar} disabled={guardando}>
            Cerrar caja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
