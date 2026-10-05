"use client"

import { RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { TenantFull } from "@/lib/supabase/types"

export interface ActividadTenant {
  turnos: number
  ventas: number
  productos: number
  movimientosStock: number
}

// ── Actividad ───────────────────────────────────────────────────────────────

export function ActividadDialog({
  tenant, actividad, cargando, onCerrar,
}: {
  tenant: TenantFull | null
  actividad: ActividadTenant | null
  cargando: boolean
  onCerrar: () => void
}) {
  const datos: { label: string; valor?: number }[] = [
    { label: "Turnos creados", valor: actividad?.turnos },
    { label: "Ventas registradas", valor: actividad?.ventas },
    { label: "Productos cargados", valor: actividad?.productos },
    { label: "Movimientos de stock", valor: actividad?.movimientosStock },
  ]
  return (
    <Dialog open={!!tenant} onOpenChange={(open) => { if (!open) onCerrar() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Actividad de {tenant?.nombre ?? tenant?.slug}</DialogTitle>
          <DialogDescription>Cuánto usa la plataforma esta veterinaria, desde que se dio de alta.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {datos.map((d) => (
            <div key={d.label} className="rounded-xl border bg-muted/20 p-4">
              {cargando || d.valor === undefined ? (
                <Skeleton className="h-8 w-14" />
              ) : (
                <p className="text-2xl font-extrabold tabular-nums">{d.valor}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{d.label}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Edición ─────────────────────────────────────────────────────────────────

export const CAMPOS_EDICION = ["nombre", "telefono", "email", "direccion", "ciudad"] as const
export type FormEdicion = Record<(typeof CAMPOS_EDICION)[number], string>

const ETIQUETAS: Record<keyof FormEdicion, { label: string; type?: string }> = {
  nombre: { label: "Nombre" },
  telefono: { label: "Teléfono", type: "tel" },
  email: { label: "Email", type: "email" },
  direccion: { label: "Dirección" },
  ciudad: { label: "Ciudad" },
}

export function EditarTenantDialog({
  tenant, form, guardando, onCambiar, onCerrar, onGuardar,
}: {
  tenant: TenantFull | null
  form: FormEdicion
  guardando: boolean
  onCambiar: (campo: keyof FormEdicion, valor: string) => void
  onCerrar: () => void
  onGuardar: () => void
}) {
  return (
    <Dialog open={!!tenant} onOpenChange={(open) => { if (!open && !guardando) onCerrar() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar {tenant?.nombre ?? tenant?.slug}</DialogTitle>
          <DialogDescription>
            Datos de contacto y presentación. El slug (<code className="rounded bg-muted px-1 py-0.5">/{tenant?.slug}</code>) no se cambia desde acá.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {CAMPOS_EDICION.map((campo) => (
            <div key={campo} className="grid gap-1.5">
              <Label htmlFor={`edit-${campo}`}>{ETIQUETAS[campo].label}</Label>
              <Input
                id={`edit-${campo}`}
                type={ETIQUETAS[campo].type}
                value={form[campo]}
                onChange={(e) => onCambiar(campo, e.target.value)}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button onClick={onGuardar} disabled={guardando || !form.nombre.trim()}>
            {guardando && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Eliminación (irreversible) ──────────────────────────────────────────────

export function EliminarTenantDialog({
  tenant, confirmacion, eliminando, onConfirmacion, onCerrar, onEliminar,
}: {
  tenant: TenantFull | null
  confirmacion: string
  eliminando: boolean
  onConfirmacion: (v: string) => void
  onCerrar: () => void
  onEliminar: () => void
}) {
  return (
    <AlertDialog open={!!tenant} onOpenChange={(open) => { if (!open && !eliminando) onCerrar() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar {tenant?.nombre ?? tenant?.slug}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                Esto borra <strong>para siempre</strong> la veterinaria y todo lo que tiene
                cargado: clientes, mascotas, historias clínicas, turnos, productos y ventas.
                No se puede deshacer.
              </p>
              <p>
                Si solo querés que deje de recibir turnos online, usá <strong>Pausar</strong>: se puede revertir.
              </p>
              <p>
                Para confirmar, escribí el slug exacto:{" "}
                <code className="rounded bg-muted px-1 py-0.5">{tenant?.slug}</code>
              </p>
              <Input
                value={confirmacion}
                onChange={(e) => onConfirmacion(e.target.value)}
                placeholder={tenant?.slug}
                autoComplete="off"
                aria-label="Slug de la veterinaria a eliminar"
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={onEliminar}
            disabled={eliminando || confirmacion !== tenant?.slug}
          >
            {eliminando ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Eliminar definitivamente
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
