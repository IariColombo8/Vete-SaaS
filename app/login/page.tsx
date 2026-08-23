"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { signInWithGoogle } from "@/lib/supabase/auth"
import { resolveUserDashboard } from "@/lib/auth/resolveUserDashboard"
import { useAuth } from "@/hooks/use-auth"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { Stethoscope } from "lucide-react"
import Link from "next/link"

export default function LoginPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(false)

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

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-8 md:py-12">
      <div className="w-full max-w-md space-y-4">
        <Card className="shadow-lg">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <Stethoscope className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <CardTitle className="text-2xl md:text-3xl">Iniciar sesión</CardTitle>
            <CardDescription className="text-sm md:text-base">
              Accedé a tu panel con tu cuenta de Google
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-6 md:px-6">
            <Button
              onClick={handleGoogleSignIn}
              className="w-full text-base"
              size="lg"
              disabled={loading}
              variant="outline"
            >
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {loading ? "Iniciando sesión..." : "Continuar con Google"}
            </Button>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              ¿Querés sumar tu veterinaria?{" "}
              <Link href="/registro" className="text-emerald-600 hover:underline font-medium">
                Registrate acá
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
      <Toaster />
    </main>
  )
}
