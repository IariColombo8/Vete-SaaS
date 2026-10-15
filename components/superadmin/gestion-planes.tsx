"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Check, EyeOff, Layers, Pencil, Plus, RefreshCw, Star, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  FEATURES, PLANES_FIJOS, PLAN_RECOMENDADO, formatPesos, type Feature, type PlanDefinition,
} from "@/lib/plans"
import { eliminarPlan, guardarPlan } from "@/lib/supabase/planes"
import type { AccionPendiente } from "./confirmar-accion-dialog"

interface Props {
  planes: PlanDefinition[]
  /** Veterinarias por id de plan. */
  tenantsPorPlan: Record<string, number>
  cargando: boolean
  /** Después de guardar o borrar: recargar el panel. */
  onCambio: () => void
  onPedirAccion: (accion: AccionPendiente) => void
}

/** Formulario: los números van como texto para poder dejarlos vacíos (= ilimitado). */
interface FormPlan {
  id: string
  nombre: string
  descripcion: string
  precio: string
  maxTurnos: string
  maxUsuarios: string
  features: Record<Feature, boolean>
  highlights: string
  orden: string
  visible: boolean
}

const SIN_FEATURES = Object.fromEntries(FEATURES.map(({ key }) => [key, false])) as Record<Feature, boolean>

function aForm(plan: PlanDefinition): FormPlan {
  return {
    id: plan.id,
    nombre: plan.nombre,
    descripcion: plan.descripcion,
    precio: String(plan.precioMensual),
    maxTurnos: plan.limits.maxTurnosMes?.toString() ?? "",
    maxUsuarios: plan.limits.maxUsuarios?.toString() ?? "",
    features: { ...plan.features },
    highlights: plan.highlights.join("\n"),
    orden: String(plan.orden),
    visible: plan.visible,
  }
}

function formVacio(planes: PlanDefinition[]): FormPlan {
  const ultimoOrden = Math.max(0, ...planes.map((p) => p.orden))
  return {
    id: "", nombre: "", descripcion: "", precio: "", maxTurnos: "", maxUsuarios: "",
    features: { ...SIN_FEATURES }, highlights: "", orden: String(ultimoOrden + 10), visible: true,
  }
}

/** "Plan Clínica Plus" → "plan-clinica-plus" */
function idDesdeNombre(nombre: string): string {
  return nombre
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 30)
}

const ID_VALIDO = /^[a-z0-9][a-z0-9-]{1,29}$/

function enteroOpcional(valor: string): number | null | "invalido" {
  if (valor.trim() === "") return null
  const n = Number(valor)
  return Number.isInteger(n) && n > 0 ? n : "invalido"
}

/** Valida el formulario y arma el plan, o devuelve el error a mostrar. */
function aPlan(form: FormPlan): PlanDefinition | string {
  if (!ID_VALIDO.test(form.id)) return "El id va en minúsculas, números y guiones (2 a 30 caracteres)"
  if (!form.nombre.trim()) return "Falta el nombre"
  const precio = Number(form.precio)
  if (!Number.isFinite(precio) || precio <= 0) return "El precio tiene que ser mayor a 0"
  const maxTurnos = enteroOpcional(form.maxTurnos)
  const maxUsuarios = enteroOpcional(form.maxUsuarios)
  if (maxTurnos === "invalido" || maxUsuarios === "invalido") {
    return "Los límites son números enteros mayores a 0, o vacíos para ilimitado"
  }
  const orden = Number(form.orden)
  return {
    id: form.id,
    nombre: form.nombre.trim(),
    descripcion: form.descripcion.trim(),
    precioMensual: precio,
    limits: { maxTurnosMes: maxTurnos, maxUsuarios },
    features: form.features,
    highlights: form.highlights.split("\n").map((h) => h.trim()).filter(Boolean),
    orden: Number.isFinite(orden) ? Math.round(orden) : 0,
    visible: form.visible,
  }
}

function limite(valor: number | null): string {
  return valor === null ? "Ilimitados" : String(valor)
}

/**
 * Solapa "Planes" del superadmin: catálogo editable (tabla `planes`). Lo que se
 * cambia acá se ve en la landing, /pricing y el panel de cada veterinaria, y
 * el checkout cobra el precio nuevo. Las suscripciones ya activas en Mercado
 * Pago siguen con el monto que aceptaron.
 */
export function GestionPlanes({ planes, tenantsPorPlan, cargando, onCambio, onPedirAccion }: Props) {
  const [form, setForm] = useState<FormPlan | null>(null)
  const [esNuevo, setEsNuevo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function abrirNuevo() {
    setForm(formVacio(planes))
    setEsNuevo(true)
    setError(null)
  }

  function abrirEdicion(plan: PlanDefinition) {
    setForm(aForm(plan))
    setEsNuevo(false)
    setError(null)
  }

  function cambiar<K extends keyof FormPlan>(campo: K, valor: FormPlan[K]) {
    setForm((prev) => (prev ? { ...prev, [campo]: valor } : prev))
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    const plan = aPlan(form)
    if (typeof plan === "string") {
      setError(plan)
      return
    }
    setGuardando(true)
    try {
      await guardarPlan(plan, esNuevo)
      toast.success(esNuevo ? `Plan ${plan.nombre} creado` : `Plan ${plan.nombre} guardado`)
      setForm(null)
      onCambio()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el plan")
    } finally {
      setGuardando(false)
    }
  }

  function pedirBorrado(plan: PlanDefinition) {
    onPedirAccion({
      titulo: `Borrar el plan ${plan.nombre}`,
      descripcion: (
        <p>
          Desaparece de la página de precios y del panel. Ninguna veterinaria lo tiene, así que no afecta
          a nadie. Si solo querés dejar de ofrecerlo, ocultalo en vez de borrarlo.
        </p>
      ),
      confirmar: "Borrar plan",
      peligrosa: true,
      ejecutar: async () => {
        try {
          await eliminarPlan(plan.id)
          toast.success(`Plan ${plan.nombre} borrado`)
          onCambio()
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "No se pudo borrar el plan")
        }
      },
    })
  }

  return (
    <section aria-labelledby="titulo-planes" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="titulo-planes" className="text-lg font-bold">Planes</h2>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Lo que cambies se ve en la landing, en /pricing (puede tardar hasta 5 minutos) y en el panel de cada
            veterinaria. El precio nuevo vale para las contrataciones nuevas: las suscripciones activas en Mercado
            Pago siguen cobrando el monto que aceptaron.
          </p>
        </div>
        <Button onClick={abrirNuevo} className="self-start sm:self-auto">
          <Plus className="mr-2 h-4 w-4" /> Nuevo plan
        </Button>
      </div>

      {cargando ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {planes.map((plan) => {
            const enUso = tenantsPorPlan[plan.id] ?? 0
            const fijo = PLANES_FIJOS.includes(plan.id)
            const secciones = FEATURES.filter(({ key }) => plan.features[key])
            return (
              <article key={plan.id} className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 font-semibold">
                      {plan.nombre}
                      {plan.id === PLAN_RECOMENDADO && (
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label="Recomendado" />
                      )}
                    </h3>
                    <p className="font-mono text-xs text-muted-foreground">{plan.id}</p>
                  </div>
                  {!plan.visible && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      <EyeOff className="h-3 w-3" /> Oculto
                    </span>
                  )}
                </div>

                <p className="mt-3 text-3xl font-extrabold tabular-nums tracking-tight">
                  {formatPesos(plan.precioMensual)}
                  <span className="text-sm font-medium text-muted-foreground">/mes</span>
                </p>
                {plan.descripcion && <p className="text-sm text-muted-foreground">{plan.descripcion}</p>}

                <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <dt className="text-muted-foreground">Turnos/mes</dt>
                    <dd className="font-semibold">{limite(plan.limits.maxTurnosMes)}</dd>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <dt className="text-muted-foreground">Usuarios</dt>
                    <dd className="font-semibold">{limite(plan.limits.maxUsuarios)}</dd>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <dt className="text-muted-foreground">Veterinarias</dt>
                    <dd className="font-semibold tabular-nums">{enUso}</dd>
                  </div>
                </dl>

                <p className="mt-4 text-xs font-medium text-muted-foreground">
                  {secciones.length} de {FEATURES.length} secciones
                </p>
                <ul className="mt-1 flex-1 space-y-1 text-xs">
                  {secciones.slice(0, 5).map(({ key, label }) => (
                    <li key={key} className="flex items-center gap-1.5">
                      <Check className="h-3 w-3 shrink-0 text-emerald-600" /> {label}
                    </li>
                  ))}
                  {secciones.length > 5 && (
                    <li className="text-muted-foreground">y {secciones.length - 5} más</li>
                  )}
                </ul>

                <div className="mt-4 flex gap-2 border-t pt-4">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => abrirEdicion(plan)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
                  </Button>
                  {!fijo && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => pedirBorrado(plan)}
                      disabled={enUso > 0}
                      title={enUso > 0 ? "Hay veterinarias con este plan: ocultalo en vez de borrarlo" : "Borrar plan"}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="sr-only">Borrar {plan.nombre}</span>
                    </Button>
                  )}
                </div>
              </article>
            )
          })}
          {planes.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              <Layers className="h-6 w-6" />
              No se pudieron leer los planes.
            </div>
          )}
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(abierto) => { if (!abierto && !guardando) setForm(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {form && (
            <form onSubmit={guardar} className="space-y-5">
              <DialogHeader>
                <DialogTitle>{esNuevo ? "Nuevo plan" : `Editar ${form.nombre || form.id}`}</DialogTitle>
                <DialogDescription>
                  {esNuevo
                    ? "Combiná las secciones que ya existen en la app con el precio y los límites que quieras."
                    : "El precio nuevo vale para las contrataciones nuevas. Las secciones y los límites cambian enseguida para todas las veterinarias con este plan."}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="plan-nombre">Nombre</Label>
                  <Input
                    id="plan-nombre"
                    value={form.nombre}
                    onChange={(e) => {
                      const nombre = e.target.value
                      setForm((prev) => prev && ({
                        ...prev,
                        nombre,
                        // En un plan nuevo, el id sigue al nombre hasta que lo toquen a mano.
                        id: esNuevo && prev.id === idDesdeNombre(prev.nombre) ? idDesdeNombre(nombre) : prev.id,
                      }))
                    }}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-id">Id</Label>
                  <Input
                    id="plan-id"
                    value={form.id}
                    onChange={(e) => cambiar("id", e.target.value.toLowerCase())}
                    disabled={!esNuevo}
                    className="font-mono"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    {esNuevo ? "Va en los links de precios. No se puede cambiar después." : "No se puede cambiar."}
                  </p>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="plan-descripcion">Descripción corta</Label>
                  <Input
                    id="plan-descripcion"
                    value={form.descripcion}
                    onChange={(e) => cambiar("descripcion", e.target.value)}
                    placeholder="Para clínicas con varias sucursales"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-precio">Precio mensual (ARS)</Label>
                  <Input
                    id="plan-precio"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step="any"
                    value={form.precio}
                    onChange={(e) => cambiar("precio", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-orden">Orden</Label>
                  <Input
                    id="plan-orden"
                    type="number"
                    value={form.orden}
                    onChange={(e) => cambiar("orden", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Menor primero en la página de precios.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-turnos">Turnos por mes</Label>
                  <Input
                    id="plan-turnos"
                    type="number"
                    min={1}
                    value={form.maxTurnos}
                    onChange={(e) => cambiar("maxTurnos", e.target.value)}
                    placeholder="Ilimitados"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-usuarios">Usuarios (incluye al dueño)</Label>
                  <Input
                    id="plan-usuarios"
                    type="number"
                    min={1}
                    value={form.maxUsuarios}
                    onChange={(e) => cambiar("maxUsuarios", e.target.value)}
                    placeholder="Ilimitados"
                  />
                </div>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Secciones incluidas</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {FEATURES.map(({ key, label }) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm hover:bg-muted/40">
                      <Checkbox
                        checked={form.features[key]}
                        onCheckedChange={(v) => cambiar("features", { ...form.features, [key]: v === true })}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {form.features.recordatoriosVacunas && !form.features.whatsapp && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Los recordatorios de vacunas salen por WhatsApp: sin WhatsApp no se envía ninguno.
                  </p>
                )}
              </fieldset>

              <div className="space-y-1.5">
                <Label htmlFor="plan-highlights">Puntos destacados en la página de precios</Label>
                <Textarea
                  id="plan-highlights"
                  rows={5}
                  value={form.highlights}
                  onChange={(e) => cambiar("highlights", e.target.value)}
                  placeholder={"Uno por renglón\nTurnos ilimitados\nHasta 5 usuarios"}
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div>
                  <Label htmlFor="plan-visible">Visible</Label>
                  <p className="text-xs text-muted-foreground">
                    Se muestra en los precios y las veterinarias lo pueden contratar. Oculto, solo lo asignás vos.
                  </p>
                </div>
                <Switch id="plan-visible" checked={form.visible} onCheckedChange={(v) => cambiar("visible", v)} />
              </div>

              {error && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)} disabled={guardando}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={guardando}>
                  {guardando && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                  {esNuevo ? "Crear plan" : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
