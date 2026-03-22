"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { signInWithGoogle, getUserRole, getUsuarioData, updateUsuario } from "@/lib/firebase/auth"
import { createTenant } from "@/lib/firebase/firestore"
import { Stethoscope, ArrowRight, Check } from "lucide-react"
import Link from "next/link"

type Step = "login" | "perfil" | "listo"

function toSlug(s: string): string {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-").replace(/^-|-$/g, "") || "mi-veterinaria"
}

export default function RegistroPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [step, setStep] = useState<Step>("login")
  const [uid, setUid]   = useState("")
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    nombreClinica: "",
    telefono: "",
    email: "",
    direccion: "",
    ciudad: "",
  })

  const slugPreview = toSlug(form.nombreClinica)

  // Auto-redirect to dashboard when registration is complete
  useEffect(() => {
    if (step === "listo") {
      const timer = setTimeout(() => {
        router.push(`/${slugPreview}/dashboard`)
      }, 2500)
      return () => clearTimeout(timer)
    }
  }, [step, slugPreview, router])

  // ── Paso 1: Google login ────────────────────────────────────────────────
  async function handleGoogle() {
    setLoading(true)
    try {
      const result = await signInWithGoogle()
      const role = await getUserRole(result.user.uid)

      if (role === "veterinario" || role === "superadmin") {
        // Ya tiene veterinaria → ir directo al panel
        const userData = await getUsuarioData(result.user.uid)
        const tenantId = userData?.tenantId as string | undefined
        router.push(tenantId ? `/${tenantId}/dashboard` : "/admin")
        return
      }

      setUid(result.user.uid)
      setForm(prev => ({
        ...prev,
        email: result.user.email ?? "",
      }))
      setStep("perfil")
    } catch {
      toast({ title: "Error", description: "No se pudo iniciar sesión.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  // ── Paso 2: Crear veterinaria ───────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombreClinica.trim()) {
      toast({ title: "Nombre requerido", description: "Ingresá el nombre de tu clínica.", variant: "destructive" })
      return
    }

    setLoading(true)
    try {
      const tenantId = slugPreview

      // Crear el tenant — doc raíz + config/datos
      await createTenant(tenantId, {
        nombre: form.nombreClinica.trim(),
        plan: "basico",
        adminIds: [uid],
        telefono: form.telefono,
        email: form.email,
        direccion: form.direccion,
        ciudad: form.ciudad,
      })

      // Asignar rol veterinario al usuario y vincular su tenantId
      await updateUsuario(uid, { role: "veterinario", tenantId })

      setStep("listo")
    } catch (error) {
      console.error("Error al crear veterinaria:", error)
      toast({ title: "Error", description: "No se pudo crear la veterinaria. Intentá nuevamente.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <Stethoscope className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-2xl font-extrabold">Registrá tu veterinaria</h1>
          <p className="text-sm text-muted-foreground">
            Configurá tu panel en minutos. Sin tarjeta de crédito.
          </p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 text-xs">
          {(["login", "perfil", "listo"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                ${step === s ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}>
                {i + 1}
              </div>
              {i < 2 && <div className="h-px w-8 bg-border" />}
            </div>
          ))}
        </div>

        {/* ── Paso 1: Login ── */}
        {step === "login" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Creá tu cuenta</CardTitle>
              <CardDescription>Usamos Google para simplificar el acceso.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleGoogle}
                className="w-full"
                size="lg"
                variant="outline"
                disabled={loading}
              >
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {loading ? "Cargando..." : "Continuar con Google"}
              </Button>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                ¿Ya tenés cuenta?{" "}
                <Link href="/login" className="text-emerald-600 hover:underline font-medium">
                  Iniciar sesión
                </Link>
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Paso 2: Perfil ── */}
        {step === "perfil" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Datos de tu clínica</CardTitle>
              <CardDescription>Podés modificarlos después desde la configuración.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="nombre">Nombre de la clínica *</Label>
                  <Input
                    id="nombre"
                    placeholder="Ej: Clínica Veterinaria San Roque"
                    value={form.nombreClinica}
                    onChange={e => setForm(p => ({ ...p, nombreClinica: e.target.value }))}
                    required
                  />
                  {form.nombreClinica && (
                    <p className="text-xs text-muted-foreground">
                      Tu link será: <span className="font-mono text-emerald-600">vetpanel.app/v/{slugPreview}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="telefono">Teléfono</Label>
                  <Input
                    id="telefono"
                    placeholder="+54 11 1234-5678"
                    value={form.telefono}
                    onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">Email de contacto</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="clinica@ejemplo.com"
                    value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ciudad">Ciudad</Label>
                    <Input
                      id="ciudad"
                      placeholder="Buenos Aires"
                      value={form.ciudad}
                      onChange={e => setForm(p => ({ ...p, ciudad: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="direccion">Dirección</Label>
                    <Input
                      id="direccion"
                      placeholder="Av. Corrientes 1234"
                      value={form.direccion}
                      onChange={e => setForm(p => ({ ...p, direccion: e.target.value }))}
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creando..." : (
                    <>
                      Crear mi veterinaria
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* ── Paso 3: Listo ── */}
        {step === "listo" && (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <Check className="h-8 w-8 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400">
                  ¡Listo! Tu veterinaria está creada
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Plan Básico activo — redirigiendo a tu panel...
                </p>
              </div>
              <div className="rounded-lg bg-muted p-3 text-sm font-mono text-left space-y-1">
                <p className="text-xs text-muted-foreground">Tu link público:</p>
                <p className="font-semibold text-emerald-600">/{slugPreview}</p>
              </div>
              <Button className="w-full" onClick={() => router.push(`/${slugPreview}/dashboard`)}>
                Ir a mi panel ahora
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
      <Toaster />
    </main>
  )
}
