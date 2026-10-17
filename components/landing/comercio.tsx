import { FileCheck2, Palette, QrCode, Package, Wallet, BookOpenCheck } from "lucide-react"
import { Reveal } from "@/components/landing/reveal"
import { Paw } from "@/components/landing/pet-art"

// Server component: solo los Reveal hidratan. La factura de muestra es HTML +
// un SVG fijo, sin imágenes que sumen al peso de la landing.

const FUNCIONES = [
  {
    icon: FileCheck2,
    titulo: "Factura electrónica de ARCA",
    texto:
      "Conexión directa con ARCA, con tu CUIT y tu certificado. Factura A, B o C con CAE y QR en un click, sin intermediarios ni costo por comprobante.",
  },
  {
    icon: Palette,
    titulo: "Comprobantes con tu logo",
    texto:
      "Facturas y remitos en PDF con la marca de tu veterinaria, listos para mandar al cliente por WhatsApp.",
  },
  {
    icon: QrCode,
    titulo: "Cobrá con Mercado Pago",
    texto:
      "El monto viaja directo a tu posnet Point o aparece un QR en pantalla. La venta se registra sola cuando el pago se aprueba.",
  },
  {
    icon: Package,
    titulo: "Stock y vencimientos",
    texto:
      "Alimento por bolsa o suelto por kilo, ofertas y combos, alertas de stock bajo. Importás tu lista de precios desde Excel.",
  },
  {
    icon: Wallet,
    titulo: "Caja diaria",
    texto:
      "Apertura, arqueo y cierre con la diferencia calculada sola. Efectivo, tarjeta y transferencia, cada uno en su lugar.",
  },
  {
    icon: BookOpenCheck,
    titulo: "Cuenta corriente y gastos",
    texto:
      "El fiado de cada cliente, los gastos fijos del mes y métricas de ventas para saber cuánto gana tu veterinaria.",
  },
]

/** Patrón fijo con aspecto de QR (decorativo, no se escanea). */
const QR_FILAS = [
  "1110101110111",
  "1010010010101",
  "1110110111011",
  "0001011010000",
  "1011100101101",
  "0110011100110",
  "1101101011011",
  "0000100110100",
  "1110010101011",
  "1010111001010",
  "1110100111101",
]

function QrFalso() {
  return (
    <svg viewBox="0 0 13 11" className="h-16 w-16" shapeRendering="crispEdges" aria-hidden>
      {QR_FILAS.flatMap((fila, y) =>
        fila.split("").map((c, x) => (c === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#2d2a26" /> : null)),
      )}
    </svg>
  )
}

function FacturaMuestra() {
  return (
    <div className="relative mx-auto w-full max-w-sm rotate-[-1.5deg] rounded-2xl bg-white p-5 text-ink shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)]">
      {/* Cabecera: emisor | letra | comprobante, como el comprobante argentino */}
      <div className="relative grid grid-cols-2 border border-ink/15 rounded-lg">
        <div className="p-3 border-r border-ink/15">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-coral text-white">
              <Paw className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <p className="text-[11px] font-bold">Tu Veterinaria</p>
              <p className="text-[9px] text-ink-muted">Tu logo, acá</p>
            </div>
          </div>
          <p className="mt-2 text-[8px] text-ink-muted leading-snug">
            Av. Siempre Viva 742 · IVA Resp. Inscripto
          </p>
        </div>
        <div className="p-3 pl-6 text-right">
          <p className="text-[11px] font-bold">FACTURA</p>
          <p className="text-[9px] text-ink-muted">N° 0001-00000042</p>
          <p className="text-[9px] text-ink-muted">16/10/2026</p>
        </div>
        <span className="absolute left-1/2 top-0 flex h-9 w-9 -translate-x-1/2 -translate-y-px flex-col items-center justify-center border border-ink/30 bg-white">
          <span className="text-base font-black leading-none">B</span>
          <span className="text-[6px] text-ink-muted">COD. 006</span>
        </span>
      </div>

      <div className="mt-3 space-y-1.5 text-[10px]">
        {[
          ["Royal Canin Adulto 15 kg", "$ 89.900"],
          ["Vacuna séxtuple", "$ 18.500"],
          ["Pipeta antipulgas", "$ 12.300"],
        ].map(([item, precio], i) => (
          <div key={item} className={`flex justify-between rounded px-2 py-1 ${i % 2 === 0 ? "bg-cream" : ""}`}>
            <span>{item}</span>
            <span className="font-semibold tabular-nums">{precio}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-ink/10 pt-3">
        <div className="flex items-center gap-2">
          <QrFalso />
          <div className="text-[8px] leading-snug text-ink-muted">
            <p className="font-bold text-ink">ARCA</p>
            <p>CAE 74123456789012</p>
            <p>Vto. CAE 26/10/2026</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-ink-muted">Total</p>
          <p className="font-display text-xl font-semibold tabular-nums">$ 120.700</p>
        </div>
      </div>

      {/* Sello de aprobado */}
      <span className="absolute -right-4 -top-4 rotate-12 rounded-full bg-teal px-3 py-1.5 text-[11px] font-bold text-white shadow-lg">
        ✓ Autorizada por ARCA
      </span>
    </div>
  )
}

export function Comercio() {
  return (
    <section id="comercio" className="relative overflow-hidden bg-ink py-24 text-white">
      <div
        className="pointer-events-none absolute -left-40 top-10 h-[520px] w-[520px] rounded-full opacity-40"
        style={{ background: "radial-gradient(circle closest-side, rgba(20,184,166,0.35), transparent)" }}
      />
      <div
        className="pointer-events-none absolute -right-40 bottom-0 h-[520px] w-[520px] rounded-full opacity-40"
        style={{ background: "radial-gradient(circle closest-side, rgba(13,116,169,0.45), transparent)" }}
      />

      <div className="relative container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-semibold uppercase tracking-widest text-teal mb-3">
            Clínica + comercio
          </p>
          <h2 className="font-display text-4xl sm:text-5xl font-semibold">
            También es el sistema de tu mostrador
          </h2>
          <p className="mt-4 text-lg text-white/70">
            Vendés alimento, cobrás con Mercado Pago y facturás a ARCA con tu logo, desde el mismo
            lugar donde atendés los turnos. Sin un segundo programa.
          </p>
        </Reveal>

        <div className="grid lg:grid-cols-5 gap-12 items-center">
          <Reveal className="lg:col-span-2 py-6">
            <FacturaMuestra />
          </Reveal>

          <div className="lg:col-span-3 grid sm:grid-cols-2 gap-4">
            {FUNCIONES.map(({ icon: Icon, titulo, texto }, i) => (
              <Reveal key={titulo} delay={(i % 2) * 0.08}>
                <div className="h-full rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors hover:bg-white/[0.08]">
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal/15 text-teal">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-display text-lg font-semibold">{titulo}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/65">{texto}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal className="mt-12 text-center">
          <p className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm text-white/80">
            <span className="rounded-full bg-teal px-2 py-0.5 text-xs font-bold text-white">Plan Pro</span>
            Incluido en la prueba gratis de 10 días
          </p>
        </Reveal>
      </div>
    </section>
  )
}
