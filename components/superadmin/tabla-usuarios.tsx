"use client"

import Link from "next/link"
import { Search, Users } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { EstadoVacio } from "@/components/admin/estado-vacio"
import type { TenantFull, UserRole, Usuario } from "@/lib/supabase/types"
import { rolDeUsuario, type RolFiltro } from "@/lib/superadmin/resumen"
import type { UsoResumen } from "@/lib/superadmin/actividad"
import { ETIQUETA_ROL, EtiquetaRol } from "./etiquetas"
import { UsoPanel } from "./uso-panel"

interface Props {
  usuarios: Usuario[]
  totalUsuarios: number
  tenants: TenantFull[]
  cargando: boolean
  busqueda: string
  rol: RolFiltro
  onBusqueda: (v: string) => void
  onRol: (v: RolFiltro) => void
  /** Uso del panel en los últimos 30 días, por uid. */
  uso: Record<string, UsoResumen>
  ahora: Date
}

export function TablaUsuarios({
  usuarios, totalUsuarios, tenants, cargando, busqueda, rol, onBusqueda, onRol, uso, ahora,
}: Props) {
  const nombreTenant = new Map(tenants.map((t) => [t.slug, t.nombre ?? t.slug]))

  return (
    <div>
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o email…"
            value={busqueda}
            onChange={(e) => onBusqueda(e.target.value)}
            className="h-9 pl-8"
            aria-label="Buscar usuarios"
          />
        </div>
        <Select value={rol} onValueChange={(v) => onRol(v as RolFiltro)}>
          <SelectTrigger className="h-9 w-full sm:w-44" aria-label="Filtrar por rol">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los roles</SelectItem>
            {(Object.keys(ETIQUETA_ROL) as UserRole[]).map((r) => (
              <SelectItem key={r} value={r}>{ETIQUETA_ROL[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {cargando ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : totalUsuarios === 0 ? (
        <EstadoVacio icono={<Users />} titulo="Sin usuarios" descripcion="Todavía no inició sesión nadie en la plataforma." />
      ) : usuarios.length === 0 ? (
        <EstadoVacio icono={<Search />} titulo="Ningún resultado" descripcion="Ningún usuario coincide con la búsqueda o el rol elegido." />
      ) : (
        // Entra en el ancho de la pantalla, sin scroll horizontal: el email va
        // debajo del nombre y las columnas secundarias se esconden en pantallas angostas.
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Usuario</th>
              <th className="hidden px-4 py-2.5 text-left font-medium md:table-cell">Veterinaria</th>
              <th className="px-4 py-2.5 text-left font-medium">Rol</th>
              <th className="hidden w-56 px-4 py-2.5 text-left font-medium lg:table-cell">Uso del panel (30 días)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {usuarios.map((u) => (
              <tr key={u.uid} className="transition-colors hover:bg-muted/30">
                <td className="max-w-0 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    {u.photoURL ? (
                      // eslint-disable-next-line @next/next/no-img-element -- foto de Google, URL externa
                      <img src={u.photoURL} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold" aria-hidden>
                        {(u.displayName ?? u.email ?? "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-medium">{u.displayName ?? "Sin nombre"}</div>
                      <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                      {u.tenantId && (
                        <div className="truncate text-xs text-muted-foreground md:hidden">
                          {nombreTenant.get(u.tenantId) ?? u.tenantId}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="hidden px-4 py-2.5 md:table-cell">
                  {u.tenantId ? (
                    <Link
                      href={`/${u.tenantId}/admin`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      {nombreTenant.get(u.tenantId) ?? u.tenantId}
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5"><EtiquetaRol rol={rolDeUsuario(u)} /></td>
                <td className="hidden px-4 py-2.5 lg:table-cell">
                  {u.role === "veterinario" || u.role === "empleado" ? (
                    <UsoPanel uso={uso[u.uid]} ahora={ahora} compacto />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
