"use client"

import { useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import { CheckCircle2, CreditCard, Loader2, QrCode, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatCurrency } from "@/lib/format"
import {
  cancelarCobroPoint,
  consultarCobroPoint,
  crearCobroPoint,
  crearCobroQr,
  type ResultadoCobroPoint,
  type TipoTarjetaPoint,
} from "./use-mp-point"

/** Por dónde paga el cliente: tarjeta en la terminal o QR en la pantalla. */
export type CanalCobro = "point" | "qr"

interface Props {
  open: boolean
  canal?: CanalCobro
  tenantId: string
  monto: number
  descripcion?: string
  /** Solo Point. */
  tipoTarjeta?: TipoTarjetaPoint
  /**
   * Solo QR: con terminal configurada el QR sale en la pantalla del Point
   * (orden Point con `default_type: "qr"`); sin terminal, en esta pantalla.
   */
  qrEnTerminal?: boolean
  cuotas?: number
  /** El pago quedó aprobado: el padre registra la venta. */
  onAprobado: (cobroId: string, paymentId: string | null) => Promise<void>
  onCerrar: () => void
}

type Fase =
  | { tipo: "enviando" }
  | { tipo: "esperando"; cobroId: string; estado: string }
  | { tipo: "registrando"; cobroId: string }
  | { tipo: "listo" }
  | { tipo: "fallo"; motivo: string; cobroId?: string }

const INTERVALO_POLL_MS = 2000

const TEXTO_ESTADO: Record<CanalCobro, Record<string, string>> = {
  point: {
    created: "Enviando el cobro a la terminal…",
    at_terminal: "Esperando la tarjeta en la terminal…",
    processing: "Procesando el pago…",
    cancelacion_pedida: "Cancelando en la terminal…",
  },
  qr: {
    created: "Esperando que el cliente escanee y pague…",
    at_terminal: "Esperando que el cliente escanee el QR de la terminal…",
    processing: "Procesando el pago…",
    cancelacion_pedida: "Cancelando el QR…",
  },
}

const TEXTO_RESULTADO: Record<CanalCobro, Record<Exclude<ResultadoCobroPoint, "en_curso" | "aprobada">, string>> = {
  point: {
    rechazada: "La tarjeta fue rechazada. Probá con otra o cobrá de otra forma.",
    cancelada: "El cobro se canceló en la terminal.",
    expirada: "La terminal no recibió la tarjeta a tiempo y el cobro venció.",
  },
  qr: {
    rechazada: "El pago fue rechazado. Que pruebe con otro medio en su app o cobrá de otra forma.",
    cancelada: "El QR se canceló.",
    expirada: "El QR venció sin que se pagara. Generá uno nuevo.",
  },
}

/**
 * Cobro con Mercado Pago: Point (tarjeta en la terminal) o QR (el cliente lo
 * escanea en la pantalla). Crea la orden al abrirse, consulta el estado cada
 * 2 segundos y, cuando MP aprueba, le avisa al mostrador para que registre la
 * venta. Hasta que no está aprobado no se toca el stock.
 */
export function CobroPointDialog({
  open,
  canal = "point",
  tenantId,
  monto,
  descripcion,
  tipoTarjeta,
  cuotas,
  qrEnTerminal = false,
  onAprobado,
  onCerrar,
}: Props) {
  const [fase, setFase] = useState<Fase>({ tipo: "enviando" })
  const [qrImagen, setQrImagen] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const vigente = useRef(false)

  useEffect(() => {
    if (!open) return
    vigente.current = true
    setFase({ tipo: "enviando" })
    setCancelando(false)
    setQrImagen(null)

    let timer: ReturnType<typeof setTimeout> | null = null

    const poll = async (cobroId: string) => {
      if (!vigente.current) return
      try {
        const r = await consultarCobroPoint(tenantId, cobroId)
        if (!vigente.current) return
        if (r.resultado === "aprobada") {
          setFase({ tipo: "registrando", cobroId })
          try {
            await onAprobado(cobroId, r.paymentId)
            if (vigente.current) setFase({ tipo: "listo" })
          } catch (e) {
            if (vigente.current) {
              setFase({
                tipo: "fallo",
                cobroId,
                motivo: `El pago se aprobó en Mercado Pago pero la venta no se pudo registrar: ${
                  e instanceof Error ? e.message : "error desconocido"
                }. Anotá el pago de Mercado Pago${r.paymentId ? ` #${r.paymentId}` : ""} y cargá la venta a mano.`,
              })
            }
          }
          return
        }
        if (r.resultado !== "en_curso") {
          setFase({ tipo: "fallo", cobroId, motivo: TEXTO_RESULTADO[canal][r.resultado] })
          return
        }
        setFase({ tipo: "esperando", cobroId, estado: r.estado })
      } catch (e) {
        // Un error de red en un poll no cancela el cobro: se reintenta.
        console.error("Error consultando el cobro Point:", e)
      }
      timer = setTimeout(() => poll(cobroId), INTERVALO_POLL_MS)
    }

    const crear =
      canal === "qr" && qrEnTerminal
        ? crearCobroPoint(tenantId, { monto, descripcion, tipoTarjeta: "qr" })
        : canal === "qr"
        ? crearCobroQr(tenantId, { monto, descripcion }).then(async ({ cobroId, qrData }) => {
            const imagen = await QRCode.toDataURL(qrData, { width: 320, margin: 2 })
            if (vigente.current) setQrImagen(imagen)
            return { cobroId }
          })
        : crearCobroPoint(tenantId, { monto, descripcion, tipoTarjeta, cuotas })

    crear
      .then(({ cobroId }) => {
        if (!vigente.current) return
        setFase({ tipo: "esperando", cobroId, estado: "created" })
        timer = setTimeout(() => poll(cobroId), INTERVALO_POLL_MS)
      })
      .catch((e) => {
        if (vigente.current) {
          setFase({ tipo: "fallo", motivo: e instanceof Error ? e.message : "No se pudo enviar el cobro" })
        }
      })

    return () => {
      vigente.current = false
      if (timer) clearTimeout(timer)
    }
    // Se crea una orden por apertura: los demás valores se leen al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tenantId])

  async function cancelar() {
    if (fase.tipo !== "esperando") return
    setCancelando(true)
    try {
      await cancelarCobroPoint(tenantId, fase.cobroId)
      setFase({ tipo: "esperando", cobroId: fase.cobroId, estado: "cancelacion_pedida" })
    } catch (e) {
      console.error("No se pudo cancelar el cobro de Mercado Pago:", e)
    } finally {
      setCancelando(false)
    }
  }

  const puedeCerrar = fase.tipo === "fallo" || fase.tipo === "listo"

  return (
    <Dialog open={open} onOpenChange={(v) => !v && puedeCerrar && onCerrar()}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => !puedeCerrar && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {canal === "qr" ? <QrCode className="h-5 w-5 text-sky-600" /> : <CreditCard className="h-5 w-5 text-sky-600" />}
            {canal === "qr" ? "Cobro con QR de Mercado Pago" : "Cobro con Mercado Pago Point"}
          </DialogTitle>
          <DialogDescription>
            {canal === "qr"
              ? "Se paga con Mercado Pago o con la app de cualquier banco"
              : tipoTarjeta === "credit_card"
                ? `Crédito${cuotas && cuotas > 1 ? ` en ${cuotas} cuotas` : ""}`
                : "Débito"}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 text-center">
          <p className="text-4xl font-bold tabular-nums">{formatCurrency(monto)}</p>

          <div className="mt-6 flex flex-col items-center gap-3 text-sm text-muted-foreground">
            {fase.tipo === "enviando" && (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                <p>{canal === "qr" && !qrEnTerminal ? "Generando el QR…" : "Enviando el cobro a la terminal…"}</p>
              </>
            )}
            {fase.tipo === "esperando" && canal === "qr" && (
              <>
                {qrEnTerminal ? (
                  <QrCode className="h-10 w-10 text-sky-600" />
                ) : qrImagen ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrImagen} alt="QR para pagar con Mercado Pago" className="h-64 w-64 rounded-md border bg-white p-1" />
                ) : (
                  <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                )}
                <p className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                  {TEXTO_ESTADO.qr[fase.estado] ?? "Esperando el pago…"}
                </p>
                <p className="text-xs">
                  {qrEnTerminal
                    ? "El cliente escanea el QR que aparece en la terminal. Vence en 10 minutos."
                    : "Mostrale la pantalla al cliente. El QR vence en 10 minutos."}
                </p>
                {!qrEnTerminal && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Para que el QR salga en el posnet, elegí la terminal en Configuración → Integraciones → Mercado Pago Point.
                  </p>
                )}
              </>
            )}
            {fase.tipo === "esperando" && canal === "point" && (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                <p>{TEXTO_ESTADO.point[fase.estado] ?? "Esperando a la terminal…"}</p>
                <p className="text-xs">El cliente pasa o acerca la tarjeta en la terminal.</p>
              </>
            )}
            {fase.tipo === "registrando" && (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                <p className="font-medium text-emerald-700 dark:text-emerald-400">Pago aprobado. Registrando la venta…</p>
              </>
            )}
            {fase.tipo === "listo" && (
              <>
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                <p className="font-medium text-emerald-700 dark:text-emerald-400">Venta registrada</p>
              </>
            )}
            {fase.tipo === "fallo" && (
              <>
                <XCircle className="h-10 w-10 text-red-600" />
                <p className="text-red-700 dark:text-red-400">{fase.motivo}</p>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          {fase.tipo === "esperando" && (
            <Button variant="outline" onClick={cancelar} disabled={cancelando || fase.estado === "cancelacion_pedida"}>
              {cancelando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancelar cobro
            </Button>
          )}
          {puedeCerrar && <Button onClick={onCerrar}>Cerrar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
