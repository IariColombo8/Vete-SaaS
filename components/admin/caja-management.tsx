"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Banknote, CreditCard, History, Loader2, Receipt, Repeat, Split, UserRound, Wallet,
} from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { CajaBar } from "./pos/caja-bar"
import { HistorialCajas } from "./ventas/historial-cajas"
import { HistorialVentas } from "./ventas/historial-ventas"
import { MiniResumen } from "./ventas/mini-resumen"
import {
  getCajaAbierta, getCajas, getResumenCaja, getVentas, type ResumenCaja,
} from "@/lib/supabase/ventas"
import { getTenantConfig } from "@/lib/supabase/queries"
import { formatCurrency, formatDateTime } from "@/lib/format"
import type { EmisorRemito } from "@/lib/ventas/remito"
import { MEDIOS_PAGO, type Caja, type MedioPago, type Venta } from "@/lib/supabase/types"

interface Props {
  tenantId: string
}

type Vista = "hoy" | "historial"

const ICONO_MEDIO: Record<MedioPago, React.ComponentType<{ className?: string }>> = {
  efectivo: Banknote,
  debito: CreditCard,
  credito: CreditCard,
  transferencia: Repeat,
  mixto: Split,
  cuenta_corriente: UserRound,
}

/** YYYY-MM-DD en hora local: `toISOString()` corre el día en Argentina. */
function hoyISO(): string {
  const hoy = new Date()
  const mes = String(hoy.getMonth() + 1).padStart(2, "0")
  const dia = String(hoy.getDate()).padStart(2, "0")
  return `${hoy.getFullYear()}-${mes}-${dia}`
}

/**
 * Caja: estado del turno actual y arqueo, en su propia sección.
 *
 * Estaba como una pestaña dentro de Ventas, pero abrir y cerrar caja es lo
 * primero y lo último que hace el mostrador todos los días — no es algo que se
 * busque adentro de un dashboard.
 *
 * El resumen en vivo se calcula sumando las ventas del turno, igual que hace
 * `cerrar_caja` en la base. Sirve para mirar cómo viene el día sin cerrar nada.
 */
export function CajaManagement({ tenantId }: Props) {
  const [vista, setVista] = useState<Vista>("hoy")
  const [caja, setCaja] = useState<Caja | null>(null)
  const [resumen, setResumen] = useState<ResumenCaja | null>(null)
  const [historial, setHistorial] = useState<Caja[]>([])
  const [ventasHoy, setVentasHoy] = useState<Venta[]>([])
  const [cargando, setCargando] = useState(true)
  const [emisor, setEmisor] = useState<EmisorRemito>({ nombre: "" })

  const cargar = useCallback(() => {
    setCargando(true)
    const hoy = hoyISO()

    Promise.all([
      getCajaAbierta(tenantId),
      getCajas(tenantId, 30),
      getVentas(tenantId, { desde: hoy, hasta: hoy, porPagina: 100 }),
    ])
      .then(async ([abierta, cajas, ventas]) => {
        setCaja(abierta)
        setHistorial(cajas)
        setVentasHoy(ventas.ventas)
        // El resumen solo tiene sentido con una caja abierta; las cerradas ya
        // tienen sus totales congelados en la fila.
        setResumen(abierta ? await getResumenCaja(abierta) : null)
      })
      .catch(() => toast.error("No se pudo cargar la caja"))
      .finally(() => setCargando(false))
  }, [tenantId])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    getTenantConfig(tenantId)
      .then((config) =>
        setEmisor({
          nombre: config?.nombre || "VetPanel",
          direccion: config?.direccion,
          telefono: config?.telefono,
          email: config?.email,
          logoUrl: config?.logo,
        }),
      )
      .catch(() => setEmisor({ nombre: "VetPanel" }))
  }, [tenantId])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-gradient-to-br from-emerald-50 via-sky-50/60 to-transparent p-4 dark:from-emerald-950/30 dark:via-sky-950/10">
        <div className="flex items-center gap-3">
          <div className="hidden rounded-xl bg-emerald-600 p-2.5 text-white shadow-sm sm:flex">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Caja</h1>
            <p className="text-sm text-muted-foreground">
              Apertura, arqueo y cierre del turno de mostrador
            </p>
          </div>
        </div>

        <div className="flex gap-0.5 rounded-lg border bg-background p-0.5 shadow-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVista("hoy")}
            className={cn(
              "gap-1.5",
              vista === "hoy" && "bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white",
            )}
          >
            <Receipt className="h-3.5 w-3.5" />
            Ventas de hoy
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVista("historial")}
            className={cn(
              "gap-1.5",
              vista === "historial" && "bg-sky-600 text-white hover:bg-sky-700 hover:text-white",
            )}
          >
            <History className="h-3.5 w-3.5" />
            Cierres anteriores
          </Button>
        </div>
      </div>

      <CajaBar tenantId={tenantId} caja={caja} onCambio={cargar} />

      {cargando ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : caja && resumen ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MEDIOS_PAGO.map(({ id, label }) => {
            const total = resumen.porMedioPago.find((m) => m.medio === id)?.total ?? 0
            const Icono = ICONO_MEDIO[id]
            return (
              <Tarjeta
                key={id}
                icono={<Icono className="h-4 w-4" />}
                titulo={label}
                valor={formatCurrency(total)}
                nota={
                  id === "efectivo"
                    ? `+ ${formatCurrency(caja.saldoInicial)} de apertura`
                    : id === "mixto"
                      ? "La parte en efectivo ya está sumada arriba"
                      : "No está en el cajón"
                }
              />
            )
          })}
          <Tarjeta
            icono={<Wallet className="h-4 w-4" />}
            titulo="Debería haber en caja"
            valor={formatCurrency(resumen.saldoEsperado)}
            nota={`${resumen.cantidadVentas} ventas · Apertura + efectivo`}
            destacada
          />
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Wallet className="mx-auto mb-3 h-8 w-8 opacity-40" />
            No hay ninguna caja abierta.
            <br />
            Abrí una para llevar el arqueo del turno.
          </CardContent>
        </Card>
      )}

      {vista === "hoy" ? (
        <Card className="overflow-hidden border-t-4 border-t-emerald-500">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-emerald-600" />
              Ventas de hoy
            </CardTitle>
            <CardDescription>
              {caja
                ? `Turno abierto el ${formatDateTime(caja.aperturaAt)}${caja.abiertaPorNombre ? ` por ${caja.abiertaPorNombre}` : ""}`
                : "Todas las ventas del día, con o sin caja abierta"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {!cargando && ventasHoy.length > 0 && <MiniResumen ventas={ventasHoy} />}
            <HistorialVentas
              ventas={ventasHoy}
              emisor={emisor}
              cargando={cargando}
              onCambio={cargar}
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="border-t-4 border-t-sky-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cierres anteriores</CardTitle>
            <CardDescription>Últimas 30 cajas, con la diferencia de arqueo</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <HistorialCajas tenantId={tenantId} cajas={historial} cargando={cargando} emisor={emisor} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Tarjeta({
  icono,
  titulo,
  valor,
  nota,
  destacada = false,
}: {
  icono: React.ReactNode
  titulo: string
  valor: string
  nota: string
  destacada?: boolean
}) {
  return (
    <Card className={destacada ? "border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20" : undefined}>
      <CardContent className="p-4">
        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          {icono} {titulo}
        </div>
        <p
          className={`text-2xl font-bold tabular-nums ${
            destacada ? "text-emerald-600 dark:text-emerald-400" : ""
          }`}
        >
          {valor}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>
      </CardContent>
    </Card>
  )
}
