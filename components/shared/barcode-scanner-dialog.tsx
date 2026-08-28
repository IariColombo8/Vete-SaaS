"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDetected: (codigo: string) => void
}

// Franja central angosta: ahí es donde el usuario alinea el código, y
// decodificar solo esa zona evita enganchar otro código de fondo (ver
// "correcciones-codigo-de-barra.md").
const CROP_WIDTH_PCT = 0.85
const CROP_HEIGHT_PCT = 0.22

/**
 * Escaneo de código de barras por cámara. Recorta a mano el frame de video
 * a una franja central (getUserMedia + canvas + requestAnimationFrame) en
 * vez de dejar que ZXing decodifique el video entero: más rápido y no
 * confunde el código de un producto con el de al lado.
 */
export function BarcodeScannerDialog({ open, onOpenChange, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  // Sin código de barras (producto sin impresión legible por ZXing): se
  // pausa la decodificación continua y se lee el número a mano, una sola
  // captura por vez, con OCR acotado a dígitos.
  const [modo, setModo] = useState<"barras" | "numero">("barras")
  const [leyendoNumero, setLeyendoNumero] = useState(false)
  const modoRef = useRef(modo)
  modoRef.current = modo

  useEffect(() => {
    if (!open) setModo("barras")
  }, [open])

  useEffect(() => {
    if (!open) return

    let cancelado = false
    let stream: MediaStream | null = null
    let frameId: number | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let reader: any = null

    const iniciar = async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser")
        const { DecodeHintType, BarcodeFormat } = await import("@zxing/library")

        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF,
        ])
        hints.set(DecodeHintType.TRY_HARDER, true)
        reader = new BrowserMultiFormatReader(hints)

        const dispositivos = await BrowserMultiFormatReader.listVideoInputDevices()
        const trasera = dispositivos.find((d) =>
          /back|rear|trasera|environment/i.test(d.label),
        )

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: trasera ? { exact: trasera.deviceId } : undefined,
            facingMode: trasera ? undefined : "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })

        if (cancelado || !videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()

        const detectar = () => {
          if (cancelado || !videoRef.current || !canvasRef.current) return
          // En modo número el video sigue en vivo (para poder encuadrar y
          // capturar), pero ZXing no tiene nada que decodificar acá.
          if (modoRef.current === "numero") {
            frameId = requestAnimationFrame(detectar)
            return
          }
          const video = videoRef.current
          const canvas = canvasRef.current
          const vw = video.videoWidth
          const vh = video.videoHeight

          if (vw > 0 && vh > 0) {
            const cw = vw * CROP_WIDTH_PCT
            const ch = vh * CROP_HEIGHT_PCT
            const sx = (vw - cw) / 2
            const sy = (vh - ch) / 2
            canvas.width = cw
            canvas.height = ch
            const ctx = canvas.getContext("2d")
            if (ctx) {
              ctx.drawImage(video, sx, sy, cw, ch, 0, 0, cw, ch)
              try {
                const resultado = reader.decodeFromCanvas(canvas)
                if (resultado) {
                  onDetected(resultado.getText())
                  return
                }
              } catch {
                // Sin código en este frame: no es un error, se sigue intentando.
              }
            }
          }
          frameId = requestAnimationFrame(detectar)
        }

        frameId = requestAnimationFrame(detectar)
      } catch {
        if (!cancelado) setError("No se pudo acceder a la cámara")
      }
    }

    setError(null)
    iniciar()

    return () => {
      cancelado = true
      if (frameId !== null) cancelAnimationFrame(frameId)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [open, onDetected])

  /**
   * Captura un solo frame y le pide a Tesseract solo dígitos: sin código de
   * barras impreso, lo que hay para leer es el número a simple vista (ej. un
   * medicamento con el lote tipeado a mano). Una sola pasada, no en loop —
   * OCR es demasiado pesado para correr en cada frame como ZXing.
   */
  const capturarNumero = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || leyendoNumero) return

    const vw = video.videoWidth
    const vh = video.videoHeight
    if (vw === 0 || vh === 0) return

    const cw = vw * CROP_WIDTH_PCT
    const ch = vh * CROP_HEIGHT_PCT
    const sx = (vw - cw) / 2
    const sy = (vh - ch) / 2
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, sx, sy, cw, ch, 0, 0, cw, ch)

    setLeyendoNumero(true)
    try {
      const Tesseract = await import("tesseract.js")
      const { data } = await Tesseract.recognize(canvas, "eng", {
        // @ts-expect-error -- tessedit_char_whitelist no está en los tipos públicos de la lib
        tessedit_char_whitelist: "0123456789",
      })
      const digitos = data.text.replace(/\D/g, "")
      if (digitos) {
        onDetected(digitos)
      } else {
        toast.error("No se reconoció ningún número, probá encuadrar mejor")
      }
    } catch {
      toast.error("No se pudo leer el número")
    } finally {
      setLeyendoNumero(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {modo === "barras" ? "Escanear código de barras" : "Leer número sin código de barras"}
          </DialogTitle>
          <DialogDescription>
            {modo === "barras"
              ? "Alineá el código dentro del recuadro."
              : "Encuadrá el número dentro del recuadro y tocá \"Capturar\"."}
          </DialogDescription>
        </DialogHeader>

        <div className="relative overflow-hidden rounded-lg bg-black">
          {error ? (
            <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-red-400">
              {error}
            </div>
          ) : (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} muted playsInline className="h-64 w-full object-cover" />
              <div
                className="pointer-events-none absolute rounded-md border-2 border-emerald-400"
                style={{
                  left: `${(1 - CROP_WIDTH_PCT) * 50}%`,
                  right: `${(1 - CROP_WIDTH_PCT) * 50}%`,
                  top: `${(1 - CROP_HEIGHT_PCT) * 50}%`,
                  bottom: `${(1 - CROP_HEIGHT_PCT) * 50}%`,
                  boxShadow: "0 0 0 999px rgba(0,0,0,0.5)",
                }}
              />
              <div className="absolute right-2 top-2">
                <Loader2 className="h-4 w-4 animate-spin text-white/70" />
              </div>
            </>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />

        {!error && modo === "numero" && (
          <Button
            type="button"
            onClick={capturarNumero}
            disabled={leyendoNumero}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {leyendoNumero ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {leyendoNumero ? "Leyendo…" : "Capturar"}
          </Button>
        )}

        {!error && (
          <button
            type="button"
            onClick={() => setModo((m) => (m === "barras" ? "numero" : "barras"))}
            className="text-center text-xs text-muted-foreground underline underline-offset-2"
          >
            {modo === "barras"
              ? "¿No tiene código de barras? Leer solo el número"
              : "Volver a escanear código de barras"}
          </button>
        )}
      </DialogContent>
    </Dialog>
  )
}
