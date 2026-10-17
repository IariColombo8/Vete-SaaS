"use client"

import Link from "next/link"
import { ChevronRight, ExternalLink, RefreshCw, Search, Stethoscope } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EstadoVacio } from "@/components/admin/estado-vacio"
import type { TenantFull } from "@/lib/supabase/types"
import { estadoTrial } from "@/lib/superadmin/resumen"
import type { IngresoTenant } from "@/lib/superadmin/ingresos"
import { formatPesos, type PlanDefinition } from "@/lib/plans"
import type { UsoResumen } from "@/lib/superadmin/actividad"
import { cn } from "@/lib/utils"
import { EstadoCuenta } from "./etiquetas"
import { UsoPanel } from "./uso-panel"

interface Props {
  tenants: TenantFull[]
  hayTenants: boolean
  cargando: boolean
  turnosPorSlug: Record<string, number>
  /** Usuarios del panel (veterinario + empleados) por veterinaria. */
  usuariosPorSlug: Record<string, number>
  ingresos: Record<string, IngresoTenant>
  planes: PlanDefinition[]
  /** Uso del panel en los últimos 30 días, por slug. */
  usoPorSlug: Record<string, UsoResumen>
  ahora: Date
  /** slug de la veterinaria con una operación en curso. */
  ocupado: string | null
  /** slug abierto en el detalle, para marcar la fila. */
  seleccionado: string | null
  onAbrir: (t: TenantFull) => void
}

/**
 * Lista de veterinarias. Entra entera en el ancho de la pantalla, sin scroll
 * horizontal: lo que no es para comparar de un vistazo (contacto, actividad,
 * acciones de plan y prueba) vive en el detalle, que se abre con un clic en
 * la fila. Las columnas secundarias se esconden en pantallas angostas.
 */
export function TablaVeterinarias(props: Props) {
  const { tenants, hayTenants, cargando } = props

  if (cargando) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    )
  }
  if (!hayTenants) {
    return (
      <EstadoVacio
        icono={<Stethoscope />}
        titulo="Todavía no hay veterinarias"
        descripcion="Cuando alguien se registre desde la página de precios, su veterinaria aparece acá."
      />
    )
  }
  if (tenants.length === 0) {
    return (
      <EstadoVacio
        icono={<Search />}
        titulo="Ningún resultado"
        descripcion="Ninguna veterinaria coincide con la búsqueda o los filtros. Probá limpiarlos."
      />
    )
  }

  return (
    <table className="w-full text-sm">
      <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
        <tr>
          <th className="w-full px-4 py-2.5 text-left font-medium">Veterinaria</th>
          <th className="hidden px-4 py-2.5 text-left font-medium sm:table-cell">Plan</th>
          <th className="px-4 py-2.5 text-left font-medium">Estado</th>
          <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">Ingreso/mes</th>
          <th className="hidden w-48 px-4 py-2.5 text-left font-medium lg:table-cell">Uso (30 días)</th>
          <th className="hidden px-4 py-2.5 text-right font-medium xl:table-cell">Equipo</th>
          <th className="hidden px-4 py-2.5 text-right font-medium xl:table-cell">Turnos</th>
          <th className="px-2 py-2.5"><span className="sr-only">Acciones</span></th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {tenants.map((t) => (
          <FilaVeterinaria key={t.slug} tenant={t} {...props} />
        ))}
      </tbody>
    </table>
  )
}

function FilaVeterinaria({
  tenant: t, turnosPorSlug, usuariosPorSlug, ingresos, planes, usoPorSlug, ahora, ocupado, seleccionado, onAbrir,
}: Props & { tenant: TenantFull }) {
  const pausada = t.status === "pausado"
  const nombre = t.nombre ?? t.slug
  const ingreso = ingresos[t.slug]
  const planActual = t.plan ?? "basico"
  const plan = planes.find((p) => p.id === planActual)

  return (
    <tr
      tabIndex={0}
      aria-label={`Ver detalle de ${nombre}`}
      onClick={() => onAbrir(t)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onAbrir(t)
        }
      }}
      className={cn(
        "cursor-pointer outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/50",
        seleccionado === t.slug && "bg-muted/50",
        pausada && "text-muted-foreground",
      )}
    >
      <td className="max-w-0 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold",
              pausada ? "bg-muted text-muted-foreground" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
            )}
            aria-hidden
          >
            {nombre.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">{nombre}</div>
            <div className="truncate text-xs text-muted-foreground">
              <span className="font-mono">/{t.slug}</span>
              {t.ciudad && <> · {t.ciudad}</>}
            </div>
          </div>
        </div>
      </td>

      <td className="hidden px-4 py-2.5 sm:table-cell">
        <span className="text-sm">{plan?.nombre ?? planActual}</span>
        {plan && !plan.visible && <span className="ml-1 text-xs text-muted-foreground">(oculto)</span>}
      </td>

      <td className="px-4 py-2.5">
        <EstadoCuenta status={t.status} trial={estadoTrial(t.trialExpiresAt)} />
      </td>

      <td className="hidden px-4 py-2.5 text-right md:table-cell">
        {ingreso?.pagando ? (
          <div className="leading-tight">
            <div className="font-mono font-semibold tabular-nums">{formatPesos(ingreso.montoMensual)}</div>
            <div className="text-xs text-muted-foreground">{ingreso.via === "manual" ? "Efectivo" : "Mercado Pago"}</div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      <td className="hidden px-4 py-2.5 lg:table-cell">
        <UsoPanel uso={usoPorSlug[t.slug]} ahora={ahora} compacto />
      </td>

      <td className="hidden px-4 py-2.5 text-right font-mono tabular-nums xl:table-cell">{usuariosPorSlug[t.slug] ?? 0}</td>
      <td className="hidden px-4 py-2.5 text-right font-mono tabular-nums xl:table-cell">{turnosPorSlug[t.slug] ?? 0}</td>

      <td className="px-2 py-2.5">
        <div className="flex items-center justify-end gap-0.5">
          {ocupado === t.slug && <RefreshCw className="mr-1 h-4 w-4 animate-spin text-muted-foreground" aria-label="Guardando" />}
          {/* Atajo directo al panel: el clic no abre el detalle. */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden size-8 sm:inline-flex"
            asChild
            onClick={(e) => e.stopPropagation()}
          >
            <Link
              href={`/${t.slug}/admin`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Abrir el panel de ${nombre}`}
              title="Abrir su panel"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
      </td>
    </tr>
  )
}
