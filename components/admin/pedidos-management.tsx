"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Bike, ClipboardList, ExternalLink, RefreshCw, Search, Store } from "lucide-react"
import { toast } from "sonner"
import { EncabezadoPagina } from "@/components/admin/encabezado-pagina"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { getPedidos, getTiendaPublica } from "@/lib/supabase/pedidos"
import { getTenantConfig } from "@/lib/supabase/queries"
import { getEstadoFacturacion, type EstadoFacturacion } from "@/lib/supabase/comprobantes"
import { ESTADOS_PEDIDO, etiquetaMedioWeb, numeroPedido, type EstadoPedido, type Pedido } from "@/lib/pedidos/tipos"
import { formatCurrency, formatDateTime } from "@/lib/format"
import type { EmisorRemito } from "@/lib/ventas/remito"
import { PedidoDialog } from "./pedidos/pedido-dialog"

/** Cada cuánto se buscan pedidos nuevos mientras la pantalla está abierta. */
const REFRESCO_MS = 30_000

/**
 * Tablero de los pedidos de la tienda web: Pendiente → Preparación →
 * Reparto → Completados (y Cancelados). Tocar un pedido abre el detalle,
 * donde se edita, se cobra, se sacan remito y factura y se avanza de estado.
 */
export function PedidosManagement({ tenantId }: { tenantId: string }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [cargando, setCargando] = useState(true)
  const [pestana, setPestana] = useState<EstadoPedido>("pendiente")
  const [busqueda, setBusqueda] = useState("")
  const [abiertoId, setAbiertoId] = useState<string | null>(null)
  const [emisor, setEmisor] = useState<EmisorRemito>({ nombre: "" })
  const [facturacion, setFacturacion] = useState<EstadoFacturacion | null>(null)
  const [tiendaAbierta, setTiendaAbierta] = useState<boolean | null>(null)

  const cargar = useCallback(async () => {
    try {
      setPedidos(await getPedidos(tenantId))
    } catch {
      toast.error("No se pudieron cargar los pedidos")
    } finally {
      setCargando(false)
    }
  }, [tenantId])

  useEffect(() => {
    cargar()
    const t = setInterval(cargar, REFRESCO_MS)
    return () => clearInterval(t)
  }, [cargar])

  useEffect(() => {
    getTenantConfig(tenantId)
      .then((c) => setEmisor({
        nombre: c?.nombre || "VetPanel", direccion: c?.direccion, telefono: c?.telefono, email: c?.email, logoUrl: c?.logo,
      }))
      .catch(() => setEmisor({ nombre: "VetPanel" }))
    getEstadoFacturacion(tenantId).then(setFacturacion).catch(() => setFacturacion(null))
    getTiendaPublica(tenantId).then((t) => setTiendaAbierta(t.pedidosHabilitados))
  }, [tenantId])

  const porEstado = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    const filtrados = termino
      ? pedidos.filter((p) =>
          String(p.numero).includes(termino) ||
          p.clienteNombre.toLowerCase().includes(termino) ||
          p.clienteTelefono.includes(termino) ||
          p.direccion.toLowerCase().includes(termino))
      : pedidos
    const mapa = new Map<EstadoPedido, Pedido[]>(ESTADOS_PEDIDO.map((e) => [e.id, []]))
    for (const p of filtrados) mapa.get(p.estado)?.push(p)
    return mapa
  }, [pedidos, busqueda])

  const lista = porEstado.get(pestana) ?? []
  const abierto = pedidos.find((p) => p.id === abiertoId) ?? null

  return (
    <div className="space-y-4">
      <EncabezadoPagina
        icono={ClipboardList}
        titulo="Pedidos"
        descripcion="Compras de la tienda web, de la vidriera al cliente"
        acciones={
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                placeholder="N°, cliente, teléfono…" className="h-9 w-56 pl-8"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => { setCargando(true); cargar() }}>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Actualizar
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/${tenantId}/productos`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-4 w-4" /> Ver tienda
              </Link>
            </Button>
          </>
        }
      />

      {tiendaAbierta === false && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          La tienda no está tomando pedidos. Activala en
          <Link href={`/${tenantId}/admin/TiendaVirtual`} className="font-semibold underline">Tienda virtual</Link>.
        </p>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1">
        {ESTADOS_PEDIDO.map((e) => {
          const n = porEstado.get(e.id)?.length ?? 0
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setPestana(e.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                pestana === e.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {e.label}
              {n > 0 && (
                <span className={cn(
                  "rounded-full px-1.5 text-xs font-bold",
                  e.id === "pendiente" ? "bg-coral text-white" : "bg-muted-foreground/15",
                )}>
                  {n}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {cargando && pedidos.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : lista.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No hay pedidos {ESTADOS_PEDIDO.find((e) => e.id === pestana)?.label.toLowerCase()}.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((p) => <TarjetaPedido key={p.id} pedido={p} onAbrir={() => setAbiertoId(p.id)} />)}
        </div>
      )}

      {abierto && (
        <PedidoDialog
          tenantId={tenantId}
          pedido={abierto}
          emisor={emisor}
          facturacion={facturacion}
          onCerrar={() => setAbiertoId(null)}
          onCambio={cargar}
        />
      )}
    </div>
  )
}

function TarjetaPedido({ pedido: p, onAbrir }: { pedido: Pedido; onAbrir: () => void }) {
  const cobrado = Boolean(p.ventaId) || p.pagoEstado === "aprobado"
  const alerta = p.ventaError || p.facturaError
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex flex-col gap-2 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{numeroPedido(p.numero)}</p>
          <p className="text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</p>
        </div>
        <p className="text-lg font-bold tabular-nums">{formatCurrency(p.total)}</p>
      </div>

      <div className="text-sm">
        <p className="font-medium">{p.clienteNombre}</p>
        <p className="text-muted-foreground">{p.clienteTelefono}</p>
      </div>

      <p className="flex items-start gap-1.5 text-sm">
        {p.entrega === "envio"
          ? <><Bike className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" /><span className="line-clamp-2">{p.direccion}</span></>
          : <><Store className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Retira en el local</>}
      </p>

      {p.nota && <p className="line-clamp-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{p.nota}</p>}

      <p className="line-clamp-2 text-xs text-muted-foreground">
        {p.items.map((i) => `${i.cantidad.toLocaleString("es-AR")}${i.unidad === "kg" ? " kg" : ""} × ${i.nombre}`).join(" · ")}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        <Badge variant="outline">{etiquetaMedioWeb(p.medioPago)}</Badge>
        <Badge
          className={cobrado
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
            : p.pagoEstado === "rechazado"
              ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"}
        >
          {cobrado ? "Cobrado" : p.pagoEstado === "rechazado" ? "Pago rechazado" : "Sin cobrar"}
        </Badge>
        {alerta && (
          <Badge className="gap-1 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
            <AlertTriangle className="h-3 w-3" /> Revisar
          </Badge>
        )}
      </div>
    </button>
  )
}
