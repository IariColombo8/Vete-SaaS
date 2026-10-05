"use client"

import Link from "next/link"
import { Search, Users } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { EstadoVacio } from "@/components/admin/estado-vacio"
import type { TenantFull, UserRole, Usuario } from "@/lib/supabase/types"
import { rolDeUsuario, type RolFiltro } from "@/lib/superadmin/resumen"
import { ETIQUETA_ROL, EtiquetaRol } from "./etiquetas"

interface Props {
  usuarios: Usuario[]
  totalUsuarios: number
  tenants: TenantFull[]
  cargando: boolean
  busqueda: string
  rol: RolFiltro
  onBusqueda: (v: string) => void
  onRol: (v: RolFiltro) => void
}

export function TablaUsuarios({ usuarios, totalUsuarios, tenants, cargando, busqueda, rol, onBusqueda, onRol }: Props) {
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Usuario</th>
                <th className="px-4 py-3 text-left font-semibold">Email</th>
                <th className="px-4 py-3 text-left font-semibold">Veterinaria</th>
                <th className="px-4 py-3 text-left font-semibold">Rol</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {usuarios.map((u) => (
                <tr key={u.uid} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {u.photoURL ? (
                        // eslint-disable-next-line @next/next/no-img-element -- foto de Google, URL externa
                        <img src={u.photoURL} alt="" className="h-7 w-7 rounded-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold" aria-hidden>
                          {(u.displayName ?? u.email ?? "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="font-medium">{u.displayName ?? "Sin nombre"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3">
                    {u.tenantId ? (
                      <Link
                        href={`/${u.tenantId}/admin`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        {nombreTenant.get(u.tenantId) ?? u.tenantId}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><EtiquetaRol rol={rolDeUsuario(u)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
