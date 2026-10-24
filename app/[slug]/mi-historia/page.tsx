"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSlug } from "@/context/slug-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RegistroClienteDialog } from "@/components/turnos/RegistroClienteDialog"
import { getClienteByDNI } from "@/lib/supabase/clientes"
import { getMascotas } from "@/lib/supabase/mascotas"
import { getSorteoActivo } from "@/lib/supabase/sorteos"
import { getComprasClientePublico, type CompraClientePublico } from "@/lib/supabase/ventas"
import { SorteoTeaser } from "@/components/public/sorteo-banner"
import { MASCOTAS_DEFAULT } from "@/lib/turno-defaults"
import { slugificarMascota } from "@/lib/mascotas/slug"
import { formatCurrency } from "@/lib/format"
import type { Cliente, Mascota, Sorteo } from "@/lib/supabase/types"
import { ListaMisPedidos } from "@/components/public/mis-pedidos-flotante"
import { haySesionGuardada, useMisPedidos } from "@/hooks/use-mis-pedidos"
import { signInWithGoogle } from "@/lib/supabase/auth"
import { Search, Loader2, PawPrint, CalendarPlus, ShoppingBag, Package } from "lucide-react"

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
  const [compras, setCompras] = useState<CompraClientePublico[]>([])
  const [sorteoActivo, setSorteoActivo] = useState<Sorteo | null>(null)
  // Pedidos de la tienda web (en curso, en reparto, entregados): son de la
  // cuenta de Google, no del DNI, así que se ven con la sesión iniciada.
  const { pedidos: misPedidos, cargando: cargandoPedidos } = useMisPedidos(slug)
  const [conSesion, setConSesion] = useState(true)
  useEffect(() => setConSesion(haySesionGuardada()), [])

  useEffect(() => {
    getSorteoActivo(slug).then(setSorteoActivo)
  }, [slug])

  const buscar = async () => {
    if (!dni.trim()) return
    setLoading(true)
    setBuscado(false)
    try {
      const encontrado = await getClienteByDNI(slug, dni.trim())
      setCliente(encontrado)
      if (encontrado?.id) {
        const [misMascotas, misCompras] = await Promise.all([
          getMascotas(slug, encontrado.id),
          getComprasClientePublico(slug, encontrado.id),
        ])
        setMascotas(misMascotas)
        setCompras(misCompras)
      } else {
        setMascotas([])
        setCompras([])
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

        {misPedidos.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-emerald-600" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Mis pedidos</p>
            </div>
            <Card className="overflow-hidden">
              <ListaMisPedidos pedidos={misPedidos} />
            </Card>
          </div>
        )}

        {buscado && cliente && !conSesion && !cargandoPedidos && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-5 text-center sm:flex-row sm:text-left">
              <Package className="h-8 w-8 shrink-0 text-emerald-600" />
              <p className="flex-1 text-sm text-slate-600 dark:text-slate-400">
                ¿Compraste en la tienda online? Ingresá con Google para seguir tus pedidos.
              </p>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => signInWithGoogle(`/${slug}/mi-historia`)}
              >
                Ingresar con Google
              </Button>
            </CardContent>
          </Card>
        )}

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
                  onClick={() => router.push(`/${slug}/mi-historia/${encodeURIComponent(dni.trim())}/${encodeURIComponent(slugificarMascota(mascota.nombre))}`)}
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

        {buscado && cliente && compras.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-emerald-600" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Historial de compras
              </p>
            </div>
            <div className="space-y-2">
              {compras.map((c) => (
                <Card key={c.id} className={c.anulada ? "opacity-60" : undefined}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Compra #{c.numero}{c.anulada && " (anulada)"}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(c.createdAt).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {c.items.map((i) => `${i.cantidad}${i.unidad === "kg" ? "kg" : "x"} ${i.nombre}`).join(", ")}
                    </p>
                    <p className="mt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(c.total)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {sorteoActivo && <SorteoTeaser tenantId={slug} sorteo={sorteoActivo} />}
    </main>
  )
}
