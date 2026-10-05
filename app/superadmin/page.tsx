"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, RefreshCw, Search, Shield } from "lucide-react"
import { getUsuarios, getTenantsFull, updateTenantConfig, deleteTenant, getTurnosCount, getProductos, getMovimientosCount } from "@/lib/supabase/queries"
import { getVentas } from "@/lib/supabase/ventas"
import type { Usuario, TenantFull } from "@/lib/supabase/queries"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  filtrarTenants, filtrarUsuarios, resumenPlataforma,
  type EstadoFiltro, type PlanFiltro, type RolFiltro,
} from "@/lib/superadmin/resumen"
import { Indicadores } from "@/components/superadmin/indicadores"
import { TablaVeterinarias } from "@/components/superadmin/tabla-veterinarias"
import { TablaUsuarios } from "@/components/superadmin/tabla-usuarios"
import { NOMBRE_PLAN } from "@/components/superadmin/etiquetas"
import { ConfirmarAccionDialog, type AccionPendiente } from "@/components/superadmin/confirmar-accion-dialog"
import {
  ActividadDialog, EditarTenantDialog, EliminarTenantDialog,
  type ActividadTenant, type FormEdicion,
} from "@/components/superadmin/dialogos-tenant"

type Plan = NonNullable<TenantFull["plan"]>

const DIAS_EXTENSION_TRIAL = 10
const FORM_VACIO: FormEdicion = { nombre: "", telefono: "", email: "", direccion: "", ciudad: "" }

function mensajeError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export default function SuperAdminPage() {
  const [usuarios, setUsuarios]       = useState<Usuario[]>([])
  const [tenants, setTenants]         = useState<TenantFull[]>([])
  const [turnosPorSlug, setTurnosPorSlug] = useState<Record<string, number>>({})
  const [loading, setLoading]         = useState(true)
  const [errorCarga, setErrorCarga]   = useState<string | null>(null)

  // slug con una operación en curso: bloquea los botones de esa fila.
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [accion, setAccion] = useState<AccionPendiente | null>(null)
  const [ejecutandoAccion, setEjecutandoAccion] = useState(false)

  const [actividadTenant, setActividadTenant] = useState<TenantFull | null>(null)
  const [actividad, setActividad]     = useState<ActividadTenant | null>(null)
  const [actividadLoading, setActividadLoading] = useState(false)

  // Filtros
  const [busqueda, setBusqueda]         = useState("")
  const [filtroEstado, setFiltroEstado] = useState<EstadoFiltro>("todas")
  const [filtroPlan, setFiltroPlan]     = useState<PlanFiltro>("todos")
  const [busquedaUsuario, setBusquedaUsuario] = useState("")
  const [filtroRol, setFiltroRol]       = useState<RolFiltro>("todos")

  // Edición de datos del tenant
  const [editTenant, setEditTenant] = useState<TenantFull | null>(null)
  const [editForm, setEditForm]     = useState<FormEdicion>(FORM_VACIO)
  const [editSaving, setEditSaving] = useState(false)

  // Eliminación de tenant (irreversible)
  const [deleteTarget, setDeleteTarget]     = useState<TenantFull | null>(null)
  const [deleteConfirm, setDeleteConfirm]   = useState("")
  const [deleting, setDeleting]             = useState(false)

  const load = async () => {
    setLoading(true)
    setErrorCarga(null)
    try {
      const [users, vets] = await Promise.all([getUsuarios(), getTenantsFull()])
      const counts = await Promise.all(vets.map((v) => getTurnosCount(v.slug)))
      setUsuarios(users)
      setTenants(vets)
      setTurnosPorSlug(Object.fromEntries(vets.map((v, i) => [v.slug, counts[i]])))
    } catch (error) {
      console.error("Error al cargar el panel superadmin:", error)
      setErrorCarga(mensajeError(error, "No se pudieron cargar los datos"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const resumen = useMemo(() => resumenPlataforma(tenants, usuarios), [tenants, usuarios])
  const totalTurnos = useMemo(
    () => Object.values(turnosPorSlug).reduce((acc, c) => acc + c, 0),
    [turnosPorSlug],
  )
  const tenantsVisibles = useMemo(
    () => filtrarTenants(tenants, { busqueda, estado: filtroEstado, plan: filtroPlan }),
    [tenants, busqueda, filtroEstado, filtroPlan],
  )
  const usuariosVisibles = useMemo(
    () => filtrarUsuarios(usuarios, busquedaUsuario, filtroRol),
    [usuarios, busquedaUsuario, filtroRol],
  )

  /**
   * Corre un cambio sobre una veterinaria y avisa cómo salió. Antes un error de
   * la base dejaba el spinner girando para siempre y sin ningún mensaje.
   */
  async function ejecutar(
    slug: string,
    cambios: Partial<TenantFull>,
    mensajeOk: string,
  ): Promise<void> {
    setOcupado(slug)
    try {
      await updateTenantConfig(slug, cambios)
      setTenants((prev) => prev.map((t) => (t.slug === slug ? { ...t, ...cambios } : t)))
      toast.success(mensajeOk)
    } catch (error) {
      console.error("Error al actualizar veterinaria:", error)
      toast.error(mensajeError(error, "No se pudo guardar el cambio"))
    } finally {
      setOcupado(null)
    }
  }

  async function confirmarAccion() {
    if (!accion) return
    setEjecutandoAccion(true)
    try {
      await accion.ejecutar()
    } finally {
      setEjecutandoAccion(false)
      setAccion(null)
    }
  }

  function pedirCambioPlan(t: TenantFull, plan: Plan) {
    const actual = t.plan ?? "basico"
    if (plan === actual) return
    const nombre = t.nombre ?? t.slug
    setAccion({
      titulo: `Cambiar el plan de ${nombre}`,
      descripcion: (
        <p>
          Pasa de <strong>{NOMBRE_PLAN[actual]}</strong> a <strong>{NOMBRE_PLAN[plan]}</strong>.
          Las secciones que no incluya el plan nuevo dejan de estar disponibles en su panel.
        </p>
      ),
      confirmar: `Pasar a ${NOMBRE_PLAN[plan]}`,
      ejecutar: () => ejecutar(t.slug, { plan }, `${nombre} ahora tiene el plan ${NOMBRE_PLAN[plan]}`),
    })
  }

  function pedirPausa(t: TenantFull) {
    const nombre = t.nombre ?? t.slug
    const pausada = t.status === "pausado"
    setAccion(
      pausada
        ? {
            titulo: `Reactivar ${nombre}`,
            descripcion: <p>Vuelve a recibir turnos online desde su página de reservas.</p>,
            confirmar: "Reactivar",
            ejecutar: () => ejecutar(t.slug, { status: "activo" }, `${nombre} está activa otra vez`),
          }
        : {
            titulo: `Pausar ${nombre}`,
            descripcion: (
              <p>
                Deja de recibir turnos online: su página de reservas muestra &quot;Servicio pausado&quot;.
                El panel sigue funcionando y los datos no se tocan.
              </p>
            ),
            confirmar: "Pausar",
            peligrosa: true,
            ejecutar: () => ejecutar(t.slug, { status: "pausado" }, `${nombre} quedó pausada`),
          },
    )
  }

  function extenderTrial(t: TenantFull) {
    const base = t.trialExpiresAt && new Date(t.trialExpiresAt) > new Date()
      ? new Date(t.trialExpiresAt)
      : new Date()
    const nuevoVencimiento = new Date(base.getTime() + DIAS_EXTENSION_TRIAL * 24 * 60 * 60 * 1000)
    ejecutar(
      t.slug,
      { trialExpiresAt: nuevoVencimiento.toISOString() },
      `Prueba de ${t.nombre ?? t.slug} extendida hasta el ${nuevoVencimiento.toLocaleDateString("es-AR")}`,
    )
  }

  function pedirQuitarTrial(t: TenantFull) {
    const nombre = t.nombre ?? t.slug
    setAccion({
      titulo: `Quitar la prueba de ${nombre}`,
      descripcion: (
        <p>
          Deja de tener fecha de vencimiento y sigue con el plan{" "}
          <strong>{NOMBRE_PLAN[t.plan ?? "basico"]}</strong> sin límite de tiempo. Usalo cuando
          ya está pagando. Revisá que el plan sea el que contrató.
        </p>
      ),
      confirmar: "Quitar prueba",
      ejecutar: () => ejecutar(t.slug, { trialExpiresAt: null }, `${nombre} ya no tiene período de prueba`),
    })
  }

  async function verActividad(t: TenantFull) {
    setActividadTenant(t)
    setActividad(null)
    setActividadLoading(true)
    try {
      const [ventasPagina, productosPagina, movimientosStock] = await Promise.all([
        getVentas(t.slug, { porPagina: 1 }),
        getProductos(t.slug, { porPagina: 1, incluirInactivos: true }),
        getMovimientosCount(t.slug),
      ])
      setActividad({
        turnos: turnosPorSlug[t.slug] ?? 0,
        ventas: ventasPagina.total,
        productos: productosPagina.total,
        movimientosStock,
      })
    } catch (error) {
      console.error("Error al cargar actividad:", error)
      toast.error(mensajeError(error, "No se pudo cargar la actividad"))
      setActividadTenant(null)
    } finally {
      setActividadLoading(false)
    }
  }

  function abrirEdicion(t: TenantFull) {
    setEditTenant(t)
    setEditForm({
      nombre: t.nombre ?? "",
      telefono: t.telefono ?? "",
      email: t.email ?? "",
      direccion: t.direccion ?? "",
      ciudad: t.ciudad ?? "",
    })
  }

  async function guardarEdicion() {
    if (!editTenant) return
    setEditSaving(true)
    try {
      await updateTenantConfig(editTenant.slug, editForm)
      setTenants((prev) => prev.map((t) => (t.slug === editTenant.slug ? { ...t, ...editForm } : t)))
      toast.success("Datos guardados")
      setEditTenant(null)
    } catch (error) {
      console.error("Error al editar veterinaria:", error)
      toast.error(mensajeError(error, "No se pudieron guardar los datos"))
    } finally {
      setEditSaving(false)
    }
  }

  async function confirmarEliminar() {
    if (!deleteTarget || deleteConfirm !== deleteTarget.slug) return
    setDeleting(true)
    try {
      await deleteTenant(deleteTarget.slug)
      setTenants((prev) => prev.filter((t) => t.slug !== deleteTarget.slug))
      toast.success(`${deleteTarget.nombre ?? deleteTarget.slug} fue eliminada`)
      setDeleteTarget(null)
      setDeleteConfirm("")
    } catch (error) {
      console.error("Error al eliminar veterinaria:", error)
      toast.error(mensajeError(error, "No se pudo eliminar la veterinaria"))
    } finally {
      setDeleting(false)
    }
  }

  const hayFiltros = busqueda !== "" || filtroEstado !== "todas" || filtroPlan !== "todos"

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-md shadow-violet-500/20">
              <Shield className="size-6 text-white" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Panel Super Admin</h1>
              <p className="text-sm text-muted-foreground">
                Todas las veterinarias y usuarios de la plataforma, en un solo lugar.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="self-start sm:self-auto">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
        {errorCarga && (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">No se pudieron cargar los datos</p>
                <p className="text-xs opacity-80">{errorCarga}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={load}>Reintentar</Button>
          </div>
        )}

        <Indicadores resumen={resumen} totalTurnos={totalTurnos} cargando={loading} />

        {/* Veterinarias */}
        <section aria-labelledby="titulo-veterinarias" className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-col gap-1 border-b px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="titulo-veterinarias" className="text-lg font-bold">Veterinarias</h2>
              <p className="text-xs text-muted-foreground">
                Activas primero. Cambiar el plan, pausar o quitar la prueba pide confirmación.
              </p>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {hayFiltros ? `${tenantsVisibles.length} de ${tenants.length}` : `${tenants.length} en total`}
            </span>
          </div>

          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o slug…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="h-9 pl-8"
                aria-label="Buscar veterinarias"
              />
            </div>
            <Select value={filtroEstado} onValueChange={(v) => setFiltroEstado(v as EstadoFiltro)}>
              <SelectTrigger className="h-9 w-full sm:w-40" aria-label="Filtrar por estado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todos los estados</SelectItem>
                <SelectItem value="activas">Solo activas</SelectItem>
                <SelectItem value="pausadas">Solo pausadas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroPlan} onValueChange={(v) => setFiltroPlan(v as PlanFiltro)}>
              <SelectTrigger className="h-9 w-full sm:w-40" aria-label="Filtrar por plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los planes</SelectItem>
                {(Object.keys(NOMBRE_PLAN) as Plan[]).map((p) => (
                  <SelectItem key={p} value={p}>{NOMBRE_PLAN[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hayFiltros && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() => { setBusqueda(""); setFiltroEstado("todas"); setFiltroPlan("todos") }}
              >
                Limpiar
              </Button>
            )}
          </div>

          <TablaVeterinarias
            tenants={tenantsVisibles}
            hayTenants={tenants.length > 0}
            cargando={loading}
            turnosPorSlug={turnosPorSlug}
            ocupado={ocupado}
            onCambiarPlan={pedirCambioPlan}
            onPausar={pedirPausa}
            onExtenderTrial={extenderTrial}
            onQuitarTrial={pedirQuitarTrial}
            onActividad={verActividad}
            onEditar={abrirEdicion}
            onEliminar={(t) => { setDeleteTarget(t); setDeleteConfirm("") }}
          />
        </section>

        {/* Usuarios */}
        <section aria-labelledby="titulo-usuarios" className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-col gap-1 border-b px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="titulo-usuarios" className="text-lg font-bold">Usuarios</h2>
              <p className="text-xs text-muted-foreground">
                Para dar acceso a alguien al panel, invitalo desde Configuración → Equipo de su
                veterinaria, o editá <code className="rounded bg-muted px-1 py-0.5">usuarios.role</code> en Supabase.
              </p>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {usuariosVisibles.length === usuarios.length
                ? `${usuarios.length} en total`
                : `${usuariosVisibles.length} de ${usuarios.length}`}
            </span>
          </div>
          <TablaUsuarios
            usuarios={usuariosVisibles}
            totalUsuarios={usuarios.length}
            tenants={tenants}
            cargando={loading}
            busqueda={busquedaUsuario}
            rol={filtroRol}
            onBusqueda={setBusquedaUsuario}
            onRol={setFiltroRol}
          />
        </section>
      </main>

      <ConfirmarAccionDialog
        accion={accion}
        ejecutando={ejecutandoAccion}
        onCancelar={() => setAccion(null)}
        onConfirmar={confirmarAccion}
      />

      <ActividadDialog
        tenant={actividadTenant}
        actividad={actividad}
        cargando={actividadLoading}
        onCerrar={() => setActividadTenant(null)}
      />

      <EditarTenantDialog
        tenant={editTenant}
        form={editForm}
        guardando={editSaving}
        onCambiar={(campo, valor) => setEditForm((prev) => ({ ...prev, [campo]: valor }))}
        onCerrar={() => setEditTenant(null)}
        onGuardar={guardarEdicion}
      />

      <EliminarTenantDialog
        tenant={deleteTarget}
        confirmacion={deleteConfirm}
        eliminando={deleting}
        onConfirmacion={setDeleteConfirm}
        onCerrar={() => { setDeleteTarget(null); setDeleteConfirm("") }}
        onEliminar={confirmarEliminar}
      />
    </div>
  )
}
