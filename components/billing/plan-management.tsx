"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, CreditCard, Loader2, RefreshCw, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { PLAN_RECOMENDADO, formatPesos, formatPrecioPlan, getPlan, getPlanList, getTrialStatus, type PlanId } from "@/lib/plans"
import { cargarPlanes } from "@/lib/supabase/planes"
import { getPagosManuales } from "@/lib/supabase/pagos-manuales"
import {
  DIA_VENCIMIENTO, MEDIOS_PAGO_MANUAL, estadoCobroManual, nombreMes, proximoPeriodoImpago, sumarMeses, ultimoPago,
  type PagoManual,
} from "@/lib/billing/cobro-manual"
import { inicioDebito } from "@/lib/billing/dia-debito"
import {
  cancelarSuscripcion,
  getEstadoBilling,
  type EstadoBilling,
} from "@/components/billing/use-billing"
import { CheckoutDialog } from "@/components/billing/checkout-dialog"

interface Props {
  tenantId: string
}

function formatFecha(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })
}

const ESTADO_SUSCRIPCION: Record<string, { label: string; className: string }> = {
  authorized: { label: "Activa", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  pending: { label: "Pago pendiente", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  paused: { label: "Pausada", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  cancelled: { label: "Cancelada", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
}

/**
 * Pestaña "Plan" de Configuración: qué plan tiene la veterinaria, cómo está la
 * suscripción de Mercado Pago, y los movimientos posibles: contratar un plan
 * (al terminar la prueba o tras una baja), cambiar de plan, o cancelar.
 */
export function PlanManagement({ tenantId }: Props) {
  const { toast } = useToast()
  const [estado, setEstado] = useState<EstadoBilling | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<PlanId | "cancelar" | "sync" | null>(null)
  const [confirmar, setConfirmar] = useState<"cancelar" | PlanId | null>(null)
  const [planCheckout, setPlanCheckout] = useState<PlanId | null>(null)
  const [pagosManuales, setPagosManuales] = useState<PagoManual[]>([])

  const cargar = useCallback(
    async (sync = false) => {
      try {
        setErrorCarga(null)
        // El catálogo (precios, planes nuevos) puede haber cambiado desde el superadmin.
        const [nuevo] = await Promise.all([getEstadoBilling(tenantId, sync), cargarPlanes()])
        setEstado(nuevo)
        if (nuevo.cobroManual) setPagosManuales(await getPagosManuales(tenantId))
      } catch (error) {
        setErrorCarga(error instanceof Error ? error.message : "No se pudo leer el estado del plan")
        toast({
          title: "No se pudo leer el plan",
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        })
      } finally {
        setCargando(false)
        setOcupado(null)
      }
    },
    [tenantId, toast],
  )

  useEffect(() => {
    cargar()
  }, [cargar])

  // El checkout pasa por `CheckoutDialog`, que pide el email de Mercado Pago.
  function contratar(plan: PlanId) {
    setPlanCheckout(plan)
  }

  async function cancelar() {
    setOcupado("cancelar")
    try {
      await cancelarSuscripcion(tenantId)
      toast({ title: "Suscripción cancelada", description: "No se harán más cobros. El panel queda en solo lectura hasta que contrates un plan." })
      window.location.reload()
    } catch (error) {
      toast({
        title: "No se pudo cancelar",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      })
      setOcupado(null)
    }
  }

  if (cargando) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Sin estado y sin estar cargando: la lectura falló. Antes quedaba el
  // spinner para siempre y el error solo pasaba por un toast que se iba.
  if (!estado) {
    return (
      <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm font-semibold text-foreground">No se pudo leer el plan</p>
        <p className="max-w-md text-xs text-muted-foreground">{errorCarga}</p>
        <Button variant="outline" size="sm" onClick={() => { setCargando(true); void cargar() }}>
          <RefreshCw className="mr-2 h-4 w-4" /> Reintentar
        </Button>
      </div>
    )
  }

  const plan = getPlan(estado.plan)
  // Recomendado primero: es el botón principal cuando no hay suscripción.
  const contratables = [...getPlanList()].sort(
    (a, b) => Number(b.id === PLAN_RECOMENDADO) - Number(a.id === PLAN_RECOMENDADO),
  )
  const trial = getTrialStatus({ trialExpiresAt: estado.trialExpiresAt })
  const sus = estado.suscripcion
  const susActiva = sus?.status === "authorized"
  const susPendiente = sus?.status === "pending" || estado.checkoutPendiente
  const estadoSus = sus?.status ? ESTADO_SUSCRIPCION[sus.status] : undefined
  const enPrueba = trial.enTrial && !trial.vencido && !susActiva
  const bloqueado = trial.vencido && !susActiva

  return (
    <div className="space-y-6">
      {/* Las que pagan en efectivo no usan Mercado Pago: sin botones de contratar ni cancelar. */}
      {estado.cobroManual ? (
        <TarjetaCobroManual
          planNombre={plan.nombre}
          pagos={pagosManuales}
          checkoutPendiente={susPendiente}
          puedeDebitar={estado.mercadoPagoConfigurado && plan.visible}
          onDebito={() => contratar(estado.plan)}
        />
      ) : (
      <>
      {/* ── Plan actual ── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                Plan {plan.nombre}
                {enPrueba && (
                  <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                    Prueba gratis · {trial.diasRestantes} día{trial.diasRestantes === 1 ? "" : "s"}
                  </Badge>
                )}
                {bloqueado && <Badge variant="destructive">Sin suscripción</Badge>}
                {estadoSus && !bloqueado && <Badge className={estadoSus.className}>{estadoSus.label}</Badge>}
              </CardTitle>
              <CardDescription>
                {formatPrecioPlan(estado.plan)} por mes, se debita con Mercado Pago del 1 al 10 de cada mes. Cancelás
                cuando quieras.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOcupado("sync")
                cargar(true)
              }}
              disabled={ocupado !== null}
              title="Volver a consultar el estado en Mercado Pago"
            >
              {ocupado === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {susActiva && sus && (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Próximo cobro</dt>
                <dd className="font-medium">{formatFecha(sus.proximoCobro)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Cuenta de Mercado Pago</dt>
                <dd className="font-medium">{sus.payerEmail ?? "—"}</dd>
              </div>
            </dl>
          )}

          {susPendiente && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Hay un pago iniciado que Mercado Pago todavía no confirmó. Si ya pagaste, tocá el botón de
              actualizar; si no, podés volver a intentarlo.
            </p>
          )}

          {enPrueba && (
            <p className="text-sm text-muted-foreground">
              Estás probando Pro gratis hasta el <strong>{formatFecha(estado.trialExpiresAt)}</strong>. Antes de esa
              fecha elegí el plan con el que seguís; si no, el panel queda en solo lectura (nada se borra) hasta que
              contrates uno. No se cobra nada sin que lo confirmes.
            </p>
          )}

          {bloqueado && (
            <p className="text-sm text-muted-foreground">
              El panel está en solo lectura. Contratá un plan para seguir operando: la plata se cobra con tu
              cuenta de Mercado Pago, todos los meses, y podés cancelar cuando quieras.
            </p>
          )}

          {!estado.mercadoPagoConfigurado && (
            <p className="text-xs text-muted-foreground">Los pagos online todavía no están habilitados en este servidor.</p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {!susActiva &&
              contratables.map((p) => (
                <Button
                  key={p.id}
                  onClick={() => contratar(p.id)}
                  disabled={ocupado !== null || !estado.mercadoPagoConfigurado}
                  className={p.id === PLAN_RECOMENDADO ? "bg-emerald-600 hover:bg-emerald-700" : undefined}
                  variant={p.id === PLAN_RECOMENDADO ? "default" : "outline"}
                >
                  {ocupado === p.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    p.id === PLAN_RECOMENDADO && <CreditCard className="mr-2 h-4 w-4" />
                  )}
                  Contratar {p.nombre} · {formatPrecioPlan(p.id)}/mes
                </Button>
              ))}
            {susActiva && (
              <>
                {contratables
                  .filter((p) => p.id !== estado.plan)
                  .map((p) => (
                    <Button
                      key={p.id}
                      onClick={() => setConfirmar(p.id)}
                      disabled={ocupado !== null || !estado.mercadoPagoConfigurado}
                      className={p.id === PLAN_RECOMENDADO ? "bg-emerald-600 hover:bg-emerald-700" : undefined}
                      variant={p.id === PLAN_RECOMENDADO ? "default" : "outline"}
                    >
                      {ocupado === p.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Cambiar a {p.nombre} · {formatPrecioPlan(p.id)}/mes
                    </Button>
                  ))}
                <Button variant="ghost" onClick={() => setConfirmar("cancelar")} disabled={ocupado !== null}>
                  {ocupado === "cancelar" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Cancelar suscripción
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      </>
      )}

      {/* ── Comparación ── */}
      <div className={`grid gap-4 sm:grid-cols-2 ${contratables.length > 2 ? "lg:grid-cols-3" : ""}`}>
        {getPlanList().map((p) => {
          const esActual = p.id === estado.plan
          return (
            <Card key={p.id} className={esActual ? "border-emerald-500/50" : undefined}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    {p.id === PLAN_RECOMENDADO && <Sparkles className="h-4 w-4 text-violet-500" />}
                    {p.nombre}
                  </span>
                  {esActual && <Badge variant="secondary">Tu plan</Badge>}
                </CardTitle>
                <CardDescription>{formatPrecioPlan(p.id)}/mes</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {p.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      {h}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <AlertDialog open={confirmar !== null} onOpenChange={(abierto) => !abierto && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmar === "cancelar"
                ? "¿Cancelar la suscripción?"
                : `¿Cambiar al plan ${confirmar ? getPlan(confirmar).nombre : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar === "cancelar"
                ? "Se cancela en Mercado Pago y no se hacen más cobros. El panel queda en solo lectura (nada se borra) hasta que contrates un plan de nuevo."
                : confirmar
                  ? `Vas a pagar ${formatPrecioPlan(confirmar)} por mes. Te lleva al checkout de Mercado Pago; cuando se confirme el pago, la suscripción anterior se cancela sola. Las secciones que no incluya ${getPlan(confirmar).nombre} quedan ocultas, pero nada se borra.`
                  : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const accion = confirmar
                setConfirmar(null)
                if (accion === "cancelar") cancelar()
                else if (accion) contratar(accion)
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CheckoutDialog tenantId={tenantId} plan={planCheckout} onClose={() => setPlanCheckout(null)} />
    </div>
  )
}

/** Plan actual de una veterinaria que paga en efectivo/transferencia directo a VetPanel. */
function TarjetaCobroManual({
  planNombre,
  pagos,
  checkoutPendiente,
  puedeDebitar,
  onDebito,
}: {
  planNombre: string
  pagos: PagoManual[]
  checkoutPendiente: boolean
  puedeDebitar: boolean
  /** Abre el checkout de Mercado Pago para pasar al débito automático. */
  onDebito: () => void
}) {
  const ahora = new Date()
  const estado = estadoCobroManual(pagos, ahora)
  const ultimo = ultimoPago(pagos)
  const proximo = estado.fase === "pagado" ? sumarMeses(estado.periodo, 1) : estado.periodo
  // Misma regla que usa el checkout para fijar el primer débito.
  const primerDebito = inicioDebito(ahora, proximoPeriodoImpago(pagos, ahora))
  const badge =
    estado.fase === "pagado"
      ? { label: "Al día", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" }
      : estado.fase === "atrasado"
        ? { label: "Pago atrasado", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" }
        : { label: `Vence el ${DIA_VENCIMIENTO}`, className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Plan {planNombre}
          <Badge className={badge.className}>{badge.label}</Badge>
        </CardTitle>
        <CardDescription>
          Pagás directo a VetPanel, en efectivo o por transferencia, del 1 al {DIA_VENCIMIENTO} de cada mes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Último pago</dt>
            <dd className="font-medium">
              {ultimo
                ? `${nombreMes(ultimo.periodo)} · ${formatPesos(ultimo.monto)} · ${MEDIOS_PAGO_MANUAL.find((m) => m.id === ultimo.medio)?.label.toLowerCase()}`
                : "Todavía no hay pagos registrados"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Próximo vencimiento</dt>
            <dd className="font-medium">{DIA_VENCIMIENTO} de {nombreMes(proximo)}</dd>
          </div>
        </dl>

        <div className="mt-4 space-y-3 rounded-lg border bg-muted/30 p-4">
          <div>
            <p className="text-sm font-semibold">Débito automático con Mercado Pago</p>
            <p className="text-sm text-muted-foreground">
              Te olvidás de pagar a mano: se debita solo del 1 al {DIA_VENCIMIENTO} de cada mes. Los meses que ya
              pagaste no se cobran de nuevo:{" "}
              {primerDebito
                ? `el primer débito es el 1 de ${nombreMes(primerDebito.slice(0, 10))}`
                : "el primer débito (el de este mes) se hace al confirmar"}
              . Cancelás cuando quieras.
            </p>
          </div>
          {checkoutPendiente && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Hay una suscripción iniciada que Mercado Pago todavía no confirmó. Si ya la confirmaste, tocá
              actualizar en un rato; si no, podés volver a intentarlo.
            </p>
          )}
          <Button onClick={onDebito} disabled={!puedeDebitar} className="bg-emerald-600 hover:bg-emerald-700">
            <CreditCard className="mr-2 h-4 w-4" />
            Suscribirme con Mercado Pago
          </Button>
          {!puedeDebitar && (
            <p className="text-xs text-muted-foreground">El débito automático todavía no está habilitado para tu plan.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
