"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Ban, Banknote, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Clock, CreditCard, History, RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { formatPesos, getPlan } from "@/lib/plans"
import type { TenantFull } from "@/lib/supabase/types"
import type { IngresoTenant } from "@/lib/superadmin/ingresos"
import {
  DIA_AVISO, DIA_VENCIMIENTO, MEDIOS_PAGO_MANUAL, diaDelMes, nombreMes, periodoActual, sumarMeses, ultimoPago,
  vigentes, type MedioPagoManual, type PagoManual,
} from "@/lib/billing/cobro-manual"
import { anularPagoManual, registrarPagoManual } from "@/lib/supabase/pagos-manuales"
import { updateTenantConfig } from "@/lib/supabase/queries"
import { cn } from "@/lib/utils"
import type { AccionPendiente } from "./confirmar-accion-dialog"

interface Props {
  tenants: TenantFull[]
  pagos: PagoManual[]
  ingresos: Record<string, IngresoTenant>
  ahora: Date
  cargando: boolean
  onCambio: () => void
  onPedirAccion: (accion: AccionPendiente) => void
}

type EstadoMes =
  | { tipo: "pagado"; pago: PagoManual }
  | { tipo: "pendiente" | "por_vencer" | "atrasado" | "no_pago" | "futuro" }
  | { tipo: "mercadopago"; activa: boolean }
  | { tipo: "sin_cobro" }

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${a.slice(2)}`
}

function hoyArgentina(ahora: Date): string {
  return new Date(ahora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function estadoDelMes(t: TenantFull, pagos: PagoManual[], periodo: string, ahora: Date, ingreso?: IngresoTenant): EstadoMes {
  if (!t.cobroManual) {
    if (t.mpPreapprovalStatus) return { tipo: "mercadopago", activa: ingreso?.pagando ?? false }
    return { tipo: "sin_cobro" }
  }
  const pago = pagos.find((p) => p.periodo === periodo && p.anuladoAt === null)
  if (pago) return { tipo: "pagado", pago }
  const actual = periodoActual(ahora)
  if (periodo > actual) return { tipo: "futuro" }
  if (periodo < actual) return { tipo: "no_pago" }
  const dia = diaDelMes(ahora)
  return { tipo: dia > DIA_VENCIMIENTO ? "atrasado" : dia >= DIA_AVISO ? "por_vencer" : "pendiente" }
}

function Pastilla({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", className)}>
      {children}
    </span>
  )
}

const VERDE = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
const AMBAR = "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
const ROJO = "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
const GRIS = "bg-muted text-muted-foreground"

function EtiquetaEstado({ estado }: { estado: EstadoMes }) {
  switch (estado.tipo) {
    case "pagado":
      return <Pastilla className={VERDE}><CheckCircle2 className="h-3 w-3" /> Pagó</Pastilla>
    case "pendiente":
      return <Pastilla className={GRIS}><Clock className="h-3 w-3" /> Pendiente</Pastilla>
    case "por_vencer":
      return <Pastilla className={AMBAR}><Clock className="h-3 w-3" /> Vence el {DIA_VENCIMIENTO}</Pastilla>
    case "atrasado":
      return <Pastilla className={ROJO}><CircleAlert className="h-3 w-3" /> Atrasado</Pastilla>
    case "no_pago":
      return <Pastilla className={ROJO}><CircleAlert className="h-3 w-3" /> No pagó</Pastilla>
    case "futuro":
      return <Pastilla className={GRIS}>Todavía no</Pastilla>
    case "mercadopago":
      return estado.activa
        ? <Pastilla className={VERDE}><CreditCard className="h-3 w-3" /> Suscripción activa</Pastilla>
        : <Pastilla className={ROJO}><CreditCard className="h-3 w-3" /> Suscripción caída</Pastilla>
    case "sin_cobro":
      return <Pastilla className={GRIS}>Sin forma de pago</Pastilla>
  }
}

interface FormPago {
  tenant: TenantFull
  periodo: string
  monto: string
  medio: MedioPagoManual
  pagadoEl: string
  nota: string
}

/**
 * Solapa "Pagos" del superadmin: quién pagó y quién no en cada mes, y el
 * registro de los pagos en efectivo/transferencia (`pagos_manuales`). Las que
 * pagan por Mercado Pago aparecen con el estado de su suscripción.
 */
export function GestionPagos({ tenants, pagos, ingresos, ahora, cargando, onCambio, onPedirAccion }: Props) {
  const actual = periodoActual(ahora)
  const [periodo, setPeriodo] = useState(actual)
  const [form, setForm] = useState<FormPago | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [historial, setHistorial] = useState<TenantFull | null>(null)
  const [anulando, setAnulando] = useState<PagoManual | null>(null)
  const [motivo, setMotivo] = useState("")

  const pagosPorTenant = useMemo(() => {
    const m = new Map<string, PagoManual[]>()
    for (const p of pagos) m.set(p.tenantId, [...(m.get(p.tenantId) ?? []), p])
    return m
  }, [pagos])

  // Las que pagan en efectivo primero; adentro, las que deben primero.
  const filas = useMemo(() => {
    const orden: Record<EstadoMes["tipo"], number> = {
      atrasado: 0, no_pago: 1, por_vencer: 2, pendiente: 3, futuro: 4, pagado: 5, mercadopago: 6, sin_cobro: 7,
    }
    return tenants
      .map((t) => ({ t, estado: estadoDelMes(t, pagosPorTenant.get(t.slug) ?? [], periodo, ahora, ingresos[t.slug]) }))
      .sort((a, b) => orden[a.estado.tipo] - orden[b.estado.tipo] || (a.t.nombre ?? a.t.slug).localeCompare(b.t.nombre ?? b.t.slug))
  }, [tenants, pagosPorTenant, periodo, ahora, ingresos])

  const manuales = filas.filter((f) => f.t.cobroManual)
  const pagaron = manuales.filter((f) => f.estado.tipo === "pagado")
  const cobrado = pagaron.reduce((acc, f) => acc + (f.estado.tipo === "pagado" ? f.estado.pago.monto : 0), 0)
  const faltan = manuales.filter((f) => f.estado.tipo !== "pagado" && f.estado.tipo !== "futuro")
  const porCobrar = faltan.reduce((acc, f) => acc + montoSugerido(f.t), 0)

  function montoSugerido(t: TenantFull): number {
    return ultimoPago(pagosPorTenant.get(t.slug) ?? [])?.monto ?? getPlan(t.plan).precioMensual
  }

  function abrirPago(t: TenantFull) {
    setForm({
      tenant: t,
      periodo,
      monto: String(montoSugerido(t)),
      medio: ultimoPago(pagosPorTenant.get(t.slug) ?? [])?.medio ?? "efectivo",
      pagadoEl: hoyArgentina(ahora),
      nota: "",
    })
  }

  async function guardarPago(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    const monto = Number(form.monto)
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error("El monto tiene que ser mayor a 0")
      return
    }
    setGuardando(true)
    try {
      await registrarPagoManual({
        tenantId: form.tenant.slug, periodo: form.periodo, monto, medio: form.medio,
        pagadoEl: form.pagadoEl, nota: form.nota,
      })
      toast.success(`Pago de ${nombreMes(form.periodo)} registrado para ${form.tenant.nombre ?? form.tenant.slug}`)
      setForm(null)
      onCambio()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar el pago")
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarAnulacion() {
    if (!anulando || !motivo.trim()) return
    setGuardando(true)
    try {
      await anularPagoManual(anulando.id, motivo)
      toast.success(`Pago de ${nombreMes(anulando.periodo)} anulado`)
      setAnulando(null)
      setMotivo("")
      onCambio()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo anular el pago")
    } finally {
      setGuardando(false)
    }
  }

  function pedirCambioForma(t: TenantFull) {
    const nombre = t.nombre ?? t.slug
    const aEfectivo = !t.cobroManual
    onPedirAccion({
      titulo: aEfectivo ? `${nombre} paga en efectivo` : `${nombre} deja de pagar en efectivo`,
      descripcion: aEfectivo ? (
        <p>
          Sus pagos los registrás vos acá, del 1 al {DIA_VENCIMIENTO} de cada mes. Desde el {DIA_AVISO}, si no está
          registrado, ve un aviso en su panel y le llega un email. También se le quita la prueba, si tenía.
        </p>
      ) : (
        <p>
          Deja de aparecer como pago en efectivo y no recibe más avisos. Los pagos ya registrados quedan en el
          historial. Para seguir usando VetPanel tiene que contratar con Mercado Pago desde su panel.
        </p>
      ),
      confirmar: aEfectivo ? "Paga en efectivo" : "Dejar de cobrar en efectivo",
      ejecutar: async () => {
        try {
          await updateTenantConfig(t.slug, aEfectivo ? { cobroManual: true, trialExpiresAt: null } : { cobroManual: false })
          toast.success(aEfectivo ? `${nombre} ahora paga en efectivo` : `${nombre} ya no paga en efectivo`)
          onCambio()
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "No se pudo guardar el cambio")
        }
      },
    })
  }

  // Meses para registrar: desde 6 atrás hasta 2 adelante (pago adelantado).
  const mesesFormulario = Array.from({ length: 9 }, (_, i) => sumarMeses(actual, i - 6)).reverse()
  const pagosHistorial = historial ? (pagosPorTenant.get(historial.slug) ?? []) : []

  return (
    <section aria-labelledby="titulo-pagos" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="titulo-pagos" className="text-lg font-bold">Pagos</h2>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Cada mes se paga del 1 al {DIA_VENCIMIENTO}. Desde el {DIA_AVISO}, a las que pagan en efectivo y no
            figuran pagas les aparece un aviso en su panel y les llega un email (a vos también). Su panel nunca se
            bloquea por esto.
          </p>
        </div>
        <div className="flex items-center gap-1 self-start rounded-lg border bg-card p-1 sm:self-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPeriodo((p) => sumarMeses(p, -1))} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[8.5rem] text-center text-sm font-semibold capitalize">{nombreMes(periodo)}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPeriodo((p) => sumarMeses(p, 1))} aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Pagaron</p>
          {cargando ? <Skeleton className="mt-2 h-9 w-20" /> : (
            <p className="mt-1 text-3xl font-extrabold tabular-nums">{pagaron.length} <span className="text-base font-medium text-muted-foreground">de {manuales.length}</span></p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Las que pagan en efectivo</p>
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Cobrado en {nombreMes(periodo).split(" ")[0]}</p>
          {cargando ? <Skeleton className="mt-2 h-9 w-28" /> : <p className="mt-1 text-3xl font-extrabold tabular-nums">{formatPesos(cobrado)}</p>}
          <p className="mt-1 text-xs text-muted-foreground">En efectivo y transferencia</p>
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Falta cobrar</p>
          {cargando ? <Skeleton className="mt-2 h-9 w-28" /> : <p className="mt-1 text-3xl font-extrabold tabular-nums">{formatPesos(porCobrar)}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {faltan.length === 0 ? "Nadie debe este mes" : `${faltan.length} ${faltan.length === 1 ? "veterinaria" : "veterinarias"}, al monto de su último pago`}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {cargando ? (
          <div className="space-y-3 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <ul className="divide-y">
            {filas.map(({ t, estado }) => {
              const nombre = t.nombre ?? t.slug
              return (
                <li key={t.slug} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{nombre}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.cobroManual ? (
                          <span className="inline-flex items-center gap-1"><Banknote className="h-3 w-3" /> Efectivo</span>
                        ) : t.mpPreapprovalStatus ? (
                          <span className="inline-flex items-center gap-1"><CreditCard className="h-3 w-3" /> Mercado Pago</span>
                        ) : null}
                        {" · "}Plan {getPlan(t.plan).nombre}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <EtiquetaEstado estado={estado} />
                      {estado.tipo === "pagado" && (
                        <span>
                          {formatPesos(estado.pago.monto)} · {MEDIOS_PAGO_MANUAL.find((m) => m.id === estado.pago.medio)?.label.toLowerCase()} · el {fechaCorta(estado.pago.pagadoEl)}
                          {estado.pago.nota && <> · {estado.pago.nota}</>}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
                    {t.cobroManual && estado.tipo !== "pagado" && (
                      <Button size="sm" onClick={() => abrirPago(t)} className="bg-emerald-600 hover:bg-emerald-700">
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Marcar pagado
                      </Button>
                    )}
                    {t.cobroManual && (
                      <Button size="sm" variant="outline" onClick={() => setHistorial(t)}>
                        <History className="mr-1.5 h-3.5 w-3.5" /> Historial
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => pedirCambioForma(t)} className="text-xs text-muted-foreground">
                      {t.cobroManual ? "No paga en efectivo" : "Paga en efectivo"}
                    </Button>
                  </div>
                </li>
              )
            })}
            {filas.length === 0 && <li className="p-8 text-center text-sm text-muted-foreground">No hay veterinarias.</li>}
          </ul>
        )}
      </div>

      {/* Registrar pago */}
      <Dialog open={form !== null} onOpenChange={(abierto) => { if (!abierto && !guardando) setForm(null) }}>
        <DialogContent className="sm:max-w-md">
          {form && (
            <form onSubmit={guardarPago} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Registrar pago</DialogTitle>
                <DialogDescription>{form.tenant.nombre ?? form.tenant.slug}</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pago-mes">Mes que paga</Label>
                  <Select value={form.periodo} onValueChange={(v) => setForm({ ...form, periodo: v })}>
                    <SelectTrigger id="pago-mes" className="capitalize"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {mesesFormulario.map((m) => {
                        const pagado = vigentes(pagosPorTenant.get(form.tenant.slug) ?? []).some((p) => p.periodo === m)
                        return (
                          <SelectItem key={m} value={m} disabled={pagado} className="capitalize">
                            {nombreMes(m)}{pagado ? " · pagado" : ""}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pago-monto">Monto</Label>
                  <Input
                    id="pago-monto" type="number" inputMode="numeric" min={1} step="any"
                    value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pago-medio">Medio</Label>
                  <Select value={form.medio} onValueChange={(v) => setForm({ ...form, medio: v as MedioPagoManual })}>
                    <SelectTrigger id="pago-medio"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MEDIOS_PAGO_MANUAL.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pago-fecha">Fecha en que pagó</Label>
                  <Input
                    id="pago-fecha" type="date" value={form.pagadoEl}
                    onChange={(e) => setForm({ ...form, pagadoEl: e.target.value })} required
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="pago-nota">Nota (opcional)</Label>
                  <Input
                    id="pago-nota" value={form.nota} placeholder="Ej.: pagó en el local"
                    onChange={(e) => setForm({ ...form, nota: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)} disabled={guardando}>Cancelar</Button>
                <Button type="submit" disabled={guardando} className="bg-emerald-600 hover:bg-emerald-700">
                  {guardando && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                  Registrar pago
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Historial */}
      <Dialog open={historial !== null} onOpenChange={(abierto) => { if (!abierto) { setHistorial(null); setAnulando(null) } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pagos de {historial?.nombre ?? historial?.slug}</DialogTitle>
            <DialogDescription>Un pago no se borra: si hubo un error, se anula con el motivo y se vuelve a cargar.</DialogDescription>
          </DialogHeader>
          {pagosHistorial.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay pagos registrados.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {pagosHistorial.map((p) => (
                <li key={p.id} className={cn("space-y-1 px-3 py-2.5 text-sm", p.anuladoAt && "opacity-60")}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium capitalize">{nombreMes(p.periodo)}</span>
                    <span className={cn("font-mono tabular-nums", p.anuladoAt && "line-through")}>{formatPesos(p.monto)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>
                      {MEDIOS_PAGO_MANUAL.find((m) => m.id === p.medio)?.label} · el {fechaCorta(p.pagadoEl)}
                      {p.nota && <> · {p.nota}</>}
                    </span>
                    {p.anuladoAt ? (
                      <span className="text-red-600 dark:text-red-400">Anulado: {p.motivoAnulacion}</span>
                    ) : (
                      <Button
                        variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-red-600"
                        onClick={() => { setAnulando(p); setMotivo("") }}
                      >
                        <Ban className="mr-1 h-3 w-3" /> Anular
                      </Button>
                    )}
                  </div>
                  {anulando?.id === p.id && (
                    <div className="flex gap-2 pt-1">
                      <Input
                        autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)}
                        placeholder="Motivo (obligatorio)" className="h-8 text-xs"
                      />
                      <Button size="sm" variant="destructive" className="h-8" disabled={!motivo.trim() || guardando} onClick={confirmarAnulacion}>
                        Anular
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setAnulando(null)}>No</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            {historial && (
              <Button onClick={() => { const t = historial; setHistorial(null); abrirPago(t) }} className="bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Registrar un pago
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
