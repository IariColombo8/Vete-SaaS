"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Ayuda } from "@/components/ui/ayuda"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  createInvitacion,
  getInvitacionesByTenant,
  deleteInvitacion,
  getTenantConfig,
  type Invitacion,
} from "@/lib/supabase/queries"
import { getPlan } from "@/lib/plans"
import { UpgradePlanButton } from "@/components/billing/upgrade-plan-button"
import { useAuth } from "@/hooks/use-auth"
import { Loader2, Plus, Trash2, UserPlus, Mail, Clock, CheckCircle2 } from "lucide-react"

const ROLES: { value: "veterinario" | "empleado"; label: string; desc: string }[] = [
  { value: "empleado", label: "Empleado", desc: "Turnos, libreta y clientes (sin configuración)" },
  { value: "veterinario", label: "Veterinario", desc: "Acceso completo, incluida la configuración" },
]

export function EquipoManagement({ tenantId }: { tenantId: string }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"veterinario" | "empleado">("empleado")
  const [plan, setPlan] = useState<string | undefined>(undefined)

  // Cada invitación ocupa un lugar (pendiente o aceptada) y el dueño ocupa
  // otro. Borrar una invitación pendiente libera el lugar.
  const maxUsuarios = getPlan(plan).limits.maxUsuarios
  const lugaresUsados = invitaciones.length + 1
  const topeAlcanzado = maxUsuarios !== null && lugaresUsados >= maxUsuarios

  const cargar = async () => {
    setLoading(true)
    try {
      const [invs, cfg] = await Promise.all([getInvitacionesByTenant(tenantId), getTenantConfig(tenantId)])
      setInvitaciones(invs)
      setPlan(cfg?.plan)
    } catch (error) {
      console.error("Error cargando invitaciones:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  const handleInvitar = async () => {
    const emailNormalizado = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
      toast({ title: "Email inválido", description: "Ingresá un email válido.", variant: "destructive" })
      return
    }
    const yaInvitado = invitaciones.some((i) => i.email.toLowerCase() === emailNormalizado)
    if (topeAlcanzado && !yaInvitado) {
      toast({
        title: "Llegaste al límite de usuarios",
        description: `Tu plan ${getPlan(plan).nombre} incluye hasta ${maxUsuarios} usuarios. Pasá a Pro para sumar más.`,
        variant: "destructive",
      })
      return
    }
    setSaving(true)
    try {
      await createInvitacion(tenantId, emailNormalizado, role, user?.id)
      toast({
        title: "Invitación creada",
        description: `${emailNormalizado} obtendrá acceso al iniciar sesión con ese email.`,
      })
      setEmail("")
      await cargar()
    } catch (error) {
      console.error("Error creando invitación:", error)
      const porLimite = error instanceof Error && error.message.includes("PLAN_USER_LIMIT")
      toast({
        title: porLimite ? "Llegaste al límite de usuarios" : "Error",
        description: porLimite ? "Tu plan no admite más usuarios. Pasá a Pro para sumar más." : "No se pudo crear la invitación.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleEliminar = async (id?: string) => {
    if (!id) return
    try {
      await deleteInvitacion(id)
      setInvitaciones((prev) => prev.filter((i) => i.id !== id))
      toast({ title: "Invitación eliminada" })
    } catch (error) {
      console.error("Error eliminando invitación:", error)
      toast({ title: "Error", description: "No se pudo eliminar.", variant: "destructive" })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Equipo
        </CardTitle>
        <CardDescription>
          Invitá veterinarios o empleados por email. Obtendrán acceso al panel cuando inicien sesión con ese email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {maxUsuarios !== null && !loading && (
          <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm ${
            topeAlcanzado
              ? "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"
              : "bg-muted/30"
          }`}>
            <div>
              <p className="font-semibold">Usuarios: {lugaresUsados} de {maxUsuarios}</p>
              <p className="text-xs text-muted-foreground">
                {topeAlcanzado
                  ? `Tu plan ${getPlan(plan).nombre} no admite más usuarios. Con Pro son ilimitados.`
                  : "Contás vos y cada persona que invites."}
              </p>
            </div>
            {topeAlcanzado && <UpgradePlanButton tenantId={tenantId} planActual={plan} />}
          </div>
        )}

        {/* Formulario de invitación */}
        <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Email del invitado</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="persona@ejemplo.com"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="gap-1.5 text-xs">Rol <Ayuda tema="config.roles" /></Label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  className={`flex flex-col items-start gap-0.5 p-2.5 rounded-lg border-2 text-left transition-all ${
                    role === r.value
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                      : "border-muted hover:border-muted-foreground/30"
                  }`}
                >
                  <span className="text-sm font-semibold">{r.label}</span>
                  <span className="text-[10px] leading-tight text-muted-foreground">{r.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <Button
            onClick={handleInvitar}
            disabled={saving}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {saving ? "Creando..." : "Invitar"}
          </Button>
        </div>

        {/* Listado de invitaciones */}
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : invitaciones.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Todavía no invitaste a nadie.
          </p>
        ) : (
          <div className="space-y-2">
            {invitaciones.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{inv.email}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {inv.role === "veterinario" ? "Veterinario" : "Empleado"}
                      </Badge>
                      {inv.estado === "aceptada" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> Aceptada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                          <Clock className="h-3 w-3" /> Pendiente
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => handleEliminar(inv.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
