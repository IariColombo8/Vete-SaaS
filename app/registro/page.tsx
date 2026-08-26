"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useAuth } from "@/hooks/use-auth"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { signInWithGoogle, signUpWithEmail } from "@/lib/supabase/auth"
import { resolveUserDashboard } from "@/lib/auth/resolveUserDashboard"
import { createTenant, getTenant } from "@/lib/supabase/queries"
import { PawPrint, ArrowRight, Check, Loader2, XCircle, KeyRound, ChevronDown } from "lucide-react"
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
  const { user, loading: authLoading } = useAuth()

  const [step, setStep] = useState<Step>("login")
  const [uid, setUid]   = useState("")
  const [loading, setLoading] = useState(false)
  const [signupEmail, setSignupEmail] = useState("")
  const [signupPassword, setSignupPassword] = useState("")
  const [emailSent, setEmailSent] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)

  const [form, setForm] = useState({
    nombreClinica: "",
    telefono: "",
    email: "",
    direccion: "",
    ciudad: "",
  })

  const slugPreview = toSlug(form.nombreClinica)

  // ── Verificación de slug disponible ────────────────────────────────────────
  type SlugStatus = "idle" | "checking" | "available" | "taken"
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!form.nombreClinica.trim()) { setSlugStatus("idle"); return }

    setSlugStatus("checking")
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      const existing = await getTenant(slugPreview)
      setSlugStatus(existing ? "taken" : "available")
    }, 500)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [slugPreview, form.nombreClinica])

  // Auto-redirect al onboarding cuando el registro se completa
  useEffect(() => {
    if (step === "listo") {
      const timer = setTimeout(() => {
        router.push(`/${slugPreview}/onboarding`)
      }, 2500)
      return () => clearTimeout(timer)
    }
  }, [step, slugPreview, router])

  // ── Paso 1: Google login ────────────────────────────────────────────────
  // Supabase inicia sesión por redirect: el usuario vuelve acá desde /auth/callback.
  // Recién entonces resolvemos su rol y decidimos si sigue al paso "perfil".
  useEffect(() => {
    if (authLoading || !user || step !== "login") return
    let cancelado = false

    resolveUserDashboard(user.id)
      .then(({ role, redirectTo }) => {
        if (cancelado) return
        if (role === "veterinario" || role === "superadmin") {
          router.replace(redirectTo)
          return
        }
        setUid(user.id)
        setForm(prev => ({ ...prev, email: user.email ?? "" }))
        setStep("perfil")
      })
      .catch((error) => {
        console.error("No se pudo resolver el rol del usuario:", error)
        if (!cancelado) {
          toast({ title: "Error", description: "No se pudo iniciar sesión.", variant: "destructive" })
        }
      })

    return () => { cancelado = true }
  }, [user, authLoading, step, router, toast])

  async function handleGoogle() {
    setLoading(true)
    try {
      // Navega fuera de la página: nada de lo que venga después se ejecuta.
      await signInWithGoogle("/registro")
    } catch {
      toast({ title: "Error", description: "No se pudo iniciar sesión.", variant: "destructive" })
      setLoading(false)
    }
  }

  // Alta con email/contraseña. Si Supabase requiere confirmación por mail,
  // no hay sesión todavía: se le pide al usuario que confirme y vuelva a
  // entrar por /login, donde el useAuth de arriba lo trae de nuevo acá.
  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await signUpWithEmail(signupEmail, signupPassword)
      setEmailSent(true)
    } catch (error) {
      console.error("Error al registrarse:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo crear la cuenta.",
        variant: "destructive",
      })
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

      // Validar que el slug no esté tomado (segunda verificación antes de escribir)
      const existing = await getTenant(tenantId)
      if (existing) {
        toast({
          title: "Ese nombre ya está en uso",
          description: "Probá con un nombre diferente para tu clínica.",
          variant: "destructive",
        })
        setSlugStatus("taken")
        setLoading(false)
        return
      }

      // Crea el tenant Y asigna el rol veterinario al usuario, en una sola
      // transacción del lado del servidor (ver supabase/003_registro_veterinaria.sql).
      await createTenant(
        tenantId,
        {
          nombre: form.nombreClinica.trim(),
          plan: "pro",
          adminIds: [uid],
          telefono: form.telefono,
          email: form.email,
          direccion: form.direccion,
          ciudad: form.ciudad,
        },
        10,
      )

      setStep("listo")
    } catch (error) {
      // Carrera con otro registro simultáneo: el slug se ocupó entre la
      // validación de arriba y el alta.
      if (error instanceof Error && error.message === "SLUG_TAKEN") {
        setSlugStatus("taken")
        toast({
          title: "Ese nombre ya está en uso",
          description: "Probá con un nombre diferente para tu clínica.",
          variant: "destructive",
        })
        return
      }
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
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 shadow-lg shadow-emerald-600/25">
            <PawPrint className="h-7 w-7 text-white" />
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
              <CardDescription>Empezá con Google en un paso.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={handleGoogle}
                className="h-12 w-full bg-emerald-600 text-base font-medium text-white hover:bg-emerald-700"
                disabled={loading}
              >
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#fff" fillOpacity="0.95" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#fff" fillOpacity="0.8" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#fff" fillOpacity="0.65" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#fff" fillOpacity="0.5" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {loading ? "Cargando..." : "Continuar con Google"}
              </Button>

              {emailSent ? (
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-4 text-sm text-center space-y-1">
                  <p className="font-medium text-emerald-700 dark:text-emerald-400">
                    Revisá tu email
                  </p>
                  <p className="text-muted-foreground">
                    Te enviamos un link para confirmar tu cuenta. Una vez confirmada, iniciá sesión.
                  </p>
                </div>
              ) : (
                <Collapsible open={showEmailForm} onOpenChange={setShowEmailForm}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Crear cuenta con email y contraseña
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${showEmailForm ? "rotate-180" : ""}`}
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-4">
                    <form onSubmit={handleEmailSignup} className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="signupEmail">Email</Label>
                        <Input
                          id="signupEmail"
                          type="email"
                          placeholder="tu@email.com"
                          value={signupEmail}
                          onChange={(e) => setSignupEmail(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="signupPassword">Contraseña</Label>
                        <Input
                          id="signupPassword"
                          type="password"
                          minLength={6}
                          value={signupPassword}
                          onChange={(e) => setSignupPassword(e.target.value)}
                          required
                        />
                      </div>
                      <Button type="submit" variant="outline" className="w-full" disabled={loading}>
                        {loading ? "Creando cuenta..." : "Crear cuenta con email"}
                      </Button>
                    </form>
                  </CollapsibleContent>
                </Collapsible>
              )}

              <p className="text-center text-xs text-muted-foreground">
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
                    <div className="flex items-center gap-1.5 text-xs">
                      {slugStatus === "checking" && (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          <span className="text-muted-foreground font-mono">vetpanel.com.ar/{slugPreview}</span>
                        </>
                      )}
                      {slugStatus === "available" && (
                        <>
                          <Check className="h-3 w-3 text-emerald-600" />
                          <span className="font-mono text-emerald-600">vetpanel.com.ar/{slugPreview}</span>
                          <span className="text-emerald-600">— disponible</span>
                        </>
                      )}
                      {slugStatus === "taken" && (
                        <>
                          <XCircle className="h-3 w-3 text-destructive" />
                          <span className="font-mono text-destructive">vetpanel.com.ar/{slugPreview}</span>
                          <span className="text-destructive">— ya está en uso</span>
                        </>
                      )}
                    </div>
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

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || slugStatus === "taken" || slugStatus === "checking"}
                >
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
                  Plan Pro activo por 10 días, con datos de ejemplo cargados —
                  redirigiendo a tu panel...
                </p>
              </div>
              <div className="rounded-lg bg-muted p-3 text-sm font-mono text-left space-y-1">
                <p className="text-xs text-muted-foreground">Tu link público:</p>
                <p className="font-semibold text-emerald-600">/{slugPreview}</p>
              </div>
              <Button className="w-full" onClick={() => router.push(`/${slugPreview}/onboarding`)}>
                Configurar mi veterinaria
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
