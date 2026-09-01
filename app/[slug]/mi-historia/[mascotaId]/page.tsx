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
import {
  getMascotaPublico,
  esDuenoMascotaPublico,
  getDuenosMascotaPublico,
  agregarDuenoMascotaPublico,
  type DuenoMascota,
} from "@/lib/supabase/mascotas"
import { getHistoriasPublico } from "@/lib/supabase/historias"
import { getTurnosPorMascotaPublico } from "@/lib/supabase/turnos"
import { getSorteoActivo } from "@/lib/supabase/sorteos"
import { SorteoTeaser } from "@/components/public/sorteo-banner"
import { MASCOTAS_DEFAULT } from "@/lib/turno-defaults"
import { useToast } from "@/hooks/use-toast"
import type { Mascota, Historia, Turno, Sorteo } from "@/lib/supabase/types"
import { ArrowLeft, Loader2, Calendar, Clock, Stethoscope, Search, Paperclip, UserPlus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function esImagen(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|heic)(\?.*)?$/i.test(url)
}

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
  const [archivosVer, setArchivosVer] = useState<string[] | null>(null)
  const [mostrarTurnos, setMostrarTurnos] = useState(false)
  const [duenos, setDuenos] = useState<DuenoMascota[]>([])
  const [dniPropio, setDniPropio] = useState("")
  const [mostrarAgregarDueno, setMostrarAgregarDueno] = useState(false)
  const [dniNuevoDueno, setDniNuevoDueno] = useState("")
  const [nombreNuevoDueno, setNombreNuevoDueno] = useState("")
  const [agregandoDueno, setAgregandoDueno] = useState(false)
  const [sorteoActivo, setSorteoActivo] = useState<Sorteo | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    getSorteoActivo(slug).then(setSorteoActivo)
  }, [slug])

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
      const esDueno =
        !!encontrada &&
        (encontrada.clienteId === cliente.id || (await esDuenoMascotaPublico(slug, mascotaId, cliente.id)))
      if (!encontrada || !esDueno) {
        setErrorDni("Ese DNI no corresponde a esta mascota.")
        return
      }

      setMascota(encontrada)
      setDniPropio(dniValue.trim())
      setVerificado(true)
      setLoading(true)

      const [misHistorias, misTurnos, misDuenos] = await Promise.all([
        getHistoriasPublico(slug, mascotaId),
        getTurnosPorMascotaPublico(slug, mascotaId),
        getDuenosMascotaPublico(slug, mascotaId),
      ])
      setHistorias(misHistorias.filter((h) => h.tipoVisita !== "turno_programado"))
      setTurnos(misTurnos)
      setDuenos(misDuenos)
      setLoading(false)
    } finally {
      setVerificando(false)
    }
  }

  const agregarDueno = async () => {
    if (!dniNuevoDueno.trim()) return
    setAgregandoDueno(true)
    try {
      await agregarDuenoMascotaPublico(slug, mascotaId, dniPropio, dniNuevoDueno.trim(), nombreNuevoDueno.trim())
      const misDuenos = await getDuenosMascotaPublico(slug, mascotaId)
      setDuenos(misDuenos)
      setMostrarAgregarDueno(false)
      setDniNuevoDueno("")
      setNombreNuevoDueno("")
      toast({ title: "Dueño agregado", description: "Ya puede entrar a esta ficha con su propio DNI." })
    } catch (error: unknown) {
      toast({
        title: "No se pudo agregar",
        description: error instanceof Error ? error.message : "Intenta nuevamente.",
        variant: "destructive",
      })
    } finally {
      setAgregandoDueno(false)
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
        {sorteoActivo && <SorteoTeaser tenantId={slug} sorteo={sorteoActivo} />}
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
        <Button
          className="w-full bg-emerald-600 hover:bg-emerald-700"
          onClick={() =>
            router.push(
              `/${slug}/turno?dni=${encodeURIComponent(dni)}&mascotaId=${encodeURIComponent(mascotaId)}`,
            )
          }
        >
          <Calendar className="mr-2 h-4 w-4" />
          Pedir turno para {mascota.nombre}
        </Button>

        <section className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-300">
          <span>
            Dueños:{" "}
            {duenos.length > 0
              ? duenos.map((d) => d.nombre || d.dni).join(", ")
              : "—"}
          </span>
          <Button variant="outline" size="sm" onClick={() => setMostrarAgregarDueno(true)}>
            <UserPlus className="mr-2 h-3.5 w-3.5" />
            Agregar otro dueño
          </Button>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-emerald-600" />
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">Historia clínica</h2>
            </div>
            <Button variant="outline" size="sm" onClick={() => setMostrarTurnos((v) => !v)}>
              {mostrarTurnos ? "Ver historia clínica" : `Ver turnos (${turnos.length})`}
            </Button>
          </div>
          {mostrarTurnos ? null : historias.length === 0 ? (
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
                    {h.archivos && h.archivos.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-1"
                        onClick={() => setArchivosVer(h.archivos!)}
                      >
                        <Paperclip className="mr-2 h-3.5 w-3.5" />
                        Ver imágenes o archivos ({h.archivos.length})
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {!mostrarTurnos ? null : turnos.length === 0 ? (
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

      <Dialog open={archivosVer !== null} onOpenChange={(open) => !open && setArchivosVer(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Imágenes y archivos</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
            {archivosVer?.map((url, i) =>
              esImagen(url) ? (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Archivo ${i + 1}`}
                    className="w-full h-32 object-cover rounded-md border"
                  />
                </a>
              ) : (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 h-32 rounded-md border p-3 text-xs text-slate-600 dark:text-slate-300 hover:bg-muted/50"
                >
                  <Paperclip className="h-4 w-4 shrink-0" />
                  <span className="truncate">Archivo {i + 1}</span>
                </a>
              ),
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={mostrarAgregarDueno} onOpenChange={setMostrarAgregarDueno}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Agregar otro dueño</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Esa persona va a poder entrar a esta misma ficha con su propio DNI.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="dni-nuevo-dueno">DNI</Label>
              <Input
                id="dni-nuevo-dueno"
                value={dniNuevoDueno}
                onChange={(e) => setDniNuevoDueno(e.target.value)}
                placeholder="30123456"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nombre-nuevo-dueno">Nombre (opcional)</Label>
              <Input
                id="nombre-nuevo-dueno"
                value={nombreNuevoDueno}
                onChange={(e) => setNombreNuevoDueno(e.target.value)}
                placeholder="Nombre y apellido"
              />
            </div>
            <Button
              onClick={agregarDueno}
              disabled={agregandoDueno || !dniNuevoDueno.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {agregandoDueno && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Agregar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {sorteoActivo && <SorteoTeaser tenantId={slug} sorteo={sorteoActivo} />}
    </main>
  )
}
