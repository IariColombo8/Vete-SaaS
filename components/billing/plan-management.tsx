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
import { PLANS, PLAN_LIST, formatPrecioPlan, getTrialStatus, type PlanId } from "@/lib/plans"
import {
  cancelarSuscripcion,
  getEstadoBilling,
  iniciarCheckout,
  type EstadoBilling,
} from "@/components/billing/use-billing"

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
  const [ocupado, setOcupado] = useState<PlanId | "cancelar" | "sync" | null>(null)
  const [confirmar, setConfirmar] = useState<"cancelar" | PlanId | null>(null)

  const cargar = useCallback(
    async (sync = false) => {
      try {
        setEstado(await getEstadoBilling(tenantId, sync))
      } catch (error) {
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

  async function contratar(plan: PlanId) {
    setOcupado(plan)
    try {
      window.location.href = await iniciarCheckout(tenantId, plan)
    } catch (error) {
      toast({
        title: "No se pudo iniciar el pago",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      })
      setOcupado(null)
    }
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

  if (cargando || !estado) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const plan = PLANS[estado.plan]
  const trial = getTrialStatus({ trialExpiresAt: estado.trialExpiresAt })
  const sus = estado.suscripcion
  const susActiva = sus?.status === "authorized"
  const susPendiente = sus?.status === "pending" || estado.checkoutPendiente
  const estadoSus = sus?.status ? ESTADO_SUSCRIPCION[sus.status] : undefined
  const enPrueba = trial.enTrial && !trial.vencido && !susActiva
  const bloqueado = trial.vencido && !susActiva
  const otroPlan: PlanId = estado.plan === "pro" ? "basico" : "pro"

  return (
    <div className="space-y-6">
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
                {formatPrecioPlan(estado.plan)} por mes, se cobra con Mercado Pago. Cancelás cuando quieras.
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
              El panel está en solo lectura. Contratá Básico o Pro para seguir operando: la plata se cobra con tu
              cuenta de Mercado Pago, todos los meses, y podés cancelar cuando quieras.
            </p>
          )}

          {!estado.mercadoPagoConfigurado && (
            <p className="text-xs text-muted-foreground">Los pagos online todavía no están habilitados en este servidor.</p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {!susActiva && (
              <>
                <Button
                  onClick={() => contratar("pro")}
                  disabled={ocupado !== null || !estado.mercadoPagoConfigurado}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {ocupado === "pro" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                  Contratar Pro · {formatPrecioPlan("pro")}/mes
                </Button>
                <Button
                  variant="outline"
                  onClick={() => contratar("basico")}
                  disabled={ocupado !== null || !estado.mercadoPagoConfigurado}
                >
                  {ocupado === "basico" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Contratar Básico · {formatPrecioPlan("basico")}/mes
                </Button>
              </>
            )}
            {susActiva && (
              <>
                <Button
                  onClick={() => setConfirmar(otroPlan)}
                  disabled={ocupado !== null || !estado.mercadoPagoConfigurado}
                  className={otroPlan === "pro" ? "bg-emerald-600 hover:bg-emerald-700" : undefined}
                  variant={otroPlan === "pro" ? "default" : "outline"}
                >
                  {ocupado === otroPlan && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Cambiar a {PLANS[otroPlan].nombre} · {formatPrecioPlan(otroPlan)}/mes
                </Button>
                <Button variant="ghost" onClick={() => setConfirmar("cancelar")} disabled={ocupado !== null}>
                  {ocupado === "cancelar" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Cancelar suscripción
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Comparación ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {PLAN_LIST.map((p) => {
          const esActual = p.id === estado.plan
          return (
            <Card key={p.id} className={esActual ? "border-emerald-500/50" : undefined}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    {p.id === "pro" && <Sparkles className="h-4 w-4 text-violet-500" />}
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
                : `¿Cambiar al plan ${confirmar ? PLANS[confirmar].nombre : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar === "cancelar"
                ? "Se cancela en Mercado Pago y no se hacen más cobros. El panel queda en solo lectura (nada se borra) hasta que contrates un plan de nuevo."
                : confirmar === "pro"
                  ? `Vas a pagar ${formatPrecioPlan("pro")} por mes. Te lleva al checkout de Mercado Pago; cuando se confirme el pago, la suscripción anterior se cancela sola y todas las secciones de Pro se habilitan.`
                  : `Vas a pagar ${formatPrecioPlan("basico")} por mes. Te lleva al checkout de Mercado Pago; cuando se confirme, la suscripción anterior se cancela sola. Las secciones de Pro quedan ocultas, pero nada se borra.`}
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
    </div>
  )
}
