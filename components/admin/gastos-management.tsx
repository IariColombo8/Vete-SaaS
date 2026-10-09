"use client"

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import {
  Ban, CalendarClock, Check, ChevronLeft, ChevronRight, HandCoins, Loader2, MoreHorizontal,
  Pencil, Plus, Receipt, RotateCcw, Trash2, Wallet, XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  AnularGastoDialog, DescontarCajaDialog, EditarGastoFijoDialog, MontosPorMesDialog, NuevoGastoDialog, hoyISO,
  type GastoUnicoInput,
} from "./gastos/gasto-dialogs"
import {
  actualizarGastoFijo, anularGasto, crearGastoFijo, darDeBajaGastoFijo, eliminarGastoDev,
  eliminarGastoFijo, getGastosDelMes, getGastosFijos, getMontosPorMes, guardarMontosPorMes,
  puedeEliminarGastos, reactivarGastoFijo,
  registrarGasto, type GastoFijoInput, type RegistrarGastoInput,
} from "@/lib/supabase/gastos"
import { abrirCaja, getCajaAbierta } from "@/lib/supabase/ventas"
import { correEnMes, mesDe, montoDelMes, nombreMes, sumarMeses } from "@/lib/gastos/meses"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format"
import { useReadOnly } from "@/lib/auth/read-only-context"
import type { Caja, Gasto, GastoFijo } from "@/lib/supabase/types"

interface Props {
  tenantId: string
}

type Dialogo =
  | { tipo: "nuevo" }
  | { tipo: "editar"; fijo: GastoFijo }
  | { tipo: "montos"; fijo: GastoFijo }
  | { tipo: "descontar"; pago: Omit<RegistrarGastoInput, "descontarDeCaja"> }
  | { tipo: "anular"; gasto: Gasto }
  | { tipo: "confirmar"; titulo: string; texto: string; accion: () => Promise<void> }

/** Meses de montos puntuales que se cargan, para la grilla "montos por mes". */
const MESES_GRILLA = 12

/**
 * Gastos del negocio, mirados mes por mes.
 *
 * Los fijos aparecen en cada mes en que corren, con el monto de ese mes (el
 * puntual si se cargó, si no el base) y se marcan pagados uno por uno. Los de
 * única vez se registran directo. En los dos casos, antes de registrar el pago
 * se pregunta si la plata sale de la caja abierta.
 */
export function GastosManagement({ tenantId }: Props) {
  const [mes, setMes] = useState(() => mesDe())
  const [fijos, setFijos] = useState<GastoFijo[]>([])
  const [montos, setMontos] = useState<Map<string, Map<string, number>>>(new Map())
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [caja, setCaja] = useState<Caja | null>(null)
  const [cargando, setCargando] = useState(true)
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const readOnly = useReadOnly()
  // Se resuelve después de montar: en el render del servidor no hay `window`,
  // y calcularlo directo daría un HTML distinto al del navegador.
  const modoDev = useSyncExternalStore(
    () => () => {},
    puedeEliminarGastos,
    () => false,
  )

  const cargar = useCallback(() => {
    setCargando(true)
    Promise.all([
      getGastosFijos(tenantId),
      getMontosPorMes(tenantId, mes, sumarMeses(mes, MESES_GRILLA - 1)),
      getGastosDelMes(tenantId, mes),
      getCajaAbierta(tenantId),
    ])
      .then(([f, m, g, c]) => {
        setFijos(f)
        setMontos(m)
        setGastos(g)
        setCaja(c)
      })
      .catch(() => toast.error("No se pudieron cargar los gastos"))
      .finally(() => setCargando(false))
  }, [tenantId, mes])

  useEffect(() => {
    cargar()
  }, [cargar])

  const fijosDelMes = useMemo(() => fijos.filter((f) => correEnMes(f, mes)), [fijos, mes])

  // Los anulados quedan guardados pero no cuentan en nada: se listan aparte.
  const vigentes = useMemo(() => gastos.filter((g) => !g.anuladoAt), [gastos])
  const anulados = useMemo(() => gastos.filter((g) => g.anuladoAt), [gastos])

  const pagoPorFijo = useMemo(() => {
    const mapa = new Map<string, Gasto>()
    for (const g of vigentes) if (g.gastoFijoId && g.mes === mes) mapa.set(g.gastoFijoId, g)
    return mapa
  }, [vigentes, mes])

  // Todo lo pagado que no es el pago de un fijo listado arriba: los de única
  // vez y los pagos de un fijo cuya plantilla ya se borró.
  const otros = useMemo(
    () => vigentes.filter((g) => !g.gastoFijoId || !fijosDelMes.some((f) => f.id === g.gastoFijoId)),
    [vigentes, fijosDelMes],
  )

  const totales = useMemo(() => {
    let pendiente = 0
    for (const f of fijosDelMes) {
      if (!pagoPorFijo.has(f.id)) pendiente += montoDelMes(f, mes, montos)
    }
    const pagado = vigentes.reduce((s, g) => s + g.monto, 0)
    const deCaja = vigentes.filter((g) => g.cajaId).reduce((s, g) => s + g.monto, 0)
    return { pendiente, pagado, deCaja, total: pagado + pendiente }
  }, [fijosDelMes, pagoPorFijo, vigentes, mes, montos])

  /** Envuelve una acción con el toast de error y la recarga. */
  const ejecutar = async (accion: () => Promise<void>, exito: string) => {
    try {
      await accion()
      toast.success(exito)
      setDialogo(null)
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar la operación")
    }
  }

  const pedirPagoUnico = (input: GastoUnicoInput) =>
    setDialogo({ tipo: "descontar", pago: { ...input } })

  const pedirPagoFijo = (f: GastoFijo) =>
    setDialogo({
      tipo: "descontar",
      pago: {
        descripcion: f.descripcion,
        categoria: f.categoria,
        monto: montoDelMes(f, mes, montos),
        fecha: hoyISO(),
        gastoFijoId: f.id,
        mes,
      },
    })

  const confirmar = (titulo: string, texto: string, accion: () => Promise<void>) =>
    setDialogo({ tipo: "confirmar", titulo, texto, accion })

  const pedirEliminar = (g: Gasto) =>
    confirmar(
      "Eliminar gasto (solo localhost)",
      `Se borra ${g.descripcion} (${formatCurrency(g.monto)}) de la base, sin dejar registro. ` +
        "Esto existe solo para limpiar pruebas: en producción los gastos solo se anulan.",
      () => ejecutar(() => eliminarGastoDev(g.id), "Gasto eliminado"),
    )

  const esMesActual = mes === mesDe()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-gradient-to-br from-emerald-50 via-sky-50/60 to-transparent p-4 dark:from-emerald-950/30 dark:via-sky-950/10">
        <div className="flex items-center gap-3">
          <div className="hidden rounded-xl bg-emerald-600 p-2.5 text-white shadow-sm sm:flex">
            <HandCoins className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gastos</h1>
            <p className="text-sm text-muted-foreground">
              Fijos de todos los meses y gastos por única vez
            </p>
          </div>
        </div>

        <Button
          onClick={() => setDialogo({ tipo: "nuevo" })}
          disabled={readOnly}
          title={readOnly ? "Reactivá tu cuenta para editar" : undefined}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="mr-2 h-4 w-4" /> Nuevo gasto
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-lg border bg-card px-2 py-1.5">
        <Button variant="ghost" size="icon" onClick={() => setMes(sumarMeses(mes, -1))} aria-label="Mes anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold capitalize">{nombreMes(mes)}</span>
          {!esMesActual && (
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setMes(mesDe())}>
              Ir al mes actual
            </Button>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMes(sumarMeses(mes, 1))} aria-label="Mes siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta titulo="Total del mes" valor={totales.total} nota="Pagado + pendiente" destacada />
        <Tarjeta titulo="Pagado" valor={totales.pagado} nota={`${vigentes.length} pagos registrados`} />
        <Tarjeta titulo="Pendiente" valor={totales.pendiente} nota="Gastos fijos sin pagar" />
        <Tarjeta titulo="Salió de la caja" valor={totales.deCaja} nota="Descontado del efectivo" />
      </div>

      {cargando ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <Card className="overflow-hidden border-t-4 border-t-emerald-500">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4 text-emerald-600" />
                Gastos fijos
              </CardTitle>
              <CardDescription>
                Se repiten todos los meses. Podés cambiar el monto de un mes puntual.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {fijosDelMes.length === 0 ? (
                <Vacio texto="No hay gastos fijos en este mes." />
              ) : (
                <ul className="divide-y">
                  {fijosDelMes.map((f) => {
                    const pago = pagoPorFijo.get(f.id)
                    const monto = pago ? pago.monto : montoDelMes(f, mes, montos)
                    const especial = !pago && montos.get(f.id)?.has(mes)
                    return (
                      <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium">{f.descripcion}</span>
                            {f.categoria && <Badge variant="secondary">{f.categoria}</Badge>}
                            {f.hastaMes === mes && <Badge variant="outline">Último mes</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {pago
                              ? `Pagado el ${formatDate(`${pago.fecha}T12:00:00`)}${pago.cajaId ? " · salió de la caja" : ""}`
                              : f.diaVencimiento
                                ? `Vence el día ${f.diaVencimiento}`
                                : "Pendiente"}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="font-semibold tabular-nums">{formatCurrency(monto)}</p>
                          {especial && (
                            <p className="text-xs text-muted-foreground">
                              base {formatCurrency(f.monto)}
                            </p>
                          )}
                        </div>

                        {pago ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600">
                            <Check className="mr-1 h-3 w-3" /> Pagado
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={readOnly}
                            onClick={() => pedirPagoFijo(f)}
                          >
                            Marcar pagado
                          </Button>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={readOnly} aria-label="Acciones">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDialogo({ tipo: "montos", fijo: f })}>
                              <CalendarClock className="mr-2 h-4 w-4" /> Montos por mes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDialogo({ tipo: "editar", fijo: f })}>
                              <Pencil className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                            {pago && (
                              <DropdownMenuItem onClick={() => setDialogo({ tipo: "anular", gasto: pago })}>
                                <Ban className="mr-2 h-4 w-4" /> Anular pago
                              </DropdownMenuItem>
                            )}
                            {pago && modoDev && (
                              <DropdownMenuItem
                                className="text-amber-600 focus:text-amber-600"
                                onClick={() => pedirEliminar(pago)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar pago (solo localhost)
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {f.hastaMes === mes ? (
                              <DropdownMenuItem
                                onClick={() => ejecutar(() => reactivarGastoFijo(f.id), "Gasto fijo reactivado")}
                              >
                                <RotateCcw className="mr-2 h-4 w-4" /> Seguir pagándolo
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() =>
                                  confirmar(
                                    "Dar de baja",
                                    `${f.descripcion} deja de aparecer después de ${nombreMes(mes)}. Los meses anteriores quedan como están.`,
                                    () => ejecutar(() => darDeBajaGastoFijo(f.id, mes), "Gasto fijo dado de baja"),
                                  )
                                }
                              >
                                <XCircle className="mr-2 h-4 w-4" /> Dar de baja después de este mes
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() =>
                                confirmar(
                                  "Eliminar gasto fijo",
                                  `Se borra ${f.descripcion} de todos los meses. Los pagos ya registrados quedan en el historial.`,
                                  () => ejecutar(() => eliminarGastoFijo(f.id), "Gasto fijo eliminado"),
                                )
                              }
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-t-4 border-t-sky-500">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="h-4 w-4 text-sky-600" />
                Gastos por única vez
              </CardTitle>
              <CardDescription>Los gastos sueltos con fecha en {nombreMes(mes)}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {otros.length === 0 ? (
                <Vacio texto="No hay gastos por única vez en este mes." />
              ) : (
                <ul className="divide-y">
                  {otros.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{g.descripcion}</span>
                          {g.categoria && <Badge variant="secondary">{g.categoria}</Badge>}
                          {g.cajaId && (
                            <Badge variant="outline" className="gap-1">
                              <Wallet className="h-3 w-3" /> De caja
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(`${g.fecha}T12:00:00`)}
                          {g.registradoPorNombre ? ` · ${g.registradoPorNombre}` : ""}
                        </p>
                      </div>
                      <p className="font-semibold tabular-nums">{formatCurrency(g.monto)}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={readOnly}
                        onClick={() => setDialogo({ tipo: "anular", gasto: g })}
                      >
                        <Ban className="mr-1.5 h-3.5 w-3.5" /> Anular
                      </Button>
                      {modoDev && <BotonEliminarDev onClick={() => pedirEliminar(g)} />}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {anulados.length > 0 && (
            <Card className="overflow-hidden border-t-4 border-t-muted-foreground/30">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
                  <Ban className="h-4 w-4" />
                  Anulados
                </CardTitle>
                <CardDescription>Quedan guardados como registro, pero no suman en ningún total</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {anulados.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-muted-foreground">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium line-through">{g.descripcion}</span>
                          {g.mes && <Badge variant="outline">Fijo</Badge>}
                          {g.cajaId && <Badge variant="outline">De caja</Badge>}
                        </div>
                        <p className="text-xs">
                          Motivo: <span className="text-foreground">{g.anuladoMotivo}</span>
                        </p>
                        <p className="text-xs">
                          Anulado el {formatDateTime(g.anuladoAt)}
                          {g.anuladoPorNombre ? ` por ${g.anuladoPorNombre}` : ""}
                        </p>
                      </div>
                      <p className="font-semibold tabular-nums line-through">{formatCurrency(g.monto)}</p>
                      {modoDev && <BotonEliminarDev onClick={() => pedirEliminar(g)} />}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {dialogo?.tipo === "anular" && (
        <AnularGastoDialog
          gasto={dialogo.gasto}
          onCerrar={() => setDialogo(null)}
          onAnular={(motivo) => ejecutar(() => anularGasto(dialogo.gasto.id, motivo), "Gasto anulado")}
        />
      )}

      {dialogo?.tipo === "nuevo" && (
        <NuevoGastoDialog
          onCerrar={() => setDialogo(null)}
          onUnico={pedirPagoUnico}
          onFijo={(input: GastoFijoInput) =>
            ejecutar(() => crearGastoFijo(tenantId, input), "Gasto fijo creado")
          }
        />
      )}

      {dialogo?.tipo === "editar" && (
        <EditarGastoFijoDialog
          fijo={dialogo.fijo}
          onCerrar={() => setDialogo(null)}
          onGuardar={(input) => ejecutar(() => actualizarGastoFijo(dialogo.fijo.id, input), "Gasto fijo actualizado")}
        />
      )}

      {dialogo?.tipo === "montos" && (
        <MontosPorMesDialog
          fijo={dialogo.fijo}
          desde={mes}
          montosActuales={montos.get(dialogo.fijo.id) ?? new Map()}
          onCerrar={() => setDialogo(null)}
          onGuardar={(lista) =>
            ejecutar(() => guardarMontosPorMes(tenantId, dialogo.fijo.id, lista), "Montos guardados")
          }
        />
      )}

      {dialogo?.tipo === "descontar" && (
        <DescontarCajaDialog
          descripcion={dialogo.pago.descripcion}
          monto={dialogo.pago.monto}
          hayCajaAbierta={caja !== null}
          onCerrar={() => setDialogo(null)}
          onResponder={(descontar) =>
            ejecutar(
              () => registrarGasto(tenantId, { ...dialogo.pago, descontarDeCaja: descontar }),
              descontar ? "Gasto registrado y descontado de la caja" : "Gasto registrado",
            )
          }
          onAbrirCajaYGuardar={(saldoInicial) =>
            ejecutar(async () => {
              await abrirCaja(tenantId, saldoInicial)
              // Si falla el gasto, la caja ya quedó abierta: la recarga de
              // `ejecutar` no corre, así que se refresca a mano para que el
              // diálogo pase a ofrecer "Sí, sale de la caja".
              try {
                await registrarGasto(tenantId, { ...dialogo.pago, descontarDeCaja: true })
              } catch (e) {
                cargar()
                throw e
              }
            }, "Caja abierta y gasto descontado")
          }
        />
      )}

      <AlertDialog
        open={dialogo?.tipo === "confirmar"}
        onOpenChange={(o) => !o && setDialogo(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogo?.tipo === "confirmar" ? dialogo.titulo : ""}</AlertDialogTitle>
            <AlertDialogDescription>{dialogo?.tipo === "confirmar" ? dialogo.texto : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (dialogo?.tipo === "confirmar") void dialogo.accion()
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

function Tarjeta({
  titulo,
  valor,
  nota,
  destacada = false,
}: {
  titulo: string
  valor: number
  nota: string
  destacada?: boolean
}) {
  return (
    <Card className={destacada ? "border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20" : undefined}>
      <CardContent className="p-4">
        <p className="mb-1 text-xs text-muted-foreground">{titulo}</p>
        <p
          className={`text-2xl font-bold tabular-nums ${
            destacada ? "text-emerald-600 dark:text-emerald-400" : ""
          }`}
        >
          {formatCurrency(valor)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>
      </CardContent>
    </Card>
  )
}

/** Borrado real, solo en localhost. En ámbar para que no se confunda con "Anular". */
function BotonEliminarDev({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950/30"
      title="Solo en localhost: borra el gasto sin dejar registro"
      onClick={onClick}
    >
      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Eliminar
    </Button>
  )
}

function Vacio({ texto }: { texto: string }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{texto}</p>
}
