"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escanear código de barras</DialogTitle>
          <DialogDescription>Alineá el código dentro del recuadro.</DialogDescription>
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
      </DialogContent>
    </Dialog>
  )
}
