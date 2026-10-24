"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronRight, Package } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useMisPedidos } from "@/hooks/use-mis-pedidos"
import { faltaPagar, pedidoAbierto, rutaPedido } from "@/lib/pedidos/reglas"
import { numeroPedido, type EstadoPedido, type Pedido } from "@/lib/pedidos/tipos"
import { formatCurrency, formatDateTime } from "@/lib/format"

/**
 * "Mis pedidos" de la vidriera, para quien ya compró en esta veterinaria:
 * botón flotante (portada), botón de la barra (catálogo, Mi historia…), panel
 * lateral y la lista, que también se usa suelta en Mi historia.
 */

/** Botón flotante abajo a la izquierda (la portada no tiene barra). */
export function MisPedidosFlotante({ slug }: { slug: string }) {
  const { pedidos } = useMisPedidos(slug)
  const [abierto, setAbierto] = useState(false)
  if (pedidos.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 rounded-full border border-warm-border bg-white py-3 pl-4 pr-5
                   text-ink shadow-[0_18px_40px_-16px_rgba(15,23,42,0.35)] transition-transform hover:scale-[1.03]"
        aria-label={etiquetaBoton(pedidos)}
      >
        <IconoPedidos pedidos={pedidos} />
        <span className="text-sm font-bold">Mis pedidos</span>
      </button>
      <MisPedidosSheet pedidos={pedidos} open={abierto} onOpenChange={setAbierto} />
    </>
  )
}

/** Versión compacta para la barra superior: en celular queda solo el ícono. */
export function MisPedidosBoton({ slug }: { slug: string }) {
  const { pedidos } = useMisPedidos(slug)
  const [abierto, setAbierto] = useState(false)
  if (pedidos.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex h-9 items-center gap-2 rounded-full px-2.5 text-sm font-semibold text-ink hover:bg-ink/5 sm:px-3"
        aria-label={etiquetaBoton(pedidos)}
      >
        <IconoPedidos pedidos={pedidos} />
        <span className="hidden sm:inline">Mis pedidos</span>
      </button>
      <MisPedidosSheet pedidos={pedidos} open={abierto} onOpenChange={setAbierto} />
    </>
  )
}

function etiquetaBoton(pedidos: Pedido[]): string {
  const abiertos = pedidos.filter(pedidoAbierto).length
  return `Mis pedidos${abiertos ? ` (${abiertos} en curso)` : ""}`
}

/** Paquete con un punto: naranja si falta pagar algo, celeste si hay pedidos en curso. */
function IconoPedidos({ pedidos }: { pedidos: Pedido[] }) {
  const porPagar = pedidos.some(faltaPagar)
  const enCurso = pedidos.some(pedidoAbierto)
  return (
    <span className="relative">
      <Package className="h-5 w-5 text-coral" />
      {(porPagar || enCurso) && (
        <span
          className={`absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-white ${porPagar ? "bg-amber" : "bg-coral"}`}
        />
      )}
    </span>
  )
}

function MisPedidosSheet({
  pedidos, open, onOpenChange,
}: { pedidos: Pedido[]; open: boolean; onOpenChange: (abierto: boolean) => void }) {
  const abiertos = pedidos.filter(pedidoAbierto).length
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Mis pedidos</SheetTitle>
          <SheetDescription>
            {abiertos > 0 ? `${abiertos} en curso` : "Tus compras en esta veterinaria"}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          <ListaMisPedidos pedidos={pedidos} onElegir={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** La lista en sí: en curso primero, cada uno lleva a la página del pedido. */
export function ListaMisPedidos({ pedidos, onElegir }: { pedidos: Pedido[]; onElegir?: () => void }) {
  const ordenados = [...pedidos].sort((a, b) => Number(pedidoAbierto(b)) - Number(pedidoAbierto(a)))
  return (
    <ul className="divide-y">
      {ordenados.map((p) => (
        <li key={p.id}>
          <Link href={rutaPedido(p)} onClick={onElegir} className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/60">
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <strong>{numeroPedido(p.numero)}</strong>
                <span className="ml-2 text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</span>
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <Estado pedido={p} />
                {faltaPagar(p) && <span className="rounded-full bg-amber/25 px-2 py-0.5 font-semibold">Falta pagar</span>}
              </p>
            </div>
            <span className="text-sm font-bold tabular-nums">{formatCurrency(p.total)}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Cómo lo lee el comprador (las de ESTADOS_PEDIDO son las columnas del panel). */
const ETIQUETA: Record<EstadoPedido, string> = {
  pendiente: "Recibido",
  preparacion: "En preparación",
  reparto: "En camino",
  completado: "Entregado",
  cancelado: "Cancelado",
}

function Estado({ pedido }: { pedido: Pedido }) {
  const color =
    pedido.estado === "cancelado"
      ? "bg-red-50 text-red-600"
      : pedido.estado === "completado"
        ? "bg-teal-soft text-teal-ink"
        : "bg-coral-soft text-coral-ink"
  return <span className={`rounded-full px-2 py-0.5 font-semibold ${color}`}>{ETIQUETA[pedido.estado]}</span>
}
