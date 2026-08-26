"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { signInWithGoogle, signInWithEmail } from "@/lib/supabase/auth"
import { resolveUserDashboard } from "@/lib/auth/resolveUserDashboard"
import { useAuth } from "@/hooks/use-auth"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { KeyRound, PawPrint, ChevronDown } from "lucide-react"
import Link from "next/link"

export default function LoginPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showEmailForm, setShowEmailForm] = useState(false)

  // Supabase inicia sesión por redirect: el usuario vuelve acá desde /auth/callback.
  // Recién en ese momento podemos resolver su panel y mandarlo al destino correcto.
  useEffect(() => {
    if (authLoading || !user) return
    let cancelado = false
    resolveUserDashboard(user.id)
      .then(({ redirectTo }) => {
        if (!cancelado) router.replace(redirectTo)
      })
      .catch((error) => {
        console.error("No se pudo resolver el panel del usuario:", error)
      })
    return () => { cancelado = true }
  }, [user, authLoading, router])

  const handleGoogleSignIn = async () => {
    setLoading(true)
    try {
      // Navega fuera de la página: nada de lo que venga después se ejecuta.
      await signInWithGoogle("/login")
    } catch (error) {
      console.error("Login error:", error)
      toast({
        title: "Error al iniciar sesión",
        description: "No se pudo iniciar sesión con Google. Por favor, intentá nuevamente.",
        variant: "destructive",
      })
      setLoading(false)
    }
  }

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await signInWithEmail(email, password)
      // onAuthStateChanged actualiza `user` y el useEffect de arriba redirige.
    } catch (error) {
      console.error("Login error:", error)
      toast({
        title: "Error al iniciar sesión",
        description: "Email o contraseña incorrectos.",
        variant: "destructive",
      })
      setLoading(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-emerald-50 via-background to-background px-4 py-8 dark:from-emerald-950/20 md:py-12">
      {/* Blobs decorativos, puramente estéticos */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-900/20" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-emerald-300/30 blur-3xl dark:bg-emerald-800/10" />

      <div className="relative w-full max-w-sm space-y-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 shadow-lg shadow-emerald-600/25">
            <PawPrint className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">VetPanel</h1>
          <p className="text-sm text-muted-foreground">Tu panel de gestión veterinaria</p>
        </div>

        <Card className="border-emerald-100 shadow-xl shadow-emerald-950/5 dark:border-emerald-900/40">
          <CardHeader className="pb-0" />
          <CardContent className="space-y-4 px-6 pb-6 pt-2">
            {/* Google: opción principal, protagonista */}
            <Button
              onClick={handleGoogleSignIn}
              className="h-12 w-full bg-emerald-600 text-base font-medium text-white hover:bg-emerald-700"
              disabled={loading}
            >
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                <path fill="#fff" fillOpacity="0.95" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#fff" fillOpacity="0.8" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#fff" fillOpacity="0.65" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#fff" fillOpacity="0.5" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {loading ? "Iniciando sesión..." : "Continuar con Google"}
            </Button>

            {/* Email/contraseña: opción secundaria, oculta por default */}
            <Collapsible open={showEmailForm} onOpenChange={setShowEmailForm}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Iniciar sesión con email y contraseña
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${showEmailForm ? "rotate-180" : ""}`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <form onSubmit={handleEmailSignIn} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="tu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Contraseña</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" variant="outline" className="w-full" disabled={loading}>
                    {loading ? "Iniciando sesión..." : "Iniciar sesión"}
                  </Button>
                </form>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          ¿Querés sumar tu veterinaria?{" "}
          <Link href="/registro" className="font-medium text-emerald-600 hover:underline">
            Registrate acá
          </Link>
        </p>
      </div>
      <Toaster />
    </main>
  )
}
