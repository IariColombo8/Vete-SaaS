"use client"

import { useState } from "react"
import { CheckCircle2, UserPlus } from "lucide-react"
import { useSlug } from "@/context/slug-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function HacermeClientePage() {
  const slug = useSlug()
  const [nombre, setNombre] = useState("")
  const [telefono, setTelefono] = useState("")
  const [email, setEmail] = useState("")
  const [dni, setDni] = useState("")
  const [domicilio, setDomicilio] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState("")

  const enviar = async () => {
    if (!nombre.trim()) {
      setError("Ingresá tu nombre")
      return
    }
    setError("")
    setEnviando(true)
    try {
      const res = await fetch("/api/clientes/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: slug, nombre, telefono, email, dni, domicilio }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo completar el registro")
      setEnviado(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar el registro")
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-6 dark:bg-slate-950">
        <div className="max-w-sm text-center">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
          <h1 className="mb-2 text-xl font-bold">¡Listo!</h1>
          <p className="text-sm text-muted-foreground">Ya sos cliente. Gracias por sumarte.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white py-16 dark:bg-slate-950">
      <div className="mx-auto max-w-sm space-y-6 px-6">
        <div className="flex items-center gap-3">
          <UserPlus className="h-6 w-6 text-emerald-500" />
          <h1 className="text-2xl font-bold">Hacerme cliente</h1>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Teléfono</Label>
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">DNI (opcional)</Label>
            <Input value={dni} onChange={(e) => setDni(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Domicilio (opcional)</Label>
            <Input value={domicilio} onChange={(e) => setDomicilio(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            disabled={enviando}
            onClick={enviar}
          >
            {enviando ? "Enviando…" : "Confirmar"}
          </Button>
        </div>
      </div>
    </main>
  )
}
