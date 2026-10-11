"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Calendar,
  Edit,
  ExternalLink,
  History,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  PawPrint,
  Phone,
  QrCode,
  Receipt,
  Save,
  ShoppingCart,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { useReadOnly } from "@/lib/auth/read-only-context"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { CONDICIONES_IVA_CLIENTE, type Cliente, type CondicionIvaCliente, type HistorialDato, type Mascota, type Turno, type Venta } from "@/lib/supabase/types"
import { updateClienteFiscal } from "@/lib/supabase/clientes"
import { getTurnosByClienteId } from "@/lib/supabase/turnos"
import { getVentas } from "@/lib/supabase/ventas"
import { getMovimientosCliente, type MovimientoCtaCte } from "@/lib/supabase/cuentaCorriente"
import { cuitValido } from "@/lib/facturacion/comprobante"

export type ClientePerfil = Cliente & { mascotas?: Mascota[]; historialDatos?: HistorialDato[] }

interface Props {
  open: boolean
  tenantId: string
  cliente: ClientePerfil | null
  cargando: boolean
  /** La veterinaria tiene plan con mostrador: muestra compras y cuenta corriente. */
  conVentas: boolean
  onClose: () => void
  onEditar: (cliente: ClientePerfil) => void
  onAgregarMascota: (dni: string) => void
  /** Avisar al padre que cambiaron datos fiscales (para refrescar la lista). */
  onClienteActualizado?: (cliente: ClientePerfil) => void
}

const ESTADO_TURNO: Record<Turno["estado"], string> = {
  pendiente: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  confirmado: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  completado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelado: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
}

function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
}

function whatsapp(telefono: string): string {
  const d = telefono.replace(/\D/g, "")
  const n = d.startsWith("54") ? d : d.startsWith("0") ? `54${d.slice(1)}` : `54${d}`
  return `https://wa.me/${n}`
}

function mapsUrl(direccion: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`
}

function fechaCorta(iso: string | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

/**
 * Perfil del cliente en el panel: quién es, cómo contactarlo, sus mascotas, y
 * todo lo que pasó con él en la veterinaria (turnos, compras, cuenta
 * corriente), con las acciones a mano: WhatsApp, nuevo turno, vender.
 *
 * Los datos fiscales (CUIT, condición IVA) se editan acá mismo: los necesita
 * la factura electrónica y no tenía sentido mandarlos al formulario general.
 */
export function ClientePerfilDialog({
  open,
  tenantId,
  cliente,
  cargando,
  conVentas,
  onClose,
  onEditar,
  onAgregarMascota,
  onClienteActualizado,
}: Props) {
  const { toast } = useToast()
  const readOnly = useReadOnly()
  const [tab, setTab] = useState("resumen")
  const [turnos, setTurnos] = useState<Turno[] | null>(null)
  const [ventas, setVentas] = useState<Venta[] | null>(null)
  const [movimientos, setMovimientos] = useState<MovimientoCtaCte[] | null>(null)

  const [fiscal, setFiscal] = useState<{ cuit: string; condicionIva: CondicionIvaCliente }>({ cuit: "", condicionIva: "CF" })
  const [guardandoFiscal, setGuardandoFiscal] = useState(false)

  const clienteId = cliente?.id

  // Al cambiar de cliente se resetea todo: nada de la ficha anterior puede quedar visible.
  useEffect(() => {
    setTab("resumen")
    setTurnos(null)
    setVentas(null)
    setMovimientos(null)
    setFiscal({ cuit: cliente?.cuit ?? "", condicionIva: cliente?.condicionIva ?? "CF" })
  }, [clienteId, cliente?.cuit, cliente?.condicionIva])

  // Historial: se carga en paralelo apenas hay cliente, así los contadores del
  // encabezado y las pestañas llegan juntos.
  useEffect(() => {
    if (!open || !clienteId) return
    let vigente = true
    getTurnosByClienteId(tenantId, clienteId)
      .then((t) => vigente && setTurnos(t.sort((a, b) => (b.turno.fecha + b.turno.hora).localeCompare(a.turno.fecha + a.turno.hora))))
      .catch(() => vigente && setTurnos([]))
    if (conVentas) {
      getVentas(tenantId, { clienteId, porPagina: 50 })
        .then((p) => vigente && setVentas(p.ventas))
        .catch(() => vigente && setVentas([]))
      getMovimientosCliente(tenantId, clienteId)
        .then((m) => vigente && setMovimientos(m))
        .catch(() => vigente && setMovimientos([]))
    } else {
      setVentas([])
      setMovimientos([])
    }
    return () => {
      vigente = false
    }
  }, [open, tenantId, clienteId, conVentas])

  async function guardarFiscal() {
    if (!cliente?.id) return
    if (fiscal.cuit.trim() && !cuitValido(fiscal.cuit)) {
      toast({ title: "CUIT inválido", description: "Revisá los 11 dígitos.", variant: "destructive" })
      return
    }
    setGuardandoFiscal(true)
    try {
      await updateClienteFiscal(tenantId, cliente.id, { cuit: fiscal.cuit.trim() || null, condicionIva: fiscal.condicionIva })
      toast({ title: "Datos fiscales guardados" })
      onClienteActualizado?.({ ...cliente, cuit: fiscal.cuit.replace(/\D/g, "") || undefined, condicionIva: fiscal.condicionIva })
    } catch (error) {
      toast({ title: "No se pudo guardar", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setGuardandoFiscal(false)
    }
  }

  const saldo = (movimientos ?? []).reduce((acc, m) => acc + (m.tipo === "venta" ? m.monto : -m.monto), 0)
  const ventasValidas = (ventas ?? []).filter((v) => v.estado !== "anulada" && !v.esPagoCtaCte)
  const totalGastado = ventasValidas.reduce((acc, v) => acc + v.total, 0)
  const ultimoTurno = turnos?.find((t) => t.estado === "completado") ?? turnos?.[0]
  const proximoTurno = (turnos ?? [])
    .filter((t) => t.estado !== "cancelado" && new Date(`${t.turno.fecha}T${t.turno.hora || "00:00"}`) >= new Date())
    .sort((a, b) => (a.turno.fecha + a.turno.hora).localeCompare(b.turno.fecha + b.turno.hora))[0]

  const fiscalCambio = cliente && (fiscal.cuit.replace(/\D/g, "") !== (cliente.cuit ?? "") || fiscal.condicionIva !== (cliente.condicionIva ?? "CF"))

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {cargando || !cliente ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
        ) : (
          <>
            {/* ── Encabezado ── */}
            <DialogHeader className="shrink-0 space-y-0 border-b bg-gradient-to-br from-emerald-50 to-white px-6 pb-4 pt-6 dark:from-emerald-950/30 dark:to-slate-900">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-lg font-bold text-white shadow-lg shadow-emerald-600/25">
                  {iniciales(cliente.nombre) || <PawPrint className="h-6 w-6" />}
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="truncate text-xl font-bold">{cliente.nombre}</DialogTitle>
                  <DialogDescription className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {cliente.dni && <span className="font-mono">DNI {cliente.dni}</span>}
                    {cliente.createdAt && <span>Cliente desde {fechaCorta(cliente.createdAt)}</span>}
                    {cliente.mascotas && (
                      <span>
                        {cliente.mascotas.length} mascota{cliente.mascotas.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </DialogDescription>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {cliente.telefono && (
                      <a
                        href={whatsapp(cliente.telefono)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                    )}
                    {cliente.telefono && (
                      <a href={`tel:${cliente.telefono}`} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
                        <Phone className="h-3.5 w-3.5" /> Llamar
                      </a>
                    )}
                    {cliente.email && (
                      <a href={`mailto:${cliente.email}`} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
                        <Mail className="h-3.5 w-3.5" /> Email
                      </a>
                    )}
                    <Link href={`/${tenantId}/admin/Turnos`} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
                      <Calendar className="h-3.5 w-3.5" /> Turnos
                    </Link>
                    {conVentas && (
                      <Link href={`/${tenantId}/admin/Vender`} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
                        <ShoppingCart className="h-3.5 w-3.5" /> Vender
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {/* KPIs */}
              <div className={`mt-4 grid gap-2 ${conVentas ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}>
                <Kpi label="Turnos" valor={turnos === null ? "…" : String(turnos.length)} sub={ultimoTurno ? `Último: ${fechaCorta(ultimoTurno.turno.fecha)}` : "Sin visitas"} />
                <Kpi label="Próximo turno" valor={proximoTurno ? fechaCorta(proximoTurno.turno.fecha) : "—"} sub={proximoTurno ? `${proximoTurno.turno.hora} · ${proximoTurno.mascota.nombre}` : "Nada agendado"} />
                {conVentas && (
                  <>
                    <Kpi label="Compras" valor={ventas === null ? "…" : formatCurrency(totalGastado)} sub={`${ventasValidas.length} venta${ventasValidas.length === 1 ? "" : "s"}`} />
                    <Kpi
                      label="Cuenta corriente"
                      valor={movimientos === null ? "…" : formatCurrency(saldo)}
                      sub={saldo > 0 ? "Debe" : saldo < 0 ? "A favor" : "Al día"}
                      tono={saldo > 0 ? "rojo" : undefined}
                    />
                  </>
                )}
              </div>
            </DialogHeader>

            {/* ── Pestañas ── */}
            <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
              <TabsList className={`mx-6 mt-3 grid shrink-0 ${conVentas ? "grid-cols-5" : "grid-cols-3"}`}>
                <TabsTrigger value="resumen">Datos</TabsTrigger>
                <TabsTrigger value="mascotas">Mascotas</TabsTrigger>
                <TabsTrigger value="turnos">Turnos</TabsTrigger>
                {conVentas && <TabsTrigger value="compras">Compras</TabsTrigger>}
                {conVentas && <TabsTrigger value="ctacte">Cta. cte.</TabsTrigger>}
              </TabsList>

              <ScrollArea className="min-h-0 flex-1 px-6 py-4">
                {/* Datos */}
                <TabsContent value="resumen" className="mt-0 space-y-5">
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <Dato label="Teléfono" valor={cliente.telefono || "—"} />
                    <Dato label="Email" valor={cliente.email || "—"} />
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Domicilio</dt>
                      <dd className="mt-0.5">
                        {cliente.domicilio ? (
                          <a href={mapsUrl(cliente.domicilio)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-700 hover:underline dark:text-emerald-400">
                            <MapPin className="h-3.5 w-3.5" /> {cliente.domicilio} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                  </dl>

                  {/* Fiscal */}
                  <div className="rounded-xl border p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-violet-600" />
                      <h4 className="text-sm font-semibold">Datos fiscales</h4>
                      <span className="text-xs text-muted-foreground">para la factura electrónica</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="perfil-cuit" className="text-xs">CUIT</Label>
                        <Input id="perfil-cuit" value={fiscal.cuit} onChange={(e) => setFiscal({ ...fiscal, cuit: e.target.value })} placeholder="Solo si pide Factura A" className="h-9" disabled={readOnly} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="perfil-iva" className="text-xs">Condición frente al IVA</Label>
                        <select
                          id="perfil-iva"
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={fiscal.condicionIva}
                          onChange={(e) => setFiscal({ ...fiscal, condicionIva: e.target.value as CondicionIvaCliente })}
                          disabled={readOnly}
                        >
                          {CONDICIONES_IVA_CLIENTE.map((c) => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {fiscalCambio && (
                      <Button size="sm" className="mt-3 bg-violet-600 hover:bg-violet-700" onClick={guardarFiscal} disabled={guardandoFiscal || readOnly}>
                        {guardandoFiscal ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                        Guardar datos fiscales
                      </Button>
                    )}
                  </div>

                  {/* Historial de cambios */}
                  {cliente.historialDatos && cliente.historialDatos.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <History className="h-4 w-4 text-muted-foreground" />
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cambios anteriores</h4>
                      </div>
                      <ul className="space-y-1.5">
                        {[...cliente.historialDatos].reverse().slice(0, 8).map((h, i) => (
                          <li key={i} className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                            <div className="flex justify-between">
                              <span className="font-semibold capitalize">{h.campo}</span>
                              <span className="text-muted-foreground">{fechaCorta(h.fechaCambio)}</span>
                            </div>
                            <p className="text-muted-foreground">
                              {h.valorAnterior || "—"} → <span className="text-foreground">{h.valorNuevo || "—"}</span>
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </TabsContent>

                {/* Mascotas */}
                <TabsContent value="mascotas" className="mt-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {cliente.mascotas?.length ? `${cliente.mascotas.length} mascota${cliente.mascotas.length === 1 ? "" : "s"}` : "Sin mascotas registradas"}
                    </p>
                    {cliente.dni?.trim() && !readOnly && (
                      <Button variant="outline" size="sm" onClick={() => onAgregarMascota(cliente.dni ?? "")}>
                        <PawPrint className="mr-1.5 h-3.5 w-3.5" /> Agregar mascota
                      </Button>
                    )}
                  </div>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {(cliente.mascotas ?? []).map((m) => (
                      <li key={m.id} className="flex items-center gap-3 rounded-xl border p-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                          <PawPrint className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{m.nombre}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[m.tipo, m.raza, m.edad, m.sexo].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        {m.libretaToken && (
                          <a
                            href={`/${tenantId}/libreta/${m.libretaToken}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted"
                            title="Abrir libreta sanitaria"
                          >
                            <QrCode className="h-4 w-4" />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </TabsContent>

                {/* Turnos */}
                <TabsContent value="turnos" className="mt-0">
                  {turnos === null ? (
                    <Cargando />
                  ) : turnos.length === 0 ? (
                    <Vacio texto="Todavía no tiene turnos." />
                  ) : (
                    <ul className="divide-y rounded-xl border">
                      {turnos.slice(0, 30).map((t) => (
                        <li key={t.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                          <div className="w-24 shrink-0">
                            <p className="font-medium">{fechaCorta(t.turno.fecha)}</p>
                            <p className="text-xs text-muted-foreground">{t.turno.hora}</p>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate">{t.servicio || "Consulta"} · <span className="text-muted-foreground">{t.mascota.nombre}</span></p>
                            {t.diagnostico && <p className="truncate text-xs text-muted-foreground">{t.diagnostico}</p>}
                          </div>
                          <Badge className={`${ESTADO_TURNO[t.estado]} border-0 capitalize`}>{t.estado}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>

                {/* Compras */}
                {conVentas && (
                  <TabsContent value="compras" className="mt-0">
                    {ventas === null ? (
                      <Cargando />
                    ) : ventas.length === 0 ? (
                      <Vacio texto="Todavía no compró nada." />
                    ) : (
                      <ul className="divide-y rounded-xl border">
                        {ventas.map((v) => (
                          <li key={v.id} className={`flex items-center gap-3 px-3 py-2.5 text-sm ${v.estado === "anulada" ? "opacity-50" : ""}`}>
                            <div className="w-28 shrink-0">
                              <p className="font-medium">{v.esPagoCtaCte ? "Pago cta. cte." : `Remito ${String(v.numero).padStart(5, "0")}`}</p>
                              <p className="text-xs text-muted-foreground">{formatDateTime(v.createdAt)}</p>
                            </div>
                            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                              {(v.items ?? []).map((i) => i.nombre).join(", ") || v.medioPago}
                            </p>
                            <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(v.total)}</span>
                            {v.estado === "anulada" && <Badge variant="outline">Anulada</Badge>}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-2 text-right text-xs text-muted-foreground">
                      Remitos y facturas: <Link href={`/${tenantId}/admin/Ventas`} className="underline">historial de ventas</Link>
                    </p>
                  </TabsContent>
                )}

                {/* Cuenta corriente */}
                {conVentas && (
                  <TabsContent value="ctacte" className="mt-0 space-y-3">
                    <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${saldo > 0 ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "bg-muted/30"}`}>
                      <div className="flex items-center gap-2">
                        <Wallet className={`h-5 w-5 ${saldo > 0 ? "text-red-600" : "text-emerald-600"}`} />
                        <span className="text-sm font-medium">{saldo > 0 ? "Saldo deudor" : saldo < 0 ? "Saldo a favor" : "Al día"}</span>
                      </div>
                      <span className={`text-lg font-bold tabular-nums ${saldo > 0 ? "text-red-700 dark:text-red-400" : ""}`}>{formatCurrency(Math.abs(saldo))}</span>
                    </div>
                    {movimientos === null ? (
                      <Cargando />
                    ) : movimientos.length === 0 ? (
                      <Vacio texto="Sin movimientos de cuenta corriente." />
                    ) : (
                      <ul className="divide-y rounded-xl border">
                        {movimientos.map((m) => (
                          <li key={m.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                            <div className="w-28 shrink-0">
                              <p className="font-medium">{m.tipo === "venta" ? `Venta${m.ventaNumero ? ` #${m.ventaNumero}` : ""}` : "Pago"}</p>
                              <p className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</p>
                            </div>
                            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{m.observaciones}</p>
                            <span className={`shrink-0 font-semibold tabular-nums ${m.tipo === "venta" ? "text-red-600" : "text-emerald-600"}`}>
                              {m.tipo === "venta" ? "+" : "-"} {formatCurrency(m.monto)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {saldo > 0 && (
                      <p className="text-right text-xs">
                        <Link href={`/${tenantId}/admin/CuentaCorriente`} className="underline">Registrar un pago</Link>
                      </p>
                    )}
                  </TabsContent>
                )}
              </ScrollArea>
            </Tabs>

            <DialogFooter className="shrink-0 gap-2 border-t px-6 py-3 sm:gap-3">
              <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">Cerrar</Button>
              {!readOnly && (
                <Button onClick={() => onEditar(cliente)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 sm:flex-none">
                  <Edit className="mr-1.5 h-4 w-4" /> Editar datos
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Kpi({ label, valor, sub, tono }: { label: string; valor: string; sub?: string; tono?: "rojo" }) {
  return (
    <div className="rounded-xl border bg-white/70 px-3 py-2 dark:bg-slate-900/60">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`truncate text-base font-bold tabular-nums ${tono === "rojo" ? "text-red-700 dark:text-red-400" : ""}`}>{valor}</p>
      {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-all">{valor}</dd>
    </div>
  )
}

function Cargando() {
  return (
    <div className="flex justify-center py-8">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  )
}

function Vacio({ texto }: { texto: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{texto}</p>
}
