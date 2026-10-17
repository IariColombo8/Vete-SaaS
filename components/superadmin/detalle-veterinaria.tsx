"use client"

import Link from "next/link"
import {
  Activity, CalendarPlus, ExternalLink, Mail, MapPin, PauseCircle, Pencil, Phone, PlayCircle, RefreshCw, Trash2, XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { TenantFull } from "@/lib/supabase/types"
import { estadoTrial } from "@/lib/superadmin/resumen"
import type { IngresoTenant } from "@/lib/superadmin/ingresos"
import { formatPesos, type PlanDefinition, type PlanId } from "@/lib/plans"
import type { UsoResumen } from "@/lib/superadmin/actividad"
import { EstadoTenant, EtiquetaTrial } from "./etiquetas"
import { UsoPanel } from "./uso-panel"

interface Props {
  /** Veterinaria abierta, o null con el panel cerrado. */
  tenant: TenantFull | null
  onCerrar: () => void
  turnos: number
  usuarios: number
  ingreso: IngresoTenant | undefined
  uso: UsoResumen | undefined
  /** Todos los planes, también los ocultos: el superadmin puede asignar cualquiera. */
  planes: PlanDefinition[]
  ahora: Date
  /** true con una operación en curso sobre esta veterinaria: bloquea las acciones. */
  ocupado: boolean
  onCambiarPlan: (t: TenantFull, plan: PlanId) => void
  onPausar: (t: TenantFull) => void
  onExtenderTrial: (t: TenantFull) => void
  onQuitarTrial: (t: TenantFull) => void
  onActividad: (t: TenantFull) => void
  onEditar: (t: TenantFull) => void
  onEliminar: (t: TenantFull) => void
}

function fecha(iso?: string): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

/**
 * Detalle de una veterinaria, al hacer clic en su fila de la tabla: contacto,
 * plan, cobro, uso y todas las acciones (que antes vivían en un menú "…" por
 * fila y obligaban a scrollear la tabla de costado).
 */
export function DetalleVeterinaria({
  tenant: t, onCerrar, turnos, usuarios, ingreso, uso, planes, ahora, ocupado,
  onCambiarPlan, onPausar, onExtenderTrial, onQuitarTrial, onActividad, onEditar, onEliminar,
}: Props) {
  return (
    <Sheet open={t !== null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {t && <Contenido {...{
          t, turnos, usuarios, ingreso, uso, planes, ahora, ocupado,
          onCambiarPlan, onPausar, onExtenderTrial, onQuitarTrial, onActividad, onEditar, onEliminar,
        }} />}
      </SheetContent>
    </Sheet>
  )
}

function Contenido({
  t, turnos, usuarios, ingreso, uso, planes, ahora, ocupado,
  onCambiarPlan, onPausar, onExtenderTrial, onQuitarTrial, onActividad, onEditar, onEliminar,
}: Omit<Props, "tenant" | "onCerrar"> & { t: TenantFull }) {
  const nombre = t.nombre ?? t.slug
  const pausada = t.status === "pausado"
  const trial = estadoTrial(t.trialExpiresAt)
  const planActual = t.plan ?? "basico"
  const alta = fecha(t.createdAt)

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {nombre}
          {ocupado && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Guardando" />}
        </SheetTitle>
        <SheetDescription>
          <span className="font-mono">/{t.slug}</span>
          {alta && <> · alta {alta}</>}
        </SheetDescription>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <EstadoTenant status={t.status} />
          <EtiquetaTrial estado={trial} />
        </div>
      </SheetHeader>

      <div className="space-y-5 px-4 pb-6">
        {(t.email || t.telefono || t.ciudad) && (
          <div className="space-y-1.5 text-sm">
            {t.email && (
              <a href={`mailto:${t.email}`} className="flex items-center gap-2 hover:underline">
                <Mail className="h-4 w-4 text-muted-foreground" /> {t.email}
              </a>
            )}
            {t.telefono && (
              <a href={`tel:${t.telefono}`} className="flex items-center gap-2 hover:underline">
                <Phone className="h-4 w-4 text-muted-foreground" /> {t.telefono}
              </a>
            )}
            {t.ciudad && (
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" /> {t.ciudad}
              </p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Plan</p>
          <Select value={planActual} onValueChange={(v) => onCambiarPlan(t, v)} disabled={ocupado}>
            <SelectTrigger className="w-full" aria-label={`Plan de ${nombre}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {planes.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nombre}{p.visible ? "" : " (oculto)"}
                </SelectItem>
              ))}
              {!planes.some((p) => p.id === planActual) && (
                <SelectItem value={planActual}>{planActual}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div className="col-span-3 sm:col-span-1">
            <dt className="text-xs text-muted-foreground">Ingreso/mes</dt>
            <dd className="font-mono font-semibold tabular-nums">
              {ingreso?.pagando ? formatPesos(ingreso.montoMensual) : "No paga"}
            </dd>
            {ingreso?.pagando && (
              <dd className="text-xs text-muted-foreground">
                {ingreso.via === "manual" ? "Efectivo" : "Mercado Pago"}
                {ingreso.clienteDesde && (
                  <> · desde {new Date(ingreso.clienteDesde).toLocaleDateString("es-AR", { month: "short", year: "numeric" })}</>
                )}
              </dd>
            )}
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Equipo</dt>
            <dd className="font-mono tabular-nums">{usuarios}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Turnos</dt>
            <dd className="font-mono tabular-nums">{turnos}</dd>
          </div>
        </dl>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Uso del panel (30 días)</p>
          <UsoPanel uso={uso} ahora={ahora} />
        </div>

        <Separator />

        <div className="grid gap-2">
          <Button variant="outline" className="justify-start" asChild>
            <Link href={`/${t.slug}/admin`} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> Abrir su panel
            </Link>
          </Button>
          <Button variant="outline" className="justify-start" onClick={() => onActividad(t)}>
            <Activity /> Ver actividad
          </Button>
          <Button variant="outline" className="justify-start" onClick={() => onEditar(t)} disabled={ocupado}>
            <Pencil /> Editar datos
          </Button>
          <Button variant="outline" className="justify-start" onClick={() => onPausar(t)} disabled={ocupado}>
            {pausada ? <><PlayCircle /> Reactivar</> : <><PauseCircle /> Pausar</>}
          </Button>
          {/* Solo con prueba en curso o vencida. A una veterinaria sin prueba
              (ya paga) ponerle un vencimiento la deja en solo lectura cuando vence. */}
          {trial.tipo !== "sin-trial" && (
            <>
              <Button variant="outline" className="justify-start" onClick={() => onExtenderTrial(t)} disabled={ocupado}>
                <CalendarPlus /> Extender prueba 10 días
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => onQuitarTrial(t)} disabled={ocupado}>
                <XCircle /> Quitar prueba
              </Button>
            </>
          )}
        </div>

        {/* Separado y al final: es lo único que no tiene vuelta atrás. */}
        <Separator />
        <Button
          variant="ghost"
          className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onEliminar(t)}
          disabled={ocupado}
        >
          <Trash2 /> Eliminar veterinaria
        </Button>
      </div>
    </>
  )
}
