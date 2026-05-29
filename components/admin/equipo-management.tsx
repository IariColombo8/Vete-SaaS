"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  createInvitacion,
  getInvitacionesByTenant,
  deleteInvitacion,
  type Invitacion,
} from "@/lib/firebase/firestore"
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

  const cargar = async () => {
    setLoading(true)
    try {
      setInvitaciones(await getInvitacionesByTenant(tenantId))
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
    setSaving(true)
    try {
      await createInvitacion(tenantId, emailNormalizado, role, user?.uid)
      toast({
        title: "Invitación creada",
        description: `${emailNormalizado} obtendrá acceso al iniciar sesión con ese email.`,
      })
      setEmail("")
      await cargar()
    } catch (error) {
      console.error("Error creando invitación:", error)
      toast({ title: "Error", description: "No se pudo crear la invitación.", variant: "destructive" })
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
            <Label className="text-xs">Rol</Label>
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
