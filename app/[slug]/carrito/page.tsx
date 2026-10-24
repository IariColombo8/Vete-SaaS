"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Banknote, Bike, CreditCard, Landmark, Loader2, Minus, Plus, QrCode, ShoppingBag, Store, Trash2,
} from "lucide-react"
import { useSlug } from "@/context/slug-context"
import { useAuth } from "@/hooks/use-auth"
import { useCarritoTienda } from "@/hooks/use-carrito-tienda"
import { signInWithGoogle } from "@/lib/supabase/auth"
import { getTenantConfig } from "@/lib/supabase/queries"
import { getClienteByEmail } from "@/lib/supabase/clientes"
import { crearPedidoWeb, getMisPedidos, getTiendaPublica } from "@/lib/supabase/pedidos"
import {
  claveQr, clavePedido, entregasDisponibles, mediosDisponibles, normalizarDni, pasoCantidad, rutaPedido,
} from "@/lib/pedidos/reglas"
import { ESTADOS_PEDIDO, MEDIOS_WEB, numeroPedido, type EntregaPedido, type MedioPagoWeb, type Pedido, type TiendaPublica } from "@/lib/pedidos/tipos"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { imagenSupabase } from "@/lib/imagenes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const ICONO_MEDIO: Record<MedioPagoWeb, typeof Banknote> = {
  efectivo: Banknote,
  transferencia: Landmark,
  tarjeta: CreditCard,
  qr: QrCode,
}

/**
 * Checkout de la vidriera: revisar el carrito, identificarse con Google
 * (queda registrado como cliente de la veterinaria), elegir retiro o envío y
 * cómo paga. Al confirmar, el servidor arma el pedido y, si es con Mercado
 * Pago, el cobro: tarjeta redirige al checkout de MP, QR se dibuja en la
 * página del pedido.
 */
export default function CarritoPage() {
  const slug = useSlug()
  const router = useRouter()
  const { user, loading: cargandoSesion } = useAuth()
  const carrito = useCarritoTienda(slug)

  const [tienda, setTienda] = useState<TiendaPublica | null>(null)
  const [nombreVet, setNombreVet] = useState("")
  const [logo, setLogo] = useState<string | undefined>()
  const [misPedidos, setMisPedidos] = useState<Pedido[]>([])

  const [nombre, setNombre] = useState("")
  const [telefono, setTelefono] = useState("")
  const [dni, setDni] = useState("")
  const [entrega, setEntrega] = useState<EntregaPedido | null>(null)
  const [direccion, setDireccion] = useState("")
  const [nota, setNota] = useState("")
  const [medio, setMedio] = useState<MedioPagoWeb | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    Promise.all([getTiendaPublica(slug), getTenantConfig(slug)]).then(([t, cfg]) => {
      setTienda(t)
      setNombreVet(cfg?.nombre || slug)
      setLogo(cfg?.logo)
      const entregas = entregasDisponibles(t)
      if (entregas.length === 1) setEntrega(entregas[0])
    })
  }, [slug])

  // Con sesión: se completan los datos que la veterinaria ya tiene del cliente.
  useEffect(() => {
    if (!user?.email) return
    const meta = user.user_metadata as { full_name?: string; name?: string } | undefined
    setNombre((n) => n || meta?.full_name || meta?.name || "")
    getClienteByEmail(slug, user.email)
      .then((c) => {
        if (!c) return
        setNombre((n) => n || c.nombre)
        setTelefono((t) => t || c.telefono || "")
        setDni((d) => d || c.dni || "")
        setDireccion((d) => d || c.domicilio || "")
      })
      .catch(() => {})
    getMisPedidos(slug).then(setMisPedidos)
  }, [user, slug])

  const medios = useMemo(() => (tienda ? mediosDisponibles(tienda) : []), [tienda])
  const entregas = useMemo(() => (tienda ? entregasDisponibles(tienda) : []), [tienda])

  // Quien ya compró encuentra todo como la última vez: datos, entrega y
  // medio de pago. Solo completa lo vacío y lo que la tienda sigue ofreciendo.
  const ultimo = misPedidos[0]
  useEffect(() => {
    if (!ultimo || !tienda) return
    setNombre((n) => n || ultimo.clienteNombre)
    setTelefono((t) => t || ultimo.clienteTelefono)
    setDni((d) => d || ultimo.clienteDni)
    setDireccion((d) => d || ultimo.direccion)
    setEntrega((e) => e ?? (entregasDisponibles(tienda).includes(ultimo.entrega) ? ultimo.entrega : null))
    setMedio((m) => m ?? (mediosDisponibles(tienda).includes(ultimo.medioPago) ? ultimo.medioPago : null))
  }, [ultimo, tienda])

  // La página del pedido se baja mientras se completa el formulario: al
  // confirmar, la navegación no espera ese JS.
  useEffect(() => {
    router.prefetch(rutaPedido({ tenantId: slug, clienteDni: "", numero: 0 }))
  }, [router, slug])

  const confirmar = async () => {
    setError("")
    if (!nombre.trim()) return setError("Ingresá tu nombre")
    if (telefono.replace(/\D/g, "").length < 6) return setError("Ingresá un teléfono para coordinar la entrega")
    if (!/^\d{6,9}$/.test(normalizarDni(dni))) return setError("Ingresá tu DNI (solo números)")
    if (!entrega) return setError("Elegí si retirás o te lo enviamos")
    if (entrega === "envio" && direccion.trim().length < 4) return setError("Ingresá la dirección de entrega")
    if (!medio) return setError("Elegí cómo vas a pagar")

    setEnviando(true)
    try {
      const r = await crearPedidoWeb({
        tenantId: slug,
        items: carrito.lineas.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad })),
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        dni: normalizarDni(dni),
        entrega,
        direccion: entrega === "envio" ? direccion.trim() : "",
        nota: nota.trim(),
        medioPago: medio,
      })
      carrito.vaciar()
      if (r.pago.tipo === "redirect") {
        window.location.href = r.pago.url
        return
      }
      // Pedido y QR viajan a la página del pedido por sessionStorage: se
      // dibuja entera apenas abre, sin esperar la sesión ni otra consulta.
      try {
        window.sessionStorage.setItem(clavePedido(slug, r.dni, r.numero), JSON.stringify(r.pedido))
      } catch {}
      if (r.pago.tipo === "qr") {
        const { default: QRCode } = await import("qrcode")
        const imagen = await QRCode.toDataURL(r.pago.qrData, { width: 320, margin: 2 })
        try {
          window.sessionStorage.setItem(claveQr(slug, r.dni, r.numero), imagen)
        } catch {}
      }
      const ruta = rutaPedido({ tenantId: slug, clienteDni: r.dni, numero: r.numero })
      router.push(`${ruta}${r.errorPago ? "?errorPago=1" : ""}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el pedido")
      setEnviando(false)
    }
  }

  if (!tienda) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cream">
        <Loader2 className="h-8 w-8 animate-spin text-coral" />
      </main>
    )
  }

  if (!tienda.pedidosHabilitados) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream px-6 text-center">
        <p className="text-ink-muted">Esta veterinaria todavía no toma pedidos online.</p>
        <Link href={`/${slug}/productos`} className="font-semibold text-coral hover:underline">Ver productos</Link>
      </main>
    )
  }

  const vacio = carrito.unidades === 0
  // Comprar exige cuenta de Google (el servidor lo vuelve a verificar).
  const conGoogle = Boolean(
    user && (user.app_metadata?.provider === "google" || (user.identities ?? []).some((i) => i.provider === "google")),
  )

  return (
    <main className="min-h-screen bg-cream pb-16 text-ink">
      {enviando && <Procesando medio={medio} />}
      <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6">
        <Link href={`/${slug}/productos`} className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Seguir comprando en {nombreVet}
        </Link>
        <h1 className="mb-8 font-display text-3xl font-semibold sm:text-4xl">Tu compra</h1>

        {vacio ? (
          <div className="flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-warm-border bg-white/60 py-16 text-center">
            <ShoppingBag className="h-10 w-10 text-coral" />
            <p className="text-ink-muted">El carrito está vacío.</p>
            <Link href={`/${slug}/productos`} className="font-semibold text-coral hover:underline">Ver productos</Link>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
            {/* ── Datos ── */}
            <div className="space-y-6">
              {!cargandoSesion && !conGoogle ? (
                <section className="rounded-3xl border border-warm-border bg-white p-6">
                  <h2 className="mb-1 text-lg font-semibold">1. Registrate como cliente</h2>
                  <p className="mb-4 text-sm text-ink-muted">
                    Para comprar tenés que ingresar con tu cuenta de Google, así {nombreVet} sepa quién compra y puedas seguir tu pedido.
                  </p>
                  <Button
                    className="rounded-full bg-coral hover:bg-coral-ink"
                    onClick={() => signInWithGoogle(`/${slug}/carrito`)}
                  >
                    Ingresar con Google
                  </Button>
                </section>
              ) : (
                <>
                  <section className="space-y-4 rounded-3xl border border-warm-border bg-white p-6">
                    <h2 className="text-lg font-semibold">
                      {ultimo ? `¡Hola de nuevo, ${(nombre || ultimo.clienteNombre).split(" ")[0]}! 👋` : "1. Tus datos"}
                    </h2>
                    <p className="-mt-2 text-xs text-ink-muted">
                      Comprás como {user?.email}
                      {ultimo && " · Dejamos todo como en tu última compra"}
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <Label className="mb-1 block text-xs">Nombre y apellido</Label>
                        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
                      </div>
                      <div>
                        <Label className="mb-1 block text-xs">Teléfono / WhatsApp</Label>
                        <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" autoComplete="tel" />
                      </div>
                      <div>
                        <Label className="mb-1 block text-xs">DNI</Label>
                        <Input value={dni} onChange={(e) => setDni(e.target.value)} inputMode="numeric" />
                      </div>
                    </div>
                  </section>

                  <section className="space-y-3 rounded-3xl border border-warm-border bg-white p-6">
                    <h2 className="text-lg font-semibold">2. Entrega</h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {entregas.includes("retiro") && (
                        <Opcion
                          activa={entrega === "retiro"} onClick={() => setEntrega("retiro")}
                          icono={Store} titulo="Retiro en el local" detalle="No se cobra envío"
                        />
                      )}
                      {entregas.includes("envio") && (
                        <Opcion
                          activa={entrega === "envio"} onClick={() => setEntrega("envio")}
                          icono={Bike} titulo="Envío a domicilio"
                          detalle={tienda.notaEnvio || "El envío se le paga aparte al cadete, cuando llega."}
                        />
                      )}
                    </div>
                    {entrega === "envio" && (
                      <div>
                        <Label className="mb-1 block text-xs">Dirección (calle, número, piso, barrio)</Label>
                        <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} autoComplete="street-address" />
                      </div>
                    )}
                    <div>
                      <Label className="mb-1 block text-xs">Nota (opcional)</Label>
                      <Textarea
                        value={nota} onChange={(e) => setNota(e.target.value)} rows={2} maxLength={500}
                        placeholder="Ej.: tocar timbre B, entregar después de las 18"
                      />
                    </div>
                  </section>

                  <section className="space-y-3 rounded-3xl border border-warm-border bg-white p-6">
                    <h2 className="text-lg font-semibold">3. Pago</h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {MEDIOS_WEB.filter((m) => medios.includes(m.id)).map((m) => (
                        <Opcion
                          key={m.id} activa={medio === m.id} onClick={() => setMedio(m.id)}
                          icono={ICONO_MEDIO[m.id]} titulo={m.label}
                          detalle={m.id === "efectivo" ? (entrega === "envio" ? "Pagás al recibirlo" : "Pagás al retirarlo") : m.detalle}
                        />
                      ))}
                    </div>
                    {medio === "transferencia" && tienda.aliasTransferencia && (
                      <p className="rounded-xl bg-teal-soft p-3 text-sm text-teal-ink">
                        Alias: <strong>{tienda.aliasTransferencia}</strong>
                        {tienda.titularTransferencia && <> · {tienda.titularTransferencia}</>}. Después de confirmar,
                        transferí el total y mandá el comprobante.
                      </p>
                    )}
                  </section>
                </>
              )}
            </div>

            {/* ── Resumen ── */}
            <aside className="space-y-4 rounded-3xl border border-warm-border bg-white p-6 lg:sticky lg:top-6">
              <h2 className="text-lg font-semibold">Resumen</h2>
              <ul className="divide-y">
                {carrito.lineas.map((l) => {
                  const paso = pasoCantidad(l.producto.unidad)
                  return (
                    <li key={l.producto.id} className="flex gap-3 py-3">
                      <img
                        src={imagenSupabase(l.producto.imagenUrl || logo || "/logo-512.png", 128)}
                        alt="" className="h-14 w-14 shrink-0 rounded-lg border bg-white object-contain p-1"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm">{l.producto.nombre}</p>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <div className="inline-flex items-center rounded-full border">
                            <button type="button" aria-label="Menos" className="flex h-7 w-7 items-center justify-center"
                              onClick={() => carrito.cambiarCantidad(l.producto.id, l.cantidad - paso)}>
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="min-w-10 text-center text-xs font-semibold tabular-nums">
                              {l.cantidad.toLocaleString("es-AR")}{l.producto.unidad === "kg" ? " kg" : ""}
                            </span>
                            <button type="button" aria-label="Más" className="flex h-7 w-7 items-center justify-center"
                              onClick={() => carrito.cambiarCantidad(l.producto.id, l.cantidad + paso)}>
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <span className="text-sm font-semibold tabular-nums">{formatCurrency(l.subtotal)}</span>
                        </div>
                      </div>
                      <button type="button" aria-label="Quitar" onClick={() => carrito.quitar(l.producto.id)}
                        className="self-start p-1 text-ink-muted hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  )
                })}
              </ul>
              <div className="flex items-baseline justify-between border-t pt-4">
                <span className="text-sm text-ink-muted">Total</span>
                <span className="text-2xl font-extrabold tabular-nums">{formatCurrency(carrito.total)}</span>
              </div>
              {entrega === "envio" && (
                <p className="text-xs text-ink-muted">El envío no está incluido: se le paga al cadete al recibir.</p>
              )}

              {error && <p className="text-sm font-medium text-red-600">{error}</p>}

              {conGoogle && (
                <Button
                  className="h-12 w-full rounded-full bg-coral text-base font-bold hover:bg-coral-ink"
                  disabled={enviando} onClick={confirmar}
                >
                  {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {medio === "tarjeta" ? "Ir a pagar con Mercado Pago" : medio === "qr" ? "Confirmar y ver el QR" : "Confirmar pedido"}
                </Button>
              )}
            </aside>
          </div>
        )}

        {misPedidos.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-3 text-lg font-semibold">Tus pedidos</h2>
            <ul className="divide-y rounded-3xl border border-warm-border bg-white">
              {misPedidos.map((p) => (
                <li key={p.id}>
                  <Link href={rutaPedido(p)} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-cream/60">
                    <span className="text-sm">
                      <strong>{numeroPedido(p.numero)}</strong>
                      <span className="ml-2 text-ink-muted">{formatDateTime(p.createdAt)}</span>
                    </span>
                    <span className="flex items-center gap-3 text-sm">
                      <span className="text-ink-muted">{ESTADOS_PEDIDO.find((e) => e.id === p.estado)?.label}</span>
                      <span className="font-semibold tabular-nums">{formatCurrency(p.total)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}

/**
 * Pantalla mientras el servidor arma el pedido y le pide el cobro a Mercado
 * Pago (un par de segundos): el botón solo con un spinner parecía colgado.
 */
function Procesando({ medio }: { medio: MedioPagoWeb | null }) {
  const Icono = medio === "tarjeta" ? CreditCard : medio === "qr" ? QrCode : ShoppingBag
  const texto =
    medio === "tarjeta" ? "Te llevamos a Mercado Pago…" : medio === "qr" ? "Generando tu QR…" : "Confirmando tu pedido…"
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-cream/95 px-6 text-center backdrop-blur-sm"
    >
      <span className="relative flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-coral/20" />
        <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-coral text-white shadow-lg">
          <Icono className="h-9 w-9" />
        </span>
      </span>
      <p className="font-display text-2xl font-semibold text-ink">{texto}</p>
      <p className="text-sm text-ink-muted">Es un momento, no cierres esta página.</p>
    </div>
  )
}

function Opcion({
  activa, onClick, icono: Icono, titulo, detalle,
}: { activa: boolean; onClick: () => void; icono: typeof Banknote; titulo: string; detalle: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors ${
        activa ? "border-coral bg-coral-soft/60" : "border-warm-border hover:border-coral/40"
      }`}
    >
      <Icono className={`mt-0.5 h-5 w-5 shrink-0 ${activa ? "text-coral" : "text-ink-muted"}`} />
      <span>
        <span className="block text-sm font-semibold">{titulo}</span>
        <span className="block text-xs text-ink-muted">{detalle}</span>
      </span>
    </button>
  )
}
