"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useSlug } from "@/context/slug-context"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MascotaFotoUploader } from "@/components/turnos/MascotaFotoUploader"
import { getClienteByDNI } from "@/lib/supabase/clientes"
import { getMascotaPublico } from "@/lib/supabase/mascotas"
import { getHistoriasPublico } from "@/lib/supabase/historias"
import { getTurnosPublico } from "@/lib/supabase/turnos"
import { MASCOTAS_DEFAULT } from "@/lib/turno-defaults"
import type { Mascota, Historia, Turno } from "@/lib/supabase/types"
import { ArrowLeft, Loader2, Calendar, Clock, Stethoscope, Search } from "lucide-react"

function emojiPorTipo(tipo: string): string {
  return MASCOTAS_DEFAULT.find((m) => m.id === tipo)?.emoji ?? "🐾"
}

const ESTADO_BADGE: Record<Turno["estado"], string> = {
  pendiente: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-0",
  confirmado: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-0",
  completado: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-0",
  cancelado: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border-0",
}

function formatFecha(fecha: string): string {
  if (!fecha) return "—"
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-AR", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

export default function PerfilMascotaPage() {
  const slug = useSlug()
  const router = useRouter()
  const params = useParams<{ mascotaId: string }>()
  const searchParams = useSearchParams()
  const mascotaId = params.mascotaId

  const [verificado, setVerificado] = useState(false)
  const [verificando, setVerificando] = useState(false)
  const [errorDni, setErrorDni] = useState<string | null>(null)
  const [dni, setDni] = useState(searchParams.get("dni") ?? "")

  const [loading, setLoading] = useState(false)
  const [mascota, setMascota] = useState<Mascota | null>(null)
  const [historias, setHistorias] = useState<Historia[]>([])
  const [turnos, setTurnos] = useState<Turno[]>([])

  /**
   * El mascotaId de la URL es un uuid, no un secreto: cualquiera con el link
   * podría verla si no volviéramos a pedir el DNI acá. Esta verificación
   * confirma que el DNI ingresado es efectivamente el dueño de la mascota
   * (mismo criterio que app/api/mascota-foto) antes de cargar y mostrar la
   * historia clínica y los turnos.
   */
  const verificar = async (dniValue: string) => {
    if (!dniValue.trim()) return
    setVerificando(true)
    setErrorDni(null)
    try {
      const cliente = await getClienteByDNI(slug, dniValue.trim())
      if (!cliente?.id) {
        setErrorDni("No encontramos un cliente con ese DNI.")
        return
      }

      const encontrada = await getMascotaPublico(slug, mascotaId)
      if (!encontrada || encontrada.clienteId !== cliente.id) {
        setErrorDni("Ese DNI no corresponde a esta mascota.")
        return
      }

      setMascota(encontrada)
      setVerificado(true)
      setLoading(true)

      const [misHistorias, misTurnos] = await Promise.all([
        getHistoriasPublico(slug, mascotaId),
        getTurnosPublico(slug, cliente.id),
      ])
      setHistorias(misHistorias.filter((h) => h.tipoVisita !== "turno_programado"))
      setTurnos(misTurnos.filter((t) => t.mascotaId === mascotaId))
      setLoading(false)
    } finally {
      setVerificando(false)
    }
  }

  useEffect(() => {
    const dniInicial = searchParams.get("dni")
    if (dniInicial) verificar(dniInicial)
    // Solo al montar: si viene el DNI en la URL (desde /mi-historia), lo verificamos una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!verificado) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-sm w-full">
          <CardContent className="py-8 space-y-4">
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Confirmá tu DNI</p>
              <p className="text-xs text-muted-foreground">
                Para ver la historia clínica necesitamos verificar que la mascota es tuya.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="perfil-dni">DNI</Label>
              <Input
                id="perfil-dni"
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verificar(dni)}
                placeholder="30123456"
              />
              {errorDni && <p className="text-sm text-destructive">{errorDni}</p>}
            </div>
            <Button
              onClick={() => verificar(dni)}
              disabled={verificando || !dni.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {verificando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Ver perfil
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => router.push(`/${slug}/mi-historia`)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a buscar
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (loading || !mascota) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-muted/30 via-muted/50 to-muted/30 pb-16">
      {/* Banner */}
      <div
        className="relative h-56 sm:h-72 bg-cover bg-center flex items-end"
        style={
          mascota.fotoUrl
            ? { backgroundImage: `url(${mascota.fotoUrl})` }
            : { background: "linear-gradient(135deg, #10b981, #0d9488)" }
        }
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        <button
          type="button"
          onClick={() => router.push(`/${slug}/mi-historia`)}
          className="absolute top-4 left-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="absolute top-4 right-4 z-10">
          <MascotaFotoUploader
            tenantId={slug}
            mascotaId={mascotaId}
            onFotoSubida={(url) => setMascota((prev) => (prev ? { ...prev, fotoUrl: url } : prev))}
          />
        </div>

        {!mascota.fotoUrl && (
          <span className="absolute inset-0 flex items-center justify-center text-7xl opacity-90">
            {emojiPorTipo(mascota.tipo)}
          </span>
        )}

        <div className="relative z-10 p-6 sm:p-8">
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">{mascota.nombre}</h1>
          <p className="text-sm sm:text-base text-white/80 mt-1">
            {[mascota.tipo, mascota.raza, mascota.edad].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="container max-w-3xl px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        {/* Historia clínica */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-emerald-600" />
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Historia clínica</h2>
          </div>
          {historias.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Todavía no hay historia clínica cargada.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {historias.map((h) => (
                <Card key={h.id}>
                  <CardContent className="p-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {h.motivo || "Consulta"}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {formatFecha(h.fechaAtencion)}
                      </span>
                    </div>
                    {h.diagnostico && (
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        <strong>Diagnóstico:</strong> {h.diagnostico}
                      </p>
                    )}
                    {h.tratamiento && (
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        <strong>Tratamiento:</strong> {h.tratamiento}
                      </p>
                    )}
                    {h.observaciones && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{h.observaciones}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Turnos */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-emerald-600" />
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Turnos</h2>
          </div>
          {turnos.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Todavía no sacó turnos.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {turnos.map((t) => (
                <Card key={t.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {t.servicio || "Consulta"}
                      </span>
                      <Badge className={ESTADO_BADGE[t.estado]}>{t.estado}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{formatFecha(t.fecha ?? "")}</span>
                      <Clock className="h-3.5 w-3.5 ml-2" />
                      <span>{t.hora ?? "—"}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
