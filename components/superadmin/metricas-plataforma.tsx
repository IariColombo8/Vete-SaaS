"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarClock, CircleDollarSign, RotateCcw, Stethoscope, TrendingUp, Wallet } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { formatPesos } from "@/lib/plans"
import type { ResumenIngresos } from "@/lib/superadmin/ingresos"
import {
  estimarMetas, proyectar, type PuntoMensual, type Supuestos,
} from "@/lib/superadmin/metricas"

interface Props {
  serie: PuntoMensual[]
  supuestosBase: Supuestos
  resumen: ResumenIngresos
  totalVeterinarias: number
  cargando: boolean
}

const MESES_PROYECCION = 12
const OBJETIVOS = [5, 10, 25, 50, 100]

// Azul / naranja: validados para daltonismo y contraste sobre la card, en claro y oscuro.
const configConteo = {
  veterinarias: { label: "Veterinarias registradas", theme: { light: "#2a78d6", dark: "#3987e5" } },
  pagantes: { label: "Veterinarias que pagan", theme: { light: "#eb6834", dark: "#d95926" } },
} satisfies ChartConfig

const configIngreso = {
  ingreso: { label: "Ingreso mensual", theme: { light: "#2a78d6", dark: "#3987e5" } },
} satisfies ChartConfig

interface Fila {
  etiqueta: string
  proyectado: boolean
  veterinariasReal?: number
  veterinariasProy?: number
  pagantesReal?: number
  pagantesProy?: number
  ingresoReal?: number
  ingresoProy?: number
}

/**
 * Real y proyección en series separadas: la real se dibuja llena y la
 * proyección punteada. El último mes real lleva los dos valores para que las
 * líneas queden unidas.
 */
function armarFilas(serie: PuntoMensual[], proyeccion: PuntoMensual[]): Fila[] {
  const reales: Fila[] = serie.map((p, i) => {
    const ultimo = i === serie.length - 1
    return {
      etiqueta: p.etiqueta,
      proyectado: false,
      veterinariasReal: p.veterinarias,
      pagantesReal: p.pagantes,
      ingresoReal: p.ingresoMensual,
      ...(ultimo ? { veterinariasProy: p.veterinarias, pagantesProy: p.pagantes, ingresoProy: p.ingresoMensual } : {}),
    }
  })
  const futuras: Fila[] = proyeccion.map((p) => ({
    etiqueta: p.etiqueta,
    proyectado: true,
    veterinariasProy: p.veterinarias,
    pagantesProy: p.pagantes,
    ingresoProy: p.ingresoMensual,
  }))
  return [...reales, ...futuras]
}

function formatCantidad(valor: number): string {
  return Number.isInteger(valor) ? String(valor) : valor.toLocaleString("es-AR", { maximumFractionDigits: 1 })
}

/** Cinco marcas redondas de 0 al máximo (sin datos, de 0 a $4.000 para no mostrar "$4"). */
function marcasPesos(maximo: number): number[] {
  const tramo = Math.max(maximo, 4000) / 4
  const unidad = 10 ** Math.floor(Math.log10(tramo))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * unidad).find((p) => p >= tramo) ?? 10 * unidad
  return [0, paso, paso * 2, paso * 3, paso * 4]
}

function formatPesosCorto(valor: number): string {
  if (valor >= 1_000_000) return `$${(valor / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M`
  if (valor >= 1_000) return `$${Math.round(valor / 1_000)} mil`
  return `$${valor}`
}

function Kpi({
  icono: Icono, titulo, valor, detalle, cargando,
}: {
  icono: React.ElementType
  titulo: string
  valor: string
  detalle: string
  cargando: boolean
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{titulo}</p>
        <Icono className="size-4 text-muted-foreground" aria-hidden />
      </div>
      {cargando ? (
        <Skeleton className="mt-3 h-9 w-24" />
      ) : (
        <p className="mt-2 text-3xl font-extrabold tabular-nums tracking-tight">{valor}</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>
    </div>
  )
}

function TooltipFila({
  active, payload, campos,
}: {
  active?: boolean
  payload?: { payload: Fila }[]
  campos: { real: keyof Fila; proy: keyof Fila; label: string; color: string; formato: (v: number) => string }[]
}) {
  if (!active || !payload?.length) return null
  const fila = payload[0].payload
  return (
    <div className="min-w-[180px] rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">
        {fila.etiqueta}
        {fila.proyectado && <span className="ml-1 font-normal text-muted-foreground">· proyección</span>}
      </p>
      {campos.map((c) => {
        const valor = (fila.proyectado ? fila[c.proy] : fila[c.real]) as number | undefined
        if (valor === undefined) return null
        return (
          <div key={c.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: c.color }} />
              {c.label}
            </span>
            <span className="font-mono font-medium tabular-nums">{c.formato(valor)}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Fuera del ChartContainer no existen las variables --color-*: el color va por clase. */
const AZUL = "bg-[#2a78d6] dark:bg-[#3987e5]"
const NARANJA = "bg-[#eb6834] dark:bg-[#d95926]"

function Leyenda({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={`h-0.5 w-4 rounded-full ${i.color}`} />
          {i.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="w-4 border-t-2 border-dashed border-muted-foreground" />
        proyección
      </span>
    </div>
  )
}

function CampoSupuesto({
  id, label, valor, sufijo, ayuda, onCambio, step = "any",
}: {
  id: string
  label: string
  valor: number
  sufijo?: string
  ayuda: string
  onCambio: (v: number) => void
  step?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min={0}
          step={step}
          value={Number.isFinite(valor) ? valor : ""}
          onChange={(e) => onCambio(Math.max(0, Number(e.target.value) || 0))}
          className={`h-9 tabular-nums ${sufijo ? "pr-8" : ""}`}
        />
        {sufijo && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {sufijo}
          </span>
        )}
      </div>
      <p className="text-[11px] leading-tight text-muted-foreground">{ayuda}</p>
    </div>
  )
}

/**
 * Solapa "Métricas" del superadmin: cómo viene creciendo la plataforma y a
 * dónde llega al ritmo actual. Los supuestos arrancan con los datos reales y
 * se pueden tocar para simular ("¿y si consigo 5 veterinarias por mes?").
 */
export function MetricasPlataforma({ serie, supuestosBase, resumen, totalVeterinarias, cargando }: Props) {
  const [supuestos, setSupuestos] = useState<Supuestos>(supuestosBase)
  useEffect(() => setSupuestos(supuestosBase), [supuestosBase])

  const ahora = useMemo(() => new Date(), [])
  const ultimo = useMemo(
    () => serie[serie.length - 1] ?? { veterinarias: totalVeterinarias, pagantes: resumen.pagantes },
    [serie, totalVeterinarias, resumen.pagantes],
  )
  const proyeccion = useMemo(() => proyectar(ultimo, supuestos, ahora, MESES_PROYECCION), [ultimo, supuestos, ahora])
  const filas = useMemo(() => armarFilas(serie, proyeccion), [serie, proyeccion])
  const metas = useMemo(() => estimarMetas(ultimo, supuestos, ahora, OBJETIVOS), [ultimo, supuestos, ahora])
  const enUnAnio = proyeccion[proyeccion.length - 1]
  const marcasIngreso = useMemo(
    () => marcasPesos(Math.max(0, ...filas.map((f) => Math.max(f.ingresoReal ?? 0, f.ingresoProy ?? 0)))),
    [filas],
  )
  const modificados = JSON.stringify(supuestos) !== JSON.stringify(supuestosBase)

  const cambiar = (campo: keyof Supuestos) => (valor: number) => setSupuestos((s) => ({ ...s, [campo]: valor }))

  return (
    <section aria-labelledby="titulo-metricas" className="space-y-6">
      <div>
        <h2 id="titulo-metricas" className="text-lg font-bold">Métricas</h2>
        <p className="max-w-2xl text-xs text-muted-foreground">
          El ingreso es lo que cobran hoy las suscripciones activas de Mercado Pago. La proyección sigue el ritmo de
          los últimos 3 meses; cambiá los supuestos para simular otros escenarios.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icono={Wallet}
          titulo="Ingreso mensual"
          valor={formatPesos(resumen.mensual)}
          detalle={resumen.pagantes === 1 ? "1 suscripción activa" : `${resumen.pagantes} suscripciones activas`}
          cargando={cargando}
        />
        <Kpi
          icono={CircleDollarSign}
          titulo="Ingreso anual"
          valor={formatPesos(resumen.anual)}
          detalle="Si las actuales siguen todo el año"
          cargando={cargando}
        />
        <Kpi
          icono={Stethoscope}
          titulo="Veterinarias que pagan"
          valor={`${resumen.pagantes} de ${totalVeterinarias}`}
          detalle={`Ticket promedio ${formatPesos(resumen.ticketPromedio)}`}
          cargando={cargando}
        />
        <Kpi
          icono={TrendingUp}
          titulo="En 12 meses, a este ritmo"
          valor={enUnAnio ? formatPesos(enUnAnio.ingresoMensual) : "—"}
          detalle={enUnAnio ? `por mes · ${formatCantidad(enUnAnio.pagantes)} pagando de ${formatCantidad(enUnAnio.veterinarias)}` : ""}
          cargando={cargando}
        />
      </div>

      {/* Supuestos */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">Supuestos de la proyección</h3>
            <p className="text-xs text-muted-foreground">
              {modificados ? "Simulación: estos valores no son los reales." : "Calculados con los datos reales de la plataforma."}
            </p>
          </div>
          {modificados && (
            <Button variant="outline" size="sm" onClick={() => setSupuestos(supuestosBase)} className="self-start">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Volver a los reales
            </Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CampoSupuesto
            id="sup-altas"
            label="Altas por mes"
            valor={supuestos.altasPorMes}
            ayuda="Veterinarias nuevas que se registran por mes."
            onCambio={cambiar("altasPorMes")}
          />
          <CampoSupuesto
            id="sup-conversion"
            label="Conversión"
            sufijo="%"
            valor={Math.round(supuestos.conversion * 100)}
            ayuda="De las que terminan la prueba, cuántas pagan."
            onCambio={(v) => cambiar("conversion")(Math.min(v, 100) / 100)}
            step="1"
          />
          <CampoSupuesto
            id="sup-bajas"
            label="Bajas por mes"
            sufijo="%"
            valor={Math.round(supuestos.bajaMensual * 1000) / 10}
            ayuda="De las que pagan, cuántas cancelan cada mes."
            onCambio={(v) => cambiar("bajaMensual")(Math.min(v, 100) / 100)}
          />
          <CampoSupuesto
            id="sup-ticket"
            label="Ticket mensual"
            sufijo="$"
            valor={supuestos.ticket}
            ayuda={resumen.pagantes > 0 ? "Lo que paga en promedio cada una." : "Sin pagos todavía: promedio de los planes."}
            onCambio={cambiar("ticket")}
            step="1000"
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Veterinarias y pagantes */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <h3 className="font-semibold">Veterinarias</h3>
          <p className="mb-3 text-xs text-muted-foreground">Registradas y pagando, al cierre de cada mes.</p>
          <Leyenda
            items={[
              { label: "Registradas", color: AZUL },
              { label: "Pagan", color: NARANJA },
            ]}
          />
          {cargando ? (
            <Skeleton className="mt-3 aspect-video w-full" />
          ) : (
            <ChartContainer config={configConteo} className="mt-3 aspect-video w-full">
              <LineChart data={filas} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                <ChartTooltip
                  content={(
                    <TooltipFila
                      campos={[
                        { real: "veterinariasReal", proy: "veterinariasProy", label: "Registradas", color: "var(--color-veterinarias)", formato: formatCantidad },
                        { real: "pagantesReal", proy: "pagantesProy", label: "Pagan", color: "var(--color-pagantes)", formato: formatCantidad },
                      ]}
                    />
                  )}
                />
                <Line dataKey="veterinariasReal" stroke="var(--color-veterinarias)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line dataKey="veterinariasProy" stroke="var(--color-veterinarias)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} />
                <Line dataKey="pagantesReal" stroke="var(--color-pagantes)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line dataKey="pagantesProy" stroke="var(--color-pagantes)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ChartContainer>
          )}
        </div>

        {/* Ingreso */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <h3 className="font-semibold">Ingreso mensual</h3>
          <p className="mb-3 text-xs text-muted-foreground">Lo que se cobra por mes, real y proyectado.</p>
          <Leyenda items={[{ label: "Ingreso", color: AZUL }]} />
          {cargando ? (
            <Skeleton className="mt-3 aspect-video w-full" />
          ) : (
            <ChartContainer config={configIngreso} className="mt-3 aspect-video w-full">
              <LineChart data={filas} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={formatPesosCorto} ticks={marcasIngreso} domain={[0, marcasIngreso[4]]} />
                <ChartTooltip
                  content={(
                    <TooltipFila
                      campos={[
                        { real: "ingresoReal", proy: "ingresoProy", label: "Ingreso", color: "var(--color-ingreso)", formato: formatPesos },
                      ]}
                    />
                  )}
                />
                <Line dataKey="ingresoReal" stroke="var(--color-ingreso)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line dataKey="ingresoProy" stroke="var(--color-ingreso)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ChartContainer>
          )}
        </div>
      </div>

      {/* Metas */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden />
          <div>
            <h3 className="font-semibold">¿Cuándo llego a…?</h3>
            <p className="text-xs text-muted-foreground">Mes estimado para cada cantidad de veterinarias pagando, con los supuestos de arriba.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-left font-semibold">Pagando</th>
                <th className="px-5 py-2.5 text-right font-semibold">Ingreso mensual</th>
                <th className="px-5 py-2.5 text-left font-semibold">Cuándo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {metas.map((m) => (
                <tr key={m.pagantes}>
                  <td className="px-5 py-2.5 font-semibold tabular-nums">{m.pagantes} veterinarias</td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums">{formatPesos(m.ingresoMensual)}</td>
                  <td className="px-5 py-2.5">
                    {m.alcanzada ? (
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">Ya llegaste</span>
                    ) : m.mes && m.etiqueta ? (
                      <span className="capitalize">{m.etiqueta}</span>
                    ) : (
                      <span className="text-muted-foreground">Más de 5 años a este ritmo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Datos en tabla (también es la vista accesible de los gráficos) */}
      <details className="rounded-2xl border bg-card shadow-sm">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">Ver los datos mes a mes</summary>
        <div className="overflow-x-auto border-t">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-left font-semibold">Mes</th>
                <th className="px-5 py-2.5 text-right font-semibold">Altas</th>
                <th className="px-5 py-2.5 text-right font-semibold">Registradas</th>
                <th className="px-5 py-2.5 text-right font-semibold">Pagan</th>
                <th className="px-5 py-2.5 text-right font-semibold">Ingreso</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...serie, ...proyeccion].map((p) => (
                <tr key={p.mes} className={p.proyectado ? "text-muted-foreground" : undefined}>
                  <td className="px-5 py-2 capitalize">
                    {p.etiqueta}
                    {p.proyectado && <span className="ml-1 text-xs normal-case">(proyección)</span>}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums">{formatCantidad(p.altas)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{formatCantidad(p.veterinarias)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{formatCantidad(p.pagantes)}</td>
                  <td className="px-5 py-2 text-right font-mono tabular-nums">{formatPesos(p.ingresoMensual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
