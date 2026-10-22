"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import QRCode from "qrcode"
import {
  ArrowLeft, CheckCircle2, CircleDashed, Clock, CreditCard, Download, FileText, Loader2, QrCode, XCircle,
} from "lucide-react"
import { useSlug } from "@/context/slug-context"
import { useAuth } from "@/hooks/use-auth"
import { signInWithGoogle } from "@/lib/supabase/auth"
import {
  getDocumentosPedido, getTiendaPublica, reintentarPago, solicitarDocumentos, ubicarPedido, type InicioPago,
} from "@/lib/supabase/pedidos"
import { claveQr, esPagoOnline } from "@/lib/pedidos/reglas"
import { etiquetaMedioWeb, numeroPedido, type EstadoPedido, type Pedido, type TiendaPublica } from "@/lib/pedidos/tipos"
import { formatCantidad, formatCurrency, formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"

const POLL_MS = 3000
/** El QR vence a los 30 minutos; después de eso no tiene sentido seguir preguntando. */
const POLL_MAX_MS = 35 * 60 * 1000

const PASOS: { id: EstadoPedido; label: string }[] = [
  { id: "pendiente", label: "Recibido" },
  { id: "preparacion", label: "En preparación" },
  { id: "reparto", label: "En camino" },
  { id: "completado", label: "Entregado" },
]

/**
 * Página del pedido para el comprador: /{veterinaria}/pedido/{dni}/{número}.
 * Solo la ve la cuenta que hizo la compra (el servidor lo verifica).
 *
 * Muestra el estado, cómo pagar lo que falta (QR en pantalla, volver a
 * Mercado Pago, alias) y deja SOLICITAR remito y factura: los descarga
 * recién cuando la veterinaria lo autoriza desde Pedidos.
 */
export default function PedidoPage() {
  const slug = useSlug()
  const { dni, numero } = useParams<{ dni: string; numero: string }>()
  const { user, loading: cargandoSesion } = useAuth()

  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [tienda, setTienda] = useState<TiendaPublica | null>(null)
  const [error, setError] = useState("")
  const [qrImagen, setQrImagen] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)
  const [errorPago, setErrorPago] = useState("")
  const inicioPoll = useRef(Date.now())

  // El QR que generó el checkout se muestra apenas abre la página, sin
  // esperar la sesión ni la consulta del pedido.
  useEffect(() => {
    try {
      const img = window.sessionStorage.getItem(claveQr(slug, dni, numero))
      if (img) setQrImagen(img)
    } catch {}
    if (new URLSearchParams(window.location.search).get("errorPago")) {
      setErrorPago("No se pudo generar el cobro. Probá de nuevo.")
    }
  }, [slug, dni, numero])

  const cargar = useCallback(async (verificar: boolean) => {
    try {
      const p = await ubicarPedido(slug, dni, Number(numero), verificar)
      setPedido(p)
      setError("")
      return p
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el pedido")
      return null
    }
  }, [slug, dni, numero])

  useEffect(() => {
    if (!user) return
    // Primera carga sin consultar a Mercado Pago: rápida.
    cargar(false)
    getTiendaPublica(slug).then(setTienda)
  }, [user, cargar, slug])

  // Mientras el pago online esté pendiente, se le pregunta al servidor (que
  // consulta a Mercado Pago) cada pocos segundos.
  const esperandoPago = Boolean(
    pedido && esPagoOnline(pedido.medioPago) && !pedido.ventaId && pedido.pagoEstado !== "aprobado" && pedido.estado !== "cancelado",
  )
  useEffect(() => {
    if (!esperandoPago) return
    const t = setInterval(() => {
      if (Date.now() - inicioPoll.current > POLL_MAX_MS) return
      cargar(true)
    }, POLL_MS)
    return () => clearInterval(t)
  }, [esperandoPago, cargar])

  useEffect(() => {
    if (pedido?.ventaId) {
      setQrImagen(null)
      try { window.sessionStorage.removeItem(claveQr(slug, dni, numero)) } catch {}
    }
  }, [pedido?.ventaId, slug, dni, numero])

  const pagar = async () => {
    if (!pedido) return
    setGenerando(true)
    setErrorPago("")
    try {
      const pago: InicioPago = await reintentarPago(pedido.id)
      if (pago.tipo === "redirect") {
        window.location.href = pago.url
        return
      }
      if (pago.tipo === "qr") {
        setQrImagen(await QRCode.toDataURL(pago.qrData, { width: 320, margin: 2 }))
        inicioPoll.current = Date.now()
      }
      await cargar(false)
    } catch (e) {
      setErrorPago(e instanceof Error ? e.message : "No se pudo generar el cobro")
    } finally {
      setGenerando(false)
    }
  }

  if (!pedido) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream px-6 text-center text-ink">
        {qrImagen && !error && <BloqueQr imagen={qrImagen} />}
        {!cargandoSesion && !user ? (
          <>
            <p>Ingresá con la cuenta de Google con la que hiciste el pedido.</p>
            <Button
              className="rounded-full bg-coral hover:bg-coral-ink"
              onClick={() => signInWithGoogle(`/${slug}/pedido/${dni}/${numero}`)}
            >
              Ingresar con Google
            </Button>
          </>
        ) : error ? (
          <>
            <p>{error}</p>
            <Link href={`/${slug}/productos`} className="font-semibold text-coral hover:underline">Volver a la tienda</Link>
          </>
        ) : (
          !qrImagen && <Loader2 className="h-8 w-8 animate-spin text-coral" />
        )}
      </main>
    )
  }

  const pagado = Boolean(pedido.ventaId) || pedido.pagoEstado === "aprobado"
  const pasos = PASOS.filter((p) => p.id !== "reparto" || pedido.entrega === "envio")
  const indiceActual = pasos.findIndex((p) => p.id === pedido.estado)

  return (
    <main className="min-h-screen bg-cream pb-16 text-ink">
      <div className="mx-auto max-w-2xl space-y-6 px-4 pt-8 sm:px-6">
        <Link href={`/${slug}/productos`} className="inline-flex items-center gap-2 text-sm font-medium text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Volver a la tienda
        </Link>

        <div>
          <p className="text-sm text-ink-muted">{formatDateTime(pedido.createdAt)}</p>
          <h1 className="font-display text-3xl font-semibold">{numeroPedido(pedido.numero)}</h1>
        </div>

        {/* ── Estado ── */}
        <section className="rounded-3xl border border-warm-border bg-white p-6">
          {pedido.estado === "cancelado" ? (
            <p className="flex items-center gap-2 font-semibold text-red-600">
              <XCircle className="h-5 w-5" /> Pedido cancelado{pedido.canceladoMotivo ? `: ${pedido.canceladoMotivo}` : ""}
            </p>
          ) : (
            <ol className="flex items-center justify-between gap-2">
              {pasos.map((p, i) => (
                <li key={p.id} className="flex flex-1 flex-col items-center gap-1.5 text-center">
                  {i <= indiceActual
                    ? <CheckCircle2 className="h-6 w-6 text-coral" />
                    : <CircleDashed className="h-6 w-6 text-slate-300" />}
                  <span className={`text-xs ${i <= indiceActual ? "font-semibold" : "text-ink-muted"}`}>{p.label}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* ── Pago ── */}
        <section className="space-y-3 rounded-3xl border border-warm-border bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Pago · {etiquetaMedioWeb(pedido.medioPago)}</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              pagado ? "bg-teal-soft text-teal-ink" : pedido.pagoEstado === "rechazado" ? "bg-red-50 text-red-600" : "bg-amber/20 text-ink"
            }`}>
              {pagado ? "Pagado" : pedido.pagoEstado === "rechazado" ? "Rechazado" : "Pendiente"}
            </span>
          </div>

          {!pagado && pedido.estado !== "cancelado" && (
            <>
              {pedido.medioPago === "qr" && (
                qrImagen ? (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <BloqueQr imagen={qrImagen} total={pedido.total} />
                    <button type="button" className="text-xs font-semibold text-coral hover:underline" onClick={pagar} disabled={generando}>
                      Generar un QR nuevo
                    </button>
                  </div>
                ) : (
                  <Button className="w-full rounded-full bg-coral hover:bg-coral-ink" onClick={pagar} disabled={generando}>
                    {generando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                    Mostrar el QR para pagar
                  </Button>
                )
              )}

              {pedido.medioPago === "tarjeta" && (
                <>
                  {pedido.pagoEstado === "rechazado" && (
                    <p className="text-sm text-red-600">Mercado Pago rechazó el pago. Podés probar con otra tarjeta.</p>
                  )}
                  {pedido.pagoEstado === "pendiente" && (
                    <p className="flex items-center gap-2 text-sm text-ink-muted">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Si ya pagaste, en unos segundos se confirma acá.
                    </p>
                  )}
                  <Button className="w-full rounded-full bg-coral hover:bg-coral-ink" onClick={pagar} disabled={generando}>
                    {generando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                    Pagar con Mercado Pago
                  </Button>
                </>
              )}

              {pedido.medioPago === "transferencia" && (
                <p className="rounded-xl bg-teal-soft p-3 text-sm text-teal-ink">
                  {tienda?.aliasTransferencia
                    ? <>Transferí <strong>{formatCurrency(pedido.total)}</strong> al alias <strong>{tienda.aliasTransferencia}</strong>{tienda.titularTransferencia && <> ({tienda.titularTransferencia})</>} y mandá el comprobante a la veterinaria.</>
                    : <>La veterinaria te va a pasar los datos para transferir {formatCurrency(pedido.total)}.</>}
                </p>
              )}

              {pedido.medioPago === "efectivo" && (
                <p className="text-sm text-ink-muted">
                  Pagás {formatCurrency(pedido.total)} en efectivo {pedido.entrega === "envio" ? "al recibir el pedido" : "al retirarlo"}.
                </p>
              )}

              {errorPago && <p className="text-sm font-medium text-red-600">{errorPago}</p>}
            </>
          )}

          {pedido.estado !== "cancelado" && (
            <Documentos pedido={pedido} onSolicitado={() => cargar(false)} />
          )}
        </section>

        {/* ── Detalle ── */}
        <section className="space-y-3 rounded-3xl border border-warm-border bg-white p-6">
          <h2 className="font-semibold">Detalle</h2>
          <ul className="divide-y text-sm">
            {pedido.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-2">
                <span>
                  {[i.marca, i.nombre].filter(Boolean).join(" ")}
                  {i.presentacion && <span className="text-ink-muted"> ({i.presentacion})</span>}
                  <span className="text-ink-muted"> × {formatCantidad(i.cantidad)}{i.unidad === "kg" ? " kg" : ""}</span>
                </span>
                <span className="shrink-0 tabular-nums">{formatCurrency(i.subtotal)}</span>
              </li>
            ))}
          </ul>
          {pedido.descuento > 0 && (
            <p className="flex justify-between text-sm text-ink-muted">
              <span>Descuento</span><span>− {formatCurrency(pedido.descuento)}</span>
            </p>
          )}
          <p className="flex justify-between border-t pt-3 text-lg font-bold">
            <span>Total</span><span className="tabular-nums">{formatCurrency(pedido.total)}</span>
          </p>
          <p className="text-sm text-ink-muted">
            {pedido.entrega === "envio"
              ? <>Envío a <strong className="text-ink">{pedido.direccion}</strong>. {tienda?.notaEnvio || "El envío se le paga aparte al cadete."}</>
              : "Retiro en el local."}
          </p>
          {pedido.nota && <p className="text-sm text-ink-muted">Nota: {pedido.nota}</p>}
        </section>
      </div>
    </main>
  )
}

function BloqueQr({ imagen, total }: { imagen: string; total?: number }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <img src={imagen} alt="QR de Mercado Pago" className="h-64 w-64 rounded-2xl border bg-white" />
      <p className="max-w-xs text-center text-sm text-ink-muted">
        Escanealo con Mercado Pago o cualquier billetera{total != null ? `. Total ${formatCurrency(total)}` : ""}.
      </p>
      <p className="flex items-center gap-2 text-xs text-ink-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Esperando el pago…
      </p>
    </div>
  )
}

/**
 * Remito y factura: el comprador no los ve hasta que la veterinaria lo
 * autoriza. Primero "Solicitar", después "Solicitado", y recién con la
 * autorización (y el pedido cobrado) aparecen las descargas.
 */
function Documentos({ pedido, onSolicitado }: { pedido: Pedido; onSolicitado: () => void }) {
  const [ocupado, setOcupado] = useState<"solicitar" | "remito" | "factura" | null>(null)
  const [hayFactura, setHayFactura] = useState(false)
  const [error, setError] = useState("")
  const habilitado = pedido.documentosEstado === "autorizado" && Boolean(pedido.ventaId)

  useEffect(() => {
    if (!habilitado) return
    getDocumentosPedido(pedido.id)
      .then((d) => setHayFactura(Boolean(d.factura && d.fiscal)))
      .catch(() => setHayFactura(false))
  }, [habilitado, pedido.id])

  const solicitar = async () => {
    setOcupado("solicitar")
    setError("")
    try {
      await solicitarDocumentos(pedido.id)
      onSolicitado()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar la solicitud")
    } finally {
      setOcupado(null)
    }
  }

  const bajar = async (que: "remito" | "factura") => {
    setOcupado(que)
    setError("")
    try {
      const [docs, { aVenta }, remito] = await Promise.all([
        getDocumentosPedido(pedido.id),
        import("@/lib/supabase/ventas"),
        import("@/lib/ventas/remito"),
      ])
      const venta = aVenta(docs.venta)
      if (que === "remito") {
        await remito.descargarRemitoPDF(venta, docs.emisor)
        return
      }
      if (!docs.factura || !docs.fiscal) throw new Error("La factura todavía no está emitida")
      let blob: Blob
      if (docs.facturaUrl) {
        blob = await (await fetch(docs.facturaUrl)).blob()
      } else {
        const [{ aComprobante }, { generarFacturaPDF }] = await Promise.all([
          import("@/lib/supabase/comprobantes"),
          import("@/lib/facturacion/factura-pdf"),
        ])
        blob = await generarFacturaPDF(venta, docs.emisor, aComprobante(docs.factura), docs.fiscal)
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `factura-pedido-${pedido.numero}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo descargar")
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="space-y-2 border-t pt-3">
      {habilitado ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" className="rounded-full" onClick={() => bajar("remito")} disabled={ocupado !== null}>
            {ocupado === "remito" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Remito
          </Button>
          {hayFactura && (
            <Button variant="outline" className="rounded-full" onClick={() => bajar("factura")} disabled={ocupado !== null}>
              {ocupado === "factura" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              Factura
            </Button>
          )}
        </div>
      ) : pedido.documentosEstado === "autorizado" ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Clock className="h-4 w-4" />
          El remito y la factura van a estar acá apenas el pedido quede cobrado.
        </p>
      ) : pedido.documentosEstado ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Clock className="h-4 w-4" />
          Pediste el remito y la factura. Vas a poder descargarlos acá cuando la veterinaria lo autorice.
        </p>
      ) : (
        <Button variant="outline" className="w-full rounded-full" onClick={solicitar} disabled={ocupado !== null}>
          {ocupado === "solicitar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
          Solicitar remito y factura
        </Button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
