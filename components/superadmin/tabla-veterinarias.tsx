"use client"

import Link from "next/link"
import {
  Activity, CalendarPlus, ExternalLink, MoreHorizontal, PauseCircle, Pencil,
  PlayCircle, RefreshCw, Search, Stethoscope, Trash2, XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { EstadoVacio } from "@/components/admin/estado-vacio"
import type { TenantFull } from "@/lib/supabase/types"
import { estadoTrial } from "@/lib/superadmin/resumen"
import { EstadoTenant, EtiquetaTrial, NOMBRE_PLAN } from "./etiquetas"

type Plan = NonNullable<TenantFull["plan"]>

interface Props {
  tenants: TenantFull[]
  hayTenants: boolean
  cargando: boolean
  turnosPorSlug: Record<string, number>
  /** slug de la veterinaria con una operación en curso, para bloquear sus botones. */
  ocupado: string | null
  onCambiarPlan: (t: TenantFull, plan: Plan) => void
  onPausar: (t: TenantFull) => void
  onExtenderTrial: (t: TenantFull) => void
  onQuitarTrial: (t: TenantFull) => void
  onActividad: (t: TenantFull) => void
  onEditar: (t: TenantFull) => void
  onEliminar: (t: TenantFull) => void
}

function fechaAlta(iso?: string): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function TablaVeterinarias(props: Props) {
  const { tenants, hayTenants, cargando } = props

  if (cargando) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
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
    // Con 6 columnas no entra en un celular: scrollea la tabla, no la página.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Veterinaria</th>
            <th className="px-4 py-3 text-left font-semibold">Plan</th>
            <th className="px-4 py-3 text-right font-semibold">Turnos</th>
            <th className="px-4 py-3 text-left font-semibold">Estado</th>
            <th className="px-4 py-3 text-left font-semibold">Prueba</th>
            <th className="px-4 py-3 text-right font-semibold">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {tenants.map((t) => (
            <FilaVeterinaria key={t.slug} tenant={t} {...props} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FilaVeterinaria({
  tenant: t, turnosPorSlug, ocupado,
  onCambiarPlan, onPausar, onExtenderTrial, onQuitarTrial, onActividad, onEditar, onEliminar,
}: Props & { tenant: TenantFull }) {
  const pausada = t.status === "pausado"
  const bloqueada = ocupado === t.slug
  const trial = estadoTrial(t.trialExpiresAt)
  const alta = fechaAlta(t.createdAt)
  const nombre = t.nombre ?? t.slug

  return (
    <tr className={`transition-colors hover:bg-muted/30 ${pausada ? "bg-muted/20" : ""}`}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
              pausada ? "bg-muted text-muted-foreground" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
            }`}
            aria-hidden
          >
            {nombre.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className={`truncate font-semibold ${pausada ? "text-muted-foreground" : ""}`}>{nombre}</div>
            <div className="truncate text-xs text-muted-foreground">
              <span className="font-mono">/{t.slug}</span>
              {t.ciudad && <> · {t.ciudad}</>}
              {alta && <> · alta {alta}</>}
            </div>
          </div>
        </div>
      </td>

      <td className="px-4 py-3">
        <Select
          value={t.plan ?? "basico"}
          onValueChange={(v) => onCambiarPlan(t, v as Plan)}
          disabled={bloqueada}
        >
          <SelectTrigger className="h-8 w-28 text-xs" aria-label={`Plan de ${nombre}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(NOMBRE_PLAN) as Plan[]).map((p) => (
              <SelectItem key={p} value={p}>{NOMBRE_PLAN[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      <td className="px-4 py-3 text-right font-mono tabular-nums">{turnosPorSlug[t.slug] ?? 0}</td>

      <td className="px-4 py-3"><EstadoTenant status={t.status} /></td>

      <td className="px-4 py-3"><EtiquetaTrial estado={trial} /></td>

      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          {bloqueada && <RefreshCw className="mr-1 h-4 w-4 animate-spin text-muted-foreground" aria-label="Guardando" />}
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onActividad(t)}>
            <Activity className="mr-1 h-3.5 w-3.5" /> Actividad
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
            <Link href={`/${t.slug}/admin`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Ver panel
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" disabled={bloqueada} aria-label={`Más acciones para ${nombre}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="truncate text-xs text-muted-foreground">{nombre}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => onEditar(t)}>
                <Pencil /> Editar datos
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onPausar(t)}>
                {pausada ? <><PlayCircle /> Reactivar</> : <><PauseCircle /> Pausar</>}
              </DropdownMenuItem>
              {/* Solo con prueba en curso o vencida. A una veterinaria sin prueba
                  (ya paga) ponerle un vencimiento la deja en solo lectura cuando vence. */}
              {trial.tipo !== "sin-trial" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => onExtenderTrial(t)}>
                    <CalendarPlus /> Extender prueba 10 días
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onQuitarTrial(t)}>
                    <XCircle /> Quitar prueba
                  </DropdownMenuItem>
                </>
              )}
              {/* Separado y al final: es lo único que no tiene vuelta atrás. */}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => onEliminar(t)}>
                <Trash2 /> Eliminar veterinaria
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  )
}
