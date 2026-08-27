"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSlug } from "@/context/slug-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RegistroClienteDialog } from "@/components/turnos/RegistroClienteDialog"
import { getClienteByDNI } from "@/lib/supabase/clientes"
import { getMascotas } from "@/lib/supabase/mascotas"
import { MASCOTAS_DEFAULT } from "@/lib/turno-defaults"
import type { Cliente, Mascota } from "@/lib/supabase/types"
import { Search, Loader2, PawPrint, CalendarPlus } from "lucide-react"

function emojiPorTipo(tipo: string): string {
  return MASCOTAS_DEFAULT.find((m) => m.id === tipo)?.emoji ?? "🐾"
}

export default function MiHistoriaPage() {
  const slug = useSlug()
  const router = useRouter()
  const [dni, setDni] = useState("")
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [mascotas, setMascotas] = useState<Mascota[]>([])

  const buscar = async () => {
    if (!dni.trim()) return
    setLoading(true)
    setBuscado(false)
    try {
      const encontrado = await getClienteByDNI(slug, dni.trim())
      setCliente(encontrado)
      if (encontrado?.id) {
        const misMascotas = await getMascotas(slug, encontrado.id)
        setMascotas(misMascotas)
      } else {
        setMascotas([])
      }
    } finally {
      setLoading(false)
      setBuscado(true)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-muted/30 via-muted/50 to-muted/30 py-8 md:py-16">
      <div className="container max-w-3xl px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <PawPrint className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100">
            Historia clínica de mi mascota
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Ingresá tu DNI para ver los datos de tus mascotas.
          </p>
        </div>

        <Card>
          <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-end gap-3">
            <div className="w-full space-y-1.5">
              <Label htmlFor="buscar-dni">DNI</Label>
              <Input
                id="buscar-dni"
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && buscar()}
                placeholder="30123456"
              />
            </div>
            <Button onClick={buscar} disabled={loading || !dni.trim()} className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Buscar
            </Button>
          </CardContent>
        </Card>

        {buscado && !cliente && (
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
            <CardContent className="py-8 text-center space-y-4">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                No encontramos datos con ese DNI.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button onClick={() => router.push(`/${slug}/turno`)} className="bg-emerald-600 hover:bg-emerald-700">
                  <CalendarPlus className="mr-2 h-4 w-4" />
                  Sacar turno
                </Button>
                <RegistroClienteDialog tenantId={slug} />
              </div>
            </CardContent>
          </Card>
        )}

        {buscado && cliente && mascotas.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Hola {cliente.nombre.split(" ")[0]}, todavía no cargaste mascotas.
            </CardContent>
          </Card>
        )}

        {buscado && cliente && mascotas.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Hola {cliente.nombre.split(" ")[0]}, elegí una mascota:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {mascotas.map((mascota) => (
                <Card
                  key={mascota.id}
                  className="hover:border-emerald-400 transition-colors cursor-pointer overflow-hidden"
                  onClick={() => router.push(`/${slug}/mi-historia/${mascota.id}?dni=${encodeURIComponent(dni.trim())}`)}
                >
                  <div
                    className="h-24 bg-cover bg-center flex items-center justify-center text-4xl"
                    style={
                      mascota.fotoUrl
                        ? { backgroundImage: `url(${mascota.fotoUrl})` }
                        : { background: "linear-gradient(135deg, #10b981, #0d9488)" }
                    }
                  >
                    {!mascota.fotoUrl && emojiPorTipo(mascota.tipo)}
                  </div>
                  <CardContent className="p-4">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{mascota.nombre}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {mascota.raza || mascota.tipo}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
