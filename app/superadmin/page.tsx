"use client"

import { useEffect, useState } from "react"
import { getUsuarios, getTenantsFull, updateTenantConfig, getTurnos, getProductos, getMovimientosCount } from "@/lib/supabase/queries"
import { getVentas } from "@/lib/supabase/ventas"
import type { Usuario, TenantFull } from "@/lib/supabase/queries"
import { Shield, Users, CalendarDays, Stethoscope, ExternalLink, RefreshCw, PauseCircle, PlayCircle, Activity } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import Link from "next/link"
import type React from "react"

interface ActividadTenant {
  turnos: number
  ventas: number
  productos: number
  movimientosStock: number
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number | string; color: string }) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg mb-4 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-3xl font-extrabold">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

const planLabel: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  basico:  { label: "Básico",  variant: "secondary" },
  plus:    { label: "Plus",    variant: "default" },
  pro:     { label: "Pro",     variant: "destructive" },
}

const roleLabel: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  superadmin: { label: "Super Admin", variant: "destructive" },
  veterinario: { label: "Veterinario", variant: "default" },
  usuario: { label: "Usuario", variant: "secondary" },
}

export default function SuperAdminPage() {
  const [usuarios, setUsuarios]       = useState<Usuario[]>([])
  const [tenants, setTenants]         = useState<TenantFull[]>([])
  const [totalTurnos, setTotalTurnos] = useState(0)
  const [turnosPorSlug, setTurnosPorSlug] = useState<Record<string, number>>({})
  const [loading, setLoading]         = useState(true)
  const [updating, setUpdating]       = useState<string | null>(null)
  const [actividadTenant, setActividadTenant] = useState<TenantFull | null>(null)
  const [actividad, setActividad]     = useState<ActividadTenant | null>(null)
  const [actividadLoading, setActividadLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    const [users, vets] = await Promise.all([
      getUsuarios(),
      getTenantsFull(),
    ])
    const turnosLists = await Promise.all(vets.map((v) => getTurnos(v.slug)))
    const porSlug: Record<string, number> = {}
    vets.forEach((v, i) => { porSlug[v.slug] = turnosLists[i].length })
    setUsuarios(users)
    setTenants(vets)
    setTurnosPorSlug(porSlug)
    setTotalTurnos(turnosLists.reduce((acc, t) => acc + t.length, 0))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const superadmins = usuarios.filter((u) => u.role === "superadmin")

  async function handlePlanChange(tenantId: string, plan: TenantFull["plan"]) {
    setUpdating(tenantId + "-plan")
    await updateTenantConfig(tenantId, { plan })
    setTenants(prev => prev.map(t => t.slug === tenantId ? { ...t, plan } : t))
    setUpdating(null)
  }

  async function handleTogglePause(tenant: TenantFull) {
    const newStatus = tenant.status === "pausado" ? "activo" : "pausado"
    setUpdating(tenant.slug + "-status")
    await updateTenantConfig(tenant.slug, { status: newStatus })
    setTenants(prev => prev.map(t => t.slug === tenant.slug ? { ...t, status: newStatus } : t))
    setUpdating(null)
  }

  async function handleExtenderTrial(tenant: TenantFull) {
    const base = tenant.trialExpiresAt && new Date(tenant.trialExpiresAt) > new Date()
      ? new Date(tenant.trialExpiresAt)
      : new Date()
    const nuevoVencimiento = new Date(base.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString()
    setUpdating(tenant.slug + "-trial")
    await updateTenantConfig(tenant.slug, { trialExpiresAt: nuevoVencimiento })
    setTenants(prev => prev.map(t => t.slug === tenant.slug ? { ...t, trialExpiresAt: nuevoVencimiento } : t))
    setUpdating(null)
  }

  async function handleQuitarTrial(tenant: TenantFull) {
    setUpdating(tenant.slug + "-trial")
    await updateTenantConfig(tenant.slug, { trialExpiresAt: null })
    setTenants(prev => prev.map(t => t.slug === tenant.slug ? { ...t, trialExpiresAt: null } : t))
    setUpdating(null)
  }

  async function handleVerActividad(tenant: TenantFull) {
    setActividadTenant(tenant)
    setActividad(null)
    setActividadLoading(true)
    const [ventasPagina, productosPagina, movimientosStock] = await Promise.all([
      getVentas(tenant.slug, { porPagina: 1 }),
      getProductos(tenant.slug, { porPagina: 1, incluirInactivos: true }),
      getMovimientosCount(tenant.slug),
    ])
    setActividad({
      turnos: turnosPorSlug[tenant.slug] ?? 0,
      ventas: ventasPagina.total,
      productos: productosPagina.total,
      movimientosStock,
    })
    setActividadLoading(false)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-md">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <h1 className="text-2xl font-extrabold">Panel Super Admin</h1>
              </div>
              <p className="text-muted-foreground text-sm">
                Control global de todas las veterinarias y usuarios de la plataforma.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </div>
        </div>
      </div>

      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <StatCard icon={Users}       label="Usuarios registrados" value={loading ? "—" : usuarios.length}  color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
          <StatCard icon={Stethoscope} label="Veterinarias activas"  value={loading ? "—" : tenants.length}   color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" />
          <StatCard icon={CalendarDays} label="Turnos totales"       value={loading ? "—" : totalTurnos}       color="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400" />
          <StatCard icon={Shield}      label="Super Admins"          value={loading ? "—" : superadmins.length} color="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" />
        </div>

        {/* Veterinarias */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Veterinarias registradas</h2>
            <Badge variant="secondary">{tenants.length} total</Badge>
          </div>
          <div className="rounded-xl border overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Cargando...
              </div>
            ) : tenants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Stethoscope className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">No hay veterinarias registradas aún.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Veterinaria</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Plan</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Turnos</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Estado</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Trial</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tenants.map((t) => {
                    const isPaused = t.status === "pausado"
                    const isUpdatingThis = updating?.startsWith(t.slug)
                    return (
                      <tr key={t.slug} className={`hover:bg-muted/30 transition-colors ${isPaused ? "opacity-60" : ""}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium">{t.nombre ?? t.slug}</div>
                          <div className="text-xs text-muted-foreground font-mono">/{t.slug}</div>
                          {t.ciudad && (
                            <div className="text-xs text-muted-foreground">{t.ciudad}</div>
                          )}
                        </td>

                        {/* Plan selector */}
                        <td className="px-4 py-3">
                          <Select
                            value={t.plan ?? "basico"}
                            onValueChange={(val) => handlePlanChange(t.slug, val as TenantFull["plan"])}
                            disabled={isUpdatingThis}
                          >
                            <SelectTrigger className="h-7 w-28 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="basico">Básico</SelectItem>
                              <SelectItem value="plus">Plus</SelectItem>
                              <SelectItem value="pro">Pro</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>

                        {/* Turnos */}
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm">
                            {loading ? "—" : (turnosPorSlug[t.slug] ?? 0)}
                          </span>
                        </td>

                        {/* Estado */}
                        <td className="px-4 py-3">
                          <Badge variant={isPaused ? "destructive" : "secondary"}>
                            {isPaused ? "Pausada" : "Activa"}
                          </Badge>
                        </td>

                        {/* Trial */}
                        <td className="px-4 py-3">
                          {t.trialExpiresAt ? (
                            <div className="flex flex-col gap-1">
                              <span className={`text-xs font-mono ${new Date(t.trialExpiresAt) < new Date() ? "text-destructive" : "text-muted-foreground"}`}>
                                {new Date(t.trialExpiresAt).toLocaleDateString("es-AR")}
                                {t.createdAt && (
                                  <span className="text-muted-foreground/70">
                                    {" "}· creada {new Date(t.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                )}
                              </span>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost" size="sm" className="text-[10px] h-6 px-1.5"
                                  onClick={() => handleExtenderTrial(t)}
                                  disabled={updating?.startsWith(t.slug)}
                                >
                                  +10 días
                                </Button>
                                <Button
                                  variant="ghost" size="sm" className="text-[10px] h-6 px-1.5 text-emerald-600"
                                  onClick={() => handleQuitarTrial(t)}
                                  disabled={updating?.startsWith(t.slug)}
                                >
                                  Quitar trial
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                              {t.createdAt && (
                                <span className="text-muted-foreground/70">
                                  {" "}· creada {new Date(t.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              )}
                            </span>
                          )}
                        </td>

                        {/* Acciones */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => handleVerActividad(t)}
                            >
                              <Activity className="h-3 w-3 mr-1" />
                              Actividad
                            </Button>
                            <Button
                              variant={isPaused ? "outline" : "ghost"}
                              size="sm"
                              className={`text-xs h-7 ${isPaused ? "text-emerald-600 border-emerald-300" : "text-orange-600 hover:text-orange-700"}`}
                              onClick={() => handleTogglePause(t)}
                              disabled={isUpdatingThis}
                            >
                              {isUpdatingThis && updating?.endsWith("-status") ? (
                                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                              ) : isPaused ? (
                                <PlayCircle className="h-3 w-3 mr-1" />
                              ) : (
                                <PauseCircle className="h-3 w-3 mr-1" />
                              )}
                              {isPaused ? "Reactivar" : "Pausar"}
                            </Button>
                            <Link href={`/${t.slug}/admin`} target="_blank">
                              <Button variant="ghost" size="sm" className="text-xs h-7">
                                <ExternalLink className="h-3 w-3 mr-1" />
                                Ver panel
                              </Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Todos los usuarios */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Todos los usuarios</h2>
            <Badge variant="secondary">{usuarios.length} total</Badge>
          </div>
          <div className="rounded-xl border overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Cargando...
              </div>
            ) : usuarios.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                Sin usuarios registrados.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Usuario</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Veterinaria</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Rol</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {usuarios.map((u) => {
                    const r = u.role || (u.isAdmin ? "veterinario" : "usuario")
                    const rl = roleLabel[r] ?? roleLabel["usuario"]
                    const tenantVet = u.tenantId
                      ? tenants.find(t => t.slug === u.tenantId)
                      : null
                    return (
                      <tr key={u.uid} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {u.photoURL ? (
                              <img src={u.photoURL} alt="" className="h-7 w-7 rounded-full object-cover" />
                            ) : (
                              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                                {(u.displayName ?? u.email ?? "?")[0].toUpperCase()}
                              </div>
                            )}
                            <span className="font-medium">{u.displayName ?? "Sin nombre"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                        <td className="px-4 py-3">
                          {u.tenantId ? (
                            <Link href={`/${u.tenantId}/admin`} target="_blank" className="group">
                              <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 group-hover:underline">
                                {tenantVet?.nombre ?? u.tenantId}
                              </span>
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={rl.variant}>{rl.label}</Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Para cambiar el rol de un usuario, editá el campo <code className="bg-muted px-1 py-0.5 rounded">role</code> en Firestore → colección <code className="bg-muted px-1 py-0.5 rounded">usuarios</code>.
          </p>
        </section>
      </div>

      {/* Modal de actividad */}
      <Dialog open={!!actividadTenant} onOpenChange={(open) => { if (!open) setActividadTenant(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Actividad de {actividadTenant?.nombre ?? actividadTenant?.slug}</DialogTitle>
            <DialogDescription>
              Movimientos registrados por esta veterinaria en la plataforma.
            </DialogDescription>
          </DialogHeader>
          {actividadLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Cargando...
            </div>
          ) : actividad ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-4">
                <p className="text-2xl font-extrabold">{actividad.turnos}</p>
                <p className="text-xs text-muted-foreground mt-1">Turnos creados</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-2xl font-extrabold">{actividad.ventas}</p>
                <p className="text-xs text-muted-foreground mt-1">Ventas registradas</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-2xl font-extrabold">{actividad.productos}</p>
                <p className="text-xs text-muted-foreground mt-1">Productos cargados</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-2xl font-extrabold">{actividad.movimientosStock}</p>
                <p className="text-xs text-muted-foreground mt-1">Movimientos de stock</p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
