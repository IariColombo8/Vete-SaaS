"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSlug } from "@/context/slug-context"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MascotaFotoUploader } from "@/components/turnos/MascotaFotoUploader"
import { getClienteByDNI } from "@/lib/supabase/clientes"
import {
  getMascotas,
  getMascotaPublico,
  getDuenosMascotaPublico,
  agregarDuenoMascotaPublico,
  updateMascota,
  type DuenoMascota,
} from "@/lib/supabase/mascotas"
import { getHistoriasPublico } from "@/lib/supabase/historias"
import { getTurnosPorMascotaPublico } from "@/lib/supabase/turnos"
import { getSorteoActivo } from "@/lib/supabase/sorteos"
import { getTenantConfig } from "@/lib/supabase/tenants"
import { getFirmaVeterinarioPublico } from "@/lib/supabase/usuarios"
import { SorteoTeaser } from "@/components/public/sorteo-banner"
import { MASCOTAS_DEFAULT } from "@/lib/turno-defaults"
import { formatearEdad, type UnidadEdad } from "@/lib/mascotas/edad"
import { slugificarMascota } from "@/lib/mascotas/slug"
import { generarLibretaPDF, type VeterinariaLibreta } from "@/lib/pdf/libreta-pdf"
import { generarComprobanteVeterinario } from "@/lib/pdf/comprobante-veterinario"
import { format } from "date-fns"
import { useToast } from "@/hooks/use-toast"
import type { Cliente, Mascota, Historia, Turno, Sorteo, SexoMascota, AplicacionHistoria } from "@/lib/supabase/types"
import { ArrowLeft, Loader2, Calendar, Clock, Stethoscope, Paperclip, UserPlus, Pencil, FileDown, Syringe, Pill, BugOff } from "lucide-react"
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

const TIPO_APLICACION_LABEL: Record<AplicacionHistoria["tipo"], string> = {
  vacuna: "Vacuna",
  medicamento: "Medicamento",
  desparasitacion: "Desparasitación",
}

/** Ícono + paleta por tipo de entrada, para que la línea de tiempo se lea de un vistazo. */
const ESTILO_ENTRADA: Record<AplicacionHistoria["tipo"] | "consulta", { Icon: typeof Stethoscope; dot: string; chip: string }> = {
  vacuna: { Icon: Syringe, dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  medicamento: { Icon: Pill, dot: "bg-sky-500", chip: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400" },
  desparasitacion: { Icon: BugOff, dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
  consulta: { Icon: Stethoscope, dot: "bg-slate-400", chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
}

function estiloDeEntrada(h: Historia) {
  const primerTipo = h.aplicaciones?.[0]?.tipo
  return ESTILO_ENTRADA[primerTipo ?? "consulta"]
}

export default function PerfilMascotaPage() {
  const slug = useSlug()
  const router = useRouter()
  const params = useParams<{ dni: string; mascotaSlug: string }>()
  const dni = decodeURIComponent(params.dni)
  const mascotaSlug = decodeURIComponent(params.mascotaSlug)

  const [estado, setEstado] = useState<"cargando" | "error" | "listo">("cargando")
  const [mensajeError, setMensajeError] = useState("")

  const [mascota, setMascota] = useState<Mascota | null>(null)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [veterinaria, setVeterinaria] = useState<VeterinariaLibreta>({})
  const [rubroServicios, setRubroServicios] = useState("")
  const [descargandoLibreta, setDescargandoLibreta] = useState(false)
  const [descargandoOrdenId, setDescargandoOrdenId] = useState<string | null>(null)
  const [historias, setHistorias] = useState<Historia[]>([])
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [archivosVer, setArchivosVer] = useState<string[] | null>(null)
  const [mostrarTurnos, setMostrarTurnos] = useState(false)
  const [duenos, setDuenos] = useState<DuenoMascota[]>([])
  const [mostrarAgregarDueno, setMostrarAgregarDueno] = useState(false)
  const [dniNuevoDueno, setDniNuevoDueno] = useState("")
  const [nombreNuevoDueno, setNombreNuevoDueno] = useState("")
  const [agregandoDueno, setAgregandoDueno] = useState(false)
  const [sorteoActivo, setSorteoActivo] = useState<Sorteo | null>(null)
  const [mostrarEditar, setMostrarEditar] = useState(false)
  const [editData, setEditData] = useState({
    tipo: "", raza: "", edadValor: "", edadUnidad: "meses" as UnidadEdad,
    peso: "", tieneChip: false, chipNumero: "", sexo: "" as SexoMascota | "", color: "",
  })
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const { toast } = useToast()

  const mascotaId = mascota?.id ?? ""

  const abrirEditar = () => {
    if (!mascota) return
    setEditData({
      tipo: mascota.tipo || "",
      raza: mascota.raza || "",
      edadValor: mascota.edadValor !== undefined ? String(mascota.edadValor) : "",
      edadUnidad: mascota.edadUnidad || "meses",
      peso: (mascota.peso || "").replace(/[^\d.,]/g, ""),
      tieneChip: mascota.tieneChip || false,
      chipNumero: mascota.chipNumero || "",
      sexo: mascota.sexo || "",
      color: mascota.color || "",
    })
    setMostrarEditar(true)
  }

  const guardarEdicion = async () => {
    if (!mascota) return
    if (!editData.sexo) {
      toast({ title: "Falta el sexo", description: "Es un dato obligatorio para la libreta sanitaria.", variant: "destructive" })
      return
    }
    setGuardandoEdicion(true)
    try {
      const edadValor = editData.edadValor ? Number(editData.edadValor) : undefined
      const datosEdad = edadValor !== undefined && !Number.isNaN(edadValor)
        ? {
            edad: formatearEdad({ valor: edadValor, unidad: editData.edadUnidad }),
            edadValor,
            edadUnidad: editData.edadUnidad,
            edadRegistradaEn: format(new Date(), "yyyy-MM-dd"),
          }
        : {}

      await updateMascota(slug, mascota.clienteId ?? "", mascotaId, {
        tipo: editData.tipo,
        raza: editData.raza,
        peso: editData.peso.trim() ? `${editData.peso.trim()} kg` : "",
        tieneChip: editData.tieneChip,
        chipNumero: editData.tieneChip ? editData.chipNumero.trim() : "",
        sexo: editData.sexo,
        color: editData.color.trim(),
        ...datosEdad,
      })

      const actualizada = await getMascotaPublico(slug, mascotaId)
      if (actualizada) setMascota(actualizada)
      setMostrarEditar(false)
      toast({ title: "Datos actualizados", description: "Guardamos los cambios de la mascota." })
    } catch (error: unknown) {
      toast({
        title: "No se pudo guardar",
        description: error instanceof Error ? error.message : "Intenta nuevamente.",
        variant: "destructive",
      })
    } finally {
      setGuardandoEdicion(false)
    }
  }

  useEffect(() => {
    getSorteoActivo(slug).then(setSorteoActivo)
    getTenantConfig(slug).then((config) => {
      if (!config) return
      setVeterinaria({
        nombre: config.nombre,
        logoUrl: config.logo,
        telefono: config.telefono,
        direccion: config.direccion,
        modalidad: config.modalidad,
      })
      setRubroServicios(config.servicios?.length ? config.servicios.map((s) => s.nombre).join(" - ") : (config.descripcion ?? ""))
    })
  }, [slug])

  /**
   * El DNI y el nombre de la mascota van directo en la URL (en vez de un uuid
   * "no adivinable" + `?dni=`): la seguridad la sigue dando el DNI —
   * `getMascotas` (RPC `obtener_mascotas_publico`) solo devuelve mascotas de
   * ESE cliente o donde es co-dueño, así que encontrar la mascota en esa
   * lista ya es la verificación de que el DNI corresponde a esta ficha.
   */
  useEffect(() => {
    let activo = true
    async function cargar() {
      setEstado("cargando")
      try {
        const cliente = await getClienteByDNI(slug, dni)
        if (!cliente?.id) {
          if (activo) { setMensajeError("No encontramos un cliente con ese DNI."); setEstado("error") }
          return
        }

        const mascotas = await getMascotas(slug, cliente.id)
        const encontrada = mascotas.find((m) => slugificarMascota(m.nombre) === mascotaSlug.toLowerCase())
        if (!encontrada?.id) {
          if (activo) { setMensajeError("No encontramos esa mascota para ese DNI."); setEstado("error") }
          return
        }

        const [misHistorias, misTurnos, misDuenos] = await Promise.all([
          getHistoriasPublico(slug, encontrada.id),
          getTurnosPorMascotaPublico(slug, encontrada.id),
          getDuenosMascotaPublico(slug, encontrada.id),
        ])
        if (!activo) return
        setMascota(encontrada)
        setCliente(cliente)
        setHistorias(misHistorias.filter((h) => h.tipoVisita !== "turno_programado"))
        setTurnos(misTurnos)
        setDuenos(misDuenos)
        setEstado("listo")
      } catch {
        if (activo) { setMensajeError("Ocurrió un error. Intentá de nuevo."); setEstado("error") }
      }
    }
    cargar()
    return () => { activo = false }
  }, [slug, dni, mascotaSlug])

  const descargarLibreta = async () => {
    if (!mascota || !cliente) return
    setDescargandoLibreta(true)
    try {
      await generarLibretaPDF({
        tenantId: slug,
        veterinaria,
        cliente,
        mascota,
        historias,
        turnos,
      })
    } catch (e) {
      console.error("Error generando la libreta:", e)
      toast({ title: "Error", description: "No se pudo generar la libreta sanitaria", variant: "destructive" })
    } finally {
      setDescargandoLibreta(false)
    }
  }

  /** Vuelve a generar la orden médica de una nota de vacuna/medicamento/desparasitación, o de una orden de nota libre, ya cargada. */
  const descargarOrden = async (h: Historia) => {
    if (!mascota || !cliente || !h.id) return
    const esOrdenLibre = h.tipoVisita === "orden_medica"
    const aplicaciones: AplicacionHistoria[] = h.aplicaciones?.length
      ? h.aplicaciones
      : h.tipoVisita && ["vacuna", "medicamento", "desparasitacion"].includes(h.tipoVisita) && h.productoAplicado
        ? [{ tipo: h.tipoVisita as AplicacionHistoria["tipo"], nombre: h.productoAplicado, indicaciones: h.observaciones, proxima: h.proximaVisita }]
        : []
    if (aplicaciones.length === 0 && !esOrdenLibre) return
    setDescargandoOrdenId(h.id)
    try {
      const firma = h.creadoPor ? await getFirmaVeterinarioPublico(h.creadoPor) : null
      await generarComprobanteVeterinario({
        emisor: {
          nombre: veterinaria.nombre,
          logoUrl: veterinaria.logoUrl,
          direccion: veterinaria.direccion,
          telefono: veterinaria.telefono,
          rubro: rubroServicios,
        },
        profesional: {
          nombre: firma?.nombre ?? undefined,
          especialidad: firma?.especialidad,
          matricula: firma?.matricula ?? undefined,
          firmaUrl: firma?.firmaUrl ?? undefined,
          selloUrl: firma?.selloUrl ?? undefined,
        },
        clienteNombre: cliente.nombre,
        mascotaNombre: mascota.nombre,
        fecha: h.fechaAtencion,
        ...(esOrdenLibre
          ? { notaLibre: h.observaciones ?? "" }
          : {
              items: aplicaciones.map((a) => ({
                tipoLabel: TIPO_APLICACION_LABEL[a.tipo],
                nombre: a.nombre,
                indicaciones: a.indicaciones,
              })),
            }),
      })
    } catch (e) {
      console.error("Error generando la orden:", e)
      toast({ title: "Error", description: "No se pudo generar la orden médica", variant: "destructive" })
    } finally {
      setDescargandoOrdenId(null)
    }
  }

  const agregarDueno = async () => {
    if (!dniNuevoDueno.trim()) return
    setAgregandoDueno(true)
    try {
      await agregarDuenoMascotaPublico(slug, mascotaId, dni, dniNuevoDueno.trim(), nombreNuevoDueno.trim())
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

  if (estado === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-sm w-full">
          <CardContent className="py-8 space-y-4 text-center">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">No pudimos abrir esta ficha</p>
            <p className="text-xs text-muted-foreground">{mensajeError}</p>
            <Button variant="outline" className="w-full" onClick={() => router.push(`/${slug}/mi-historia`)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a buscar
            </Button>
          </CardContent>
        </Card>
        {sorteoActivo && <SorteoTeaser tenantId={slug} sorteo={sorteoActivo} />}
      </main>
    )
  }

  if (estado === "cargando" || !mascota) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-muted/30 via-muted/50 to-muted/30 pb-16">
      {/* Encabezado con foto cuadrada, como en la libreta */}
      <div className="relative pt-8 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => router.push(`/${slug}/mi-historia`)}
          className="absolute top-4 left-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 backdrop-blur-md transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="container max-w-3xl mx-auto flex items-center gap-4 sm:gap-6 pt-10">
          <div className="relative h-24 w-24 sm:h-32 sm:w-32 shrink-0 rounded-2xl overflow-hidden shadow-md bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            {mascota.fotoUrl ? (
              <img src={mascota.fotoUrl} alt={mascota.nombre} className="h-full w-full object-cover" />
            ) : (
              <span className="text-5xl">{emojiPorTipo(mascota.tipo)}</span>
            )}
            <div className="absolute bottom-0 right-0">
              <MascotaFotoUploader
                tenantId={slug}
                mascotaId={mascotaId}
                onFotoSubida={(url) => setMascota((prev) => (prev ? { ...prev, fotoUrl: url } : prev))}
              />
            </div>
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight truncate">{mascota.nombre}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {[mascota.tipo, mascota.raza, mascota.edad].filter(Boolean).join(" · ")}
              {mascota.peso && ` · ${mascota.peso}`}
              {mascota.tieneChip && " · Chip"}
            </p>
          </div>
        </div>
      </div>

      <div className="container max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={abrirEditar}>
            <Pencil className="mr-2 h-4 w-4" />
            Completar datos
          </Button>
          <Button variant="outline" onClick={descargarLibreta} disabled={descargandoLibreta}>
            {descargandoLibreta ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
            Libreta sanitaria
          </Button>
        </div>

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
            <div className="relative space-y-5 pl-8 sm:pl-9">
              {/* Riel de la línea de tiempo */}
              <div className="absolute left-[15px] sm:left-[17px] top-2 bottom-2 w-px bg-gradient-to-b from-slate-200 via-slate-200 to-transparent dark:from-slate-700 dark:via-slate-700" />
              {historias.map((h) => {
                const esOrdenDescargable = !!(
                  h.aplicaciones?.length ||
                  (h.tipoVisita && ["vacuna", "medicamento", "desparasitacion"].includes(h.tipoVisita) && h.productoAplicado) ||
                  h.tipoVisita === "orden_medica"
                )
                const { Icon, dot, chip } = estiloDeEntrada(h)
                return (
                  <div key={h.id} className="relative">
                    <span className={`absolute -left-8 sm:-left-9 top-1 flex h-7 w-7 items-center justify-center rounded-full ${dot} text-white shadow-sm ring-4 ring-white dark:ring-slate-950`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-4 sm:p-5 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-[15px] font-bold text-slate-900 dark:text-slate-100 leading-tight">
                            {h.motivo || "Consulta"}
                          </span>
                          <span className="shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {formatFecha(h.fechaAtencion)}
                          </span>
                        </div>

                        {h.aplicaciones?.length ? (
                          <div className="flex flex-col gap-1.5">
                            {h.aplicaciones.map((a, i) => (
                              <div key={i} className="flex items-start gap-2 text-sm">
                                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ESTILO_ENTRADA[a.tipo].chip}`}>
                                  {TIPO_APLICACION_LABEL[a.tipo]}
                                </span>
                                <span className="text-slate-700 dark:text-slate-300">
                                  {a.nombre}
                                  {a.indicaciones ? <span className="text-slate-500 dark:text-slate-400"> — {a.indicaciones}</span> : ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : h.tipoVisita !== "orden_medica" ? (
                          <div className="space-y-1">
                            {h.diagnostico && (
                              <p className="text-sm text-slate-600 dark:text-slate-300">
                                <span className="font-semibold text-slate-800 dark:text-slate-200">Diagnóstico</span> · {h.diagnostico}
                              </p>
                            )}
                            {h.tratamiento && (
                              <p className="text-sm text-slate-600 dark:text-slate-300">
                                <span className="font-semibold text-slate-800 dark:text-slate-200">Tratamiento</span> · {h.tratamiento}
                              </p>
                            )}
                          </div>
                        ) : null}

                        {h.observaciones && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 italic border-l-2 border-slate-200 dark:border-slate-700 pl-2">{h.observaciones}</p>
                        )}

                        {(h.archivos?.length || esOrdenDescargable) && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {h.archivos && h.archivos.length > 0 && (
                              <Button variant="outline" size="sm" onClick={() => setArchivosVer(h.archivos!)}>
                                <Paperclip className="mr-2 h-3.5 w-3.5" />
                                Ver imágenes o archivos ({h.archivos.length})
                              </Button>
                            )}
                            {esOrdenDescargable && (
                              <Button variant="outline" size="sm" disabled={descargandoOrdenId === h.id} onClick={() => descargarOrden(h)}>
                                {descargandoOrdenId === h.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <FileDown className="mr-2 h-3.5 w-3.5" />}
                                Descargar orden
                              </Button>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )
              })}
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

      <Dialog open={mostrarEditar} onOpenChange={setMostrarEditar}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Datos de {mascota.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Esto edita los datos generales de la mascota. La historia clínica cargada por el veterinario no se toca.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="editar-tipo">Tipo</Label>
              <Select value={editData.tipo} onValueChange={(v) => setEditData((d) => ({ ...d, tipo: v }))}>
                <SelectTrigger id="editar-tipo">
                  <SelectValue placeholder="Selecciona..." />
                </SelectTrigger>
                <SelectContent>
                  {MASCOTAS_DEFAULT.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.emoji} {t.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editar-raza">Raza</Label>
              <Input
                id="editar-raza"
                value={editData.raza}
                onChange={(e) => setEditData((d) => ({ ...d, raza: e.target.value }))}
                placeholder="Golden Retriever"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="editar-sexo">Sexo *</Label>
                <Select value={editData.sexo} onValueChange={(v) => setEditData((d) => ({ ...d, sexo: v as SexoMascota }))}>
                  <SelectTrigger id="editar-sexo">
                    <SelectValue placeholder="Selecciona..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="macho">Macho</SelectItem>
                    <SelectItem value="hembra">Hembra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editar-color">Color</Label>
                <Input
                  id="editar-color"
                  value={editData.color}
                  onChange={(e) => setEditData((d) => ({ ...d, color: e.target.value }))}
                  placeholder="Negro y blanco"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="editar-edad">Edad</Label>
                <div className="flex gap-2">
                  <Input
                    id="editar-edad"
                    type="number"
                    min="0"
                    value={editData.edadValor}
                    onChange={(e) => setEditData((d) => ({ ...d, edadValor: e.target.value }))}
                    placeholder="8"
                  />
                  <Select
                    value={editData.edadUnidad}
                    onValueChange={(v) => setEditData((d) => ({ ...d, edadUnidad: v as UnidadEdad }))}
                  >
                    <SelectTrigger className="w-28 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="meses">meses</SelectItem>
                      <SelectItem value="anios">años</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editar-peso">Peso (kg)</Label>
                <Input
                  id="editar-peso"
                  type="number"
                  min="0"
                  step="0.1"
                  value={editData.peso}
                  onChange={(e) => setEditData((d) => ({ ...d, peso: e.target.value }))}
                  placeholder="15"
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="editar-tiene-chip"
                  checked={editData.tieneChip}
                  onCheckedChange={(checked) => setEditData((d) => ({ ...d, tieneChip: checked === true }))}
                />
                <Label htmlFor="editar-tiene-chip" className="text-sm font-normal cursor-pointer">
                  Tiene Chip
                </Label>
              </div>
              {editData.tieneChip && (
                <Input
                  value={editData.chipNumero}
                  onChange={(e) => setEditData((d) => ({ ...d, chipNumero: e.target.value }))}
                  placeholder="Número de chip"
                />
              )}
            </div>
            <Button
              onClick={guardarEdicion}
              disabled={guardandoEdicion}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {guardandoEdicion && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {sorteoActivo && <SorteoTeaser tenantId={slug} sorteo={sorteoActivo} />}
    </main>
  )
}
