"use client"

import { useState, useEffect, useRef } from "react"
import { useSlug } from "@/context/slug-context"
import { getTenantConfig, updateTenantConfig, getTurnoConfig, updateTurnoConfig } from "@/lib/firebase/firestore"
import type { ServicioTenant, HorarioTenant, Modalidad, MascotaTurnoConfig, ServicioTurnoConfig, VacunaTurnoConfig, TurnoConfig, Profesional } from "@/lib/firebase/firestore"
import { MASCOTAS_DEFAULT, SERVICIOS_DEFAULT, VACUNAS_DEFAULT } from "@/lib/turno-defaults"
import { storage } from "@/lib/firebase/config"
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { Save, Loader2, Plus, Trash2, Upload, X, ImageIcon, Stethoscope, MapPin, Home, PawPrint, FileText, Syringe } from "lucide-react"
import { EquipoManagement } from "@/components/admin/equipo-management"

const HORARIOS_DEFAULT: HorarioTenant[] = [
  { dia: "Lunes a Viernes", apertura: "09:00", cierre: "18:00", cerrado: false },
  { dia: "Sabado",          apertura: "09:00", cierre: "13:00", cerrado: false },
  { dia: "Domingo",         apertura: "",      cierre: "",      cerrado: true  },
]

const EMOJIS = ["🩺","💉","🏥","🛁","🚨","🧪","🐾","🐶","🐱","✂️","🦷","🔬","❤️","🌿","💊","🩻"]
const EMOJIS_MASCOTA = ["🐕","🐈","🐰","🦜","🐾","🐢","🐹","🐍","🐠","🦎","🐴","🐄"]
const EMOJIS_SERVICIO = ["🩺","💻","💉","🚨","🧪","🏥","🛁","✂️","🦷","🔬","❤️","🌿","💊","🩻"]

export default function ConfiguracionPage() {
  const slug = useSlug()
  const { toast } = useToast()
  const [loadingData, setLoadingData] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"datos" | "turnos" | "equipo">("datos")

  // ── Datos de la veterinaria ──
  const [basic, setBasic] = useState({ nombre: "", telefono: "", email: "", direccion: "", ciudad: "" })
  const [hero, setHero] = useState({ slogan: "", descripcion: "" })
  const [servicios, setServicios] = useState<ServicioTenant[]>([])
  const [horarios, setHorarios] = useState<HorarioTenant[]>(HORARIOS_DEFAULT)
  const [modalidad, setModalidad] = useState<Modalidad>("local")
  const [googleMapsUrl, setGoogleMapsUrl] = useState("")
  const [logo, setLogo] = useState<string>("")
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [fotosHero, setFotosHero] = useState<string[]>([])
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fotosHeroMobile, setFotosHeroMobile] = useState<string[]>([])
  const [uploadingFotoMobile, setUploadingFotoMobile] = useState(false)
  const fileInputMobileRef = useRef<HTMLInputElement>(null)
  const [minHoras, setMinHoras] = useState(2)
  const [calendarIdField, setCalendarIdField] = useState("")

  // ── Config de turnos ──
  const [mascotas, setMascotas] = useState<MascotaTurnoConfig[]>(MASCOTAS_DEFAULT)
  const [serviciosTurno, setServiciosTurno] = useState<ServicioTurnoConfig[]>(SERVICIOS_DEFAULT)
  const [vacunas, setVacunas] = useState<Record<string, VacunaTurnoConfig[]>>(VACUNAS_DEFAULT)
  const [profesionales, setProfesionales] = useState<Profesional[]>([])

  useEffect(() => {
    Promise.all([getTenantConfig(slug), getTurnoConfig(slug)]).then(([cfg, turnoCfg]) => {
      if (cfg) {
        setBasic({ nombre: cfg.nombre || "", telefono: cfg.telefono || "", email: cfg.email || "", direccion: cfg.direccion || "", ciudad: cfg.ciudad || "" })
        setHero({ slogan: cfg.slogan || "", descripcion: cfg.descripcion || "" })
        setServicios(cfg.servicios?.length ? cfg.servicios : [])
        setHorarios(cfg.horarios?.length ? cfg.horarios : HORARIOS_DEFAULT)
        setFotosHero(cfg.fotosHero ?? [])
        setFotosHeroMobile(cfg.fotosHeroMobile ?? [])
        setLogo(cfg.logo ?? "")
        setModalidad(cfg.modalidad ?? "local")
        setGoogleMapsUrl(cfg.googleMapsUrl ?? "")
        if (cfg.minHorasAnticipacion !== undefined) setMinHoras(cfg.minHorasAnticipacion)
        if (cfg.calendarId) setCalendarIdField(cfg.calendarId)
      }
      if (turnoCfg) {
        if (turnoCfg.mascotas?.length) setMascotas(turnoCfg.mascotas)
        if (turnoCfg.servicios?.length) setServiciosTurno(turnoCfg.servicios)
        if (turnoCfg.vacunas && Object.keys(turnoCfg.vacunas).length > 0) setVacunas(turnoCfg.vacunas)
        if (turnoCfg.profesionales?.length) setProfesionales(turnoCfg.profesionales)
      }
      setLoadingData(false)
    })
  }, [slug])

  // ── Save helpers ──
  async function saveDatos(section: string, data: Record<string, unknown>) {
    setSaving(section)
    try {
      await updateTenantConfig(slug, data)
      toast({ title: "Guardado", description: "Cambios guardados correctamente." })
    } catch (e) {
      console.error(e)
      toast({ title: "Error", description: "No se pudo guardar.", variant: "destructive" })
    } finally {
      setSaving(null)
    }
  }

  async function saveTurno(section: string, data: Partial<TurnoConfig>) {
    setSaving(section)
    try {
      await updateTurnoConfig(slug, data)
      toast({ title: "Guardado", description: "Cambios guardados correctamente." })
    } catch (e) {
      console.error(e)
      toast({ title: "Error", description: "No se pudo guardar.", variant: "destructive" })
    } finally {
      setSaving(null)
    }
  }

  // ── Upload handlers ──
  async function handleUploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    try {
      const ext = file.name.split(".").pop()
      const storageRef = ref(storage, `veterinarias/${slug}/logo/logo.${ext}`)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)
      setLogo(url)
      await updateTenantConfig(slug, { logo: url })
      toast({ title: "Logo actualizado" })
    } catch (err) {
      console.error(err)
      toast({ title: "Error al subir logo", variant: "destructive" })
    } finally {
      setUploadingLogo(false)
      if (logoInputRef.current) logoInputRef.current.value = ""
    }
  }

  async function handleDeleteLogo() {
    try {
      if (logo) {
        const storageRef = ref(storage, logo)
        await deleteObject(storageRef).catch(() => {})
      }
      setLogo("")
      await updateTenantConfig(slug, { logo: "" })
      toast({ title: "Logo eliminado" })
    } catch (err) {
      console.error(err)
    }
  }

  async function handleUploadFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    if (fotosHero.length + files.length > 5) {
      toast({ title: "Maximo 5 fotos", variant: "destructive" }); return
    }
    setUploadingFoto(true)
    try {
      const nuevasUrls: string[] = []
      for (const file of files) {
        const storageRef = ref(storage, `veterinarias/${slug}/hero/${Date.now()}-${file.name}`)
        await uploadBytes(storageRef, file)
        const url = await getDownloadURL(storageRef)
        nuevasUrls.push(url)
      }
      const updated = [...fotosHero, ...nuevasUrls]
      setFotosHero(updated)
      await updateTenantConfig(slug, { fotosHero: updated })
      toast({ title: "Fotos subidas correctamente" })
    } catch (err) {
      console.error(err)
      toast({ title: "Error al subir fotos", variant: "destructive" })
    } finally {
      setUploadingFoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleDeleteFoto(url: string) {
    try {
      const storageRef = ref(storage, url)
      await deleteObject(storageRef).catch(() => {})
      const updated = fotosHero.filter(f => f !== url)
      setFotosHero(updated)
      await updateTenantConfig(slug, { fotosHero: updated })
      toast({ title: "Foto eliminada" })
    } catch (err) {
      console.error(err)
      toast({ title: "Error al eliminar foto", variant: "destructive" })
    }
  }

  async function handleUploadFotoMobile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    if (fotosHeroMobile.length + files.length > 5) {
      toast({ title: "Maximo 5 fotos", variant: "destructive" }); return
    }
    setUploadingFotoMobile(true)
    try {
      const nuevasUrls: string[] = []
      for (const file of files) {
        const storageRef = ref(storage, `veterinarias/${slug}/hero-mobile/${Date.now()}-${file.name}`)
        await uploadBytes(storageRef, file)
        const url = await getDownloadURL(storageRef)
        nuevasUrls.push(url)
      }
      const updated = [...fotosHeroMobile, ...nuevasUrls]
      setFotosHeroMobile(updated)
      await updateTenantConfig(slug, { fotosHeroMobile: updated })
      toast({ title: "Fotos mobile subidas correctamente" })
    } catch (err) {
      console.error(err)
      toast({ title: "Error al subir fotos", variant: "destructive" })
    } finally {
      setUploadingFotoMobile(false)
      if (fileInputMobileRef.current) fileInputMobileRef.current.value = ""
    }
  }

  async function handleDeleteFotoMobile(url: string) {
    try {
      const storageRef = ref(storage, url)
      await deleteObject(storageRef).catch(() => {})
      const updated = fotosHeroMobile.filter(f => f !== url)
      setFotosHeroMobile(updated)
      await updateTenantConfig(slug, { fotosHeroMobile: updated })
      toast({ title: "Foto mobile eliminada" })
    } catch (err) {
      console.error(err)
      toast({ title: "Error al eliminar foto", variant: "destructive" })
    }
  }

  // ── Servicios (pagina publica) handlers ──
  function addServicio() {
    setServicios(prev => [...prev, { emoji: "🩺", nombre: "", descripcion: "" }])
  }
  function removeServicio(i: number) {
    setServicios(prev => prev.filter((_, idx) => idx !== i))
  }
  function updateServicio(i: number, field: keyof ServicioTenant, value: string) {
    setServicios(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }

  // ── Horarios handlers ──
  function updateHorario(i: number, field: keyof HorarioTenant, value: string | boolean) {
    setHorarios(prev => prev.map((h, idx) => idx === i ? { ...h, [field]: value } : h))
  }
  function addHorario() {
    setHorarios(prev => [...prev, { dia: "", apertura: "09:00", cierre: "18:00", cerrado: false }])
  }
  function removeHorario(i: number) {
    setHorarios(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Mascotas turno handlers ──
  function addMascota() {
    setMascotas(prev => [...prev, { id: "", emoji: "🐾", nombre: "" }])
  }
  function removeMascota(i: number) {
    const removed = mascotas[i]
    setMascotas(prev => prev.filter((_, idx) => idx !== i))
    if (removed.id) {
      setVacunas(prev => {
        const next = { ...prev }
        delete next[removed.id]
        return next
      })
    }
  }
  function updateMascotaField(i: number, field: keyof MascotaTurnoConfig, value: string) {
    setMascotas(prev => prev.map((m, idx) => {
      if (idx !== i) return m
      const updated = { ...m, [field]: value }
      if (field === "nombre") {
        updated.id = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || ""
      }
      return updated
    }))
  }

  // ── Servicios turno handlers ──
  function addServicioTurno() {
    setServiciosTurno(prev => [...prev, { id: "", emoji: "🩺", nombre: "", descripcion: "" }])
  }
  function removeServicioTurno(i: number) {
    setServiciosTurno(prev => prev.filter((_, idx) => idx !== i))
  }
  function updateServicioTurnoField(i: number, field: keyof ServicioTurnoConfig, value: string) {
    setServiciosTurno(prev => prev.map((s, idx) => {
      if (idx !== i) return s
      const updated = { ...s, [field]: value }
      if (field === "nombre") {
        updated.id = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || ""
      }
      return updated
    }))
  }

  function updateServicioTurnoDuracion(i: number, value: string) {
    const n = parseInt(value, 10)
    setServiciosTurno(prev => prev.map((s, idx) => idx === i ? { ...s, duracionMin: Number.isNaN(n) ? undefined : n } : s))
  }

  // ── Profesionales handlers ──
  function addProfesional() {
    setProfesionales(prev => [...prev, { id: `prof-${Date.now()}`, nombre: "", activo: true }])
  }
  function removeProfesional(i: number) {
    setProfesionales(prev => prev.filter((_, idx) => idx !== i))
  }
  function updateProfesional(i: number, field: keyof Profesional, value: string | boolean) {
    setProfesionales(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
  }

  // ── Vacunas handlers ──
  function addVacuna(mascotaId: string) {
    setVacunas(prev => ({
      ...prev,
      [mascotaId]: [...(prev[mascotaId] || []), { id: "", nombre: "", descripcion: "" }],
    }))
  }
  function removeVacuna(mascotaId: string, i: number) {
    setVacunas(prev => ({
      ...prev,
      [mascotaId]: (prev[mascotaId] || []).filter((_, idx) => idx !== i),
    }))
  }
  function updateVacunaField(mascotaId: string, i: number, field: keyof VacunaTurnoConfig, value: string) {
    setVacunas(prev => ({
      ...prev,
      [mascotaId]: (prev[mascotaId] || []).map((v, idx) => {
        if (idx !== i) return v
        const updated = { ...v, [field]: value }
        if (field === "nombre") {
          updated.id = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || ""
        }
        return updated
      }),
    }))
  }

  if (loadingData) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Configuracion</h1>
          <p className="text-sm text-muted-foreground">Gestiona los datos de tu veterinaria y la configuracion de turnos.</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "datos" | "turnos" | "equipo")}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="datos">Datos</TabsTrigger>
            <TabsTrigger value="turnos">Turnos</TabsTrigger>
            <TabsTrigger value="equipo">Equipo</TabsTrigger>
          </TabsList>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/*  TAB: DATOS DE LA VETERINARIA                                      */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="datos" className="space-y-6 mt-6">

            {/* ── DATOS BASICOS ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Datos de la clinica</CardTitle>
                <CardDescription>Informacion de contacto visible en tu pagina.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={e => { e.preventDefault(); saveDatos("basic", basic) }} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Nombre *</Label>
                    <Input value={basic.nombre} onChange={e => setBasic(p => ({ ...p, nombre: e.target.value }))} required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Telefono</Label>
                      <Input value={basic.telefono} onChange={e => setBasic(p => ({ ...p, telefono: e.target.value }))} placeholder="+54 11 1234-5678" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Email</Label>
                      <Input type="email" value={basic.email} onChange={e => setBasic(p => ({ ...p, email: e.target.value }))} placeholder="clinica@ejemplo.com" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Ciudad</Label>
                      <Input value={basic.ciudad} onChange={e => setBasic(p => ({ ...p, ciudad: e.target.value }))} placeholder="Buenos Aires" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Direccion</Label>
                      <Input value={basic.direccion} onChange={e => setBasic(p => ({ ...p, direccion: e.target.value }))} placeholder="Av. Corrientes 1234" />
                    </div>
                  </div>
                  <SaveButton loading={saving === "basic"} />
                </form>
              </CardContent>
            </Card>

            {/* ── MODALIDAD Y UBICACION ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Ubicacion y modalidad
                </CardTitle>
                <CardDescription>
                  Indica como atendes: en un local fijo, a domicilio o ambos. Si tenes local, agrega tu ubicacion de Google Maps.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={e => { e.preventDefault(); saveDatos("ubicacion", { modalidad, googleMapsUrl }) }} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Modalidad de atencion</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: "local" as Modalidad, icon: MapPin, label: "En local", desc: "Consultorio fijo" },
                        { value: "domicilio" as Modalidad, icon: Home, label: "A domicilio", desc: "Vamos a tu casa" },
                        { value: "ambos" as Modalidad, icon: MapPin, label: "Ambos", desc: "Local + domicilio" },
                      ]).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setModalidad(opt.value)}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${
                            modalidad === opt.value
                              ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : "border-muted hover:border-muted-foreground/30 text-muted-foreground"
                          }`}
                        >
                          <opt.icon className="h-5 w-5" />
                          <span className="text-sm font-semibold">{opt.label}</span>
                          <span className="text-[10px] leading-tight">{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {(modalidad === "local" || modalidad === "ambos") && (
                    <div className="space-y-2">
                      <Label>Link de Google Maps</Label>
                      <Input
                        value={googleMapsUrl}
                        onChange={e => setGoogleMapsUrl(e.target.value)}
                        placeholder="https://maps.google.com/..."
                      />
                      <p className="text-xs text-muted-foreground">
                        Abri Google Maps, busca tu local, hace clic en &quot;Compartir&quot; &rarr; &quot;Copiar enlace&quot; y pegalo aca.
                        Tambien podes pegar el link de &quot;Insertar mapa&quot; (iframe).
                      </p>
                      {googleMapsUrl && (
                        <div className="mt-3 rounded-lg overflow-hidden border h-48 bg-muted/30">
                          {googleMapsUrl.includes("<iframe") ? (
                            <div
                              className="w-full h-full [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0"
                              dangerouslySetInnerHTML={{ __html: googleMapsUrl }}
                            />
                          ) : googleMapsUrl.includes("google.com/maps") || googleMapsUrl.includes("goo.gl/maps") ? (
                            <iframe
                              src={`https://maps.google.com/maps?q=${encodeURIComponent(googleMapsUrl)}&output=embed`}
                              className="w-full h-full border-0"
                              loading="lazy"
                              allowFullScreen
                              referrerPolicy="no-referrer-when-downgrade"
                              title="Ubicacion en Google Maps"
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                              Vista previa no disponible. Verifica el link.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {modalidad === "domicilio" && (
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 p-3">
                      <p className="text-sm text-blue-700 dark:text-blue-400 flex items-center gap-2">
                        <Home className="h-4 w-4 shrink-0" />
                        En tu pagina publica se mostrara que atendes a domicilio en vez del mapa.
                      </p>
                    </div>
                  )}

                  <SaveButton loading={saving === "ubicacion"} />
                </form>
              </CardContent>
            </Card>

            {/* ── LOGO ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Logo de la clinica
                </CardTitle>
                <CardDescription>
                  Se muestra en la navegacion y en tu pagina publica. Si no subis ninguno se usa un icono por defecto.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 overflow-hidden bg-muted/30 shrink-0">
                    {logo
                      ? <img src={logo} alt="Logo" className="h-full w-full object-contain" />
                      : <Stethoscope className="h-8 w-8 text-muted-foreground/40" />
                    }
                  </div>
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingLogo}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {uploadingLogo
                        ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Subiendo...</>
                        : <><Upload className="mr-2 h-3.5 w-3.5" />{logo ? "Cambiar logo" : "Subir logo"}</>
                      }
                    </Button>
                    {logo && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive block"
                        onClick={handleDeleteLogo}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Eliminar logo
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">PNG, JPG o SVG. Recomendado: fondo transparente.</p>
                  </div>
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadLogo}
                />
              </CardContent>
            </Card>

            {/* ── HERO ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hero (portada)</CardTitle>
                <CardDescription>Lo primero que ven tus clientes al entrar a tu pagina.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={e => { e.preventDefault(); saveDatos("hero", { slogan: hero.slogan, descripcion: hero.descripcion }) }} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Slogan</Label>
                    <Input
                      value={hero.slogan}
                      onChange={e => setHero(p => ({ ...p, slogan: e.target.value }))}
                      placeholder="Cuidamos a tu mascota como si fuera nuestra"
                    />
                    <p className="text-xs text-muted-foreground">Frase corta debajo del nombre de tu clinica.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Descripcion</Label>
                    <Textarea
                      value={hero.descripcion}
                      onChange={e => setHero(p => ({ ...p, descripcion: e.target.value }))}
                      placeholder="Brindamos atencion veterinaria de calidad..."
                      rows={3}
                    />
                  </div>
                  <SaveButton loading={saving === "hero"} />
                </form>
              </CardContent>
            </Card>

            {/* ── FOTOS HERO ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Fotos del hero
                </CardTitle>
                <CardDescription>
                  Se muestran en la portada de tu pagina. Maximo 5 fotos. Si no subis ninguna se usan fotos por defecto.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {fotosHero.map((url, i) => (
                    <div key={i} className="relative group aspect-video rounded-lg overflow-hidden border">
                      <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleDeleteFoto(url)}
                        className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-5 w-5 text-white" />
                      </button>
                    </div>
                  ))}
                  {fotosHero.length < 5 && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingFoto}
                      className="aspect-video rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors text-muted-foreground hover:text-emerald-600 disabled:opacity-50"
                    >
                      {uploadingFoto
                        ? <Loader2 className="h-5 w-5 animate-spin" />
                        : <><Upload className="h-4 w-4" /><span className="text-[10px] font-medium">Subir</span></>
                      }
                    </button>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUploadFoto} />
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={uploadingFoto || fotosHero.length >= 5} onClick={() => fileInputRef.current?.click()}>
                    {uploadingFoto
                      ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Subiendo...</>
                      : <><Upload className="mr-2 h-3.5 w-3.5" />Agregar fotos</>
                    }
                  </Button>
                  <span className="text-xs text-muted-foreground">{fotosHero.length}/5 fotos</span>
                </div>
                {fotosHero.length === 0 && (
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                    Sin fotos configuradas — se mostraran 3 fotos genericas de veterinaria por defecto.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ── FOTOS HERO MOBILE ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Fotos del hero — Celular
                  <span className="text-xs font-normal text-muted-foreground ml-1">(opcional)</span>
                </CardTitle>
                <CardDescription>
                  Fotos optimizadas para celular (formato vertical). Si no subis ninguna, se usan las mismas que en PC o fotos por defecto.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {fotosHeroMobile.map((url, i) => (
                    <div key={i} className="relative group aspect-[3/4] rounded-lg overflow-hidden border">
                      <img src={url} alt={`Foto mobile ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleDeleteFotoMobile(url)}
                        className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-5 w-5 text-white" />
                      </button>
                    </div>
                  ))}
                  {fotosHeroMobile.length < 5 && (
                    <button
                      type="button"
                      onClick={() => fileInputMobileRef.current?.click()}
                      disabled={uploadingFotoMobile}
                      className="aspect-[3/4] rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors text-muted-foreground hover:text-emerald-600 disabled:opacity-50"
                    >
                      {uploadingFotoMobile
                        ? <Loader2 className="h-5 w-5 animate-spin" />
                        : <><Upload className="h-4 w-4" /><span className="text-[10px] font-medium">Subir</span></>
                      }
                    </button>
                  )}
                </div>
                <input ref={fileInputMobileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUploadFotoMobile} />
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={uploadingFotoMobile || fotosHeroMobile.length >= 5} onClick={() => fileInputMobileRef.current?.click()}>
                    {uploadingFotoMobile
                      ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Subiendo...</>
                      : <><Upload className="mr-2 h-3.5 w-3.5" />Agregar fotos celular</>
                    }
                  </Button>
                  <span className="text-xs text-muted-foreground">{fotosHeroMobile.length}/5 fotos</span>
                </div>
                {fotosHeroMobile.length === 0 && (
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                    Sin fotos para celular — se usaran las fotos de PC o fotos genericas por defecto.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ── SERVICIOS ── */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Servicios</CardTitle>
                    <CardDescription>Los servicios que ofrece tu clinica.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" type="button" onClick={addServicio}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Agregar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {servicios.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Sin servicios. Hace clic en &quot;Agregar&quot; para sumar el primero.
                    </p>
                  )}
                  {servicios.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                      <div className="space-y-1">
                        <Label className="text-xs">Icono</Label>
                        <select
                          value={s.emoji}
                          onChange={e => updateServicio(i, "emoji", e.target.value)}
                          className="w-14 h-9 rounded-md border bg-background text-lg text-center cursor-pointer"
                        >
                          {EMOJIS.map(em => <option key={em} value={em}>{em}</option>)}
                        </select>
                      </div>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Nombre *</Label>
                          <Input value={s.nombre} onChange={e => updateServicio(i, "nombre", e.target.value)} placeholder="Consulta general" className="h-9" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Descripcion</Label>
                          <Input value={s.descripcion ?? ""} onChange={e => updateServicio(i, "descripcion", e.target.value)} placeholder="Breve descripcion..." className="h-9" />
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" type="button" className="h-8 w-8 text-muted-foreground hover:text-destructive mt-5" onClick={() => removeServicio(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <Button className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700" disabled={saving === "servicios"} onClick={() => saveDatos("servicios", { servicios })} type="button">
                    {saving === "servicios"
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</>
                      : <><Save className="mr-2 h-4 w-4" />Guardar servicios</>
                    }
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ── HORARIOS ── */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Horarios de atencion</CardTitle>
                    <CardDescription>Se muestran en tu pagina publica. Si un dia no es de corrido, desactiva &quot;Corrido&quot; para definir dos bloques horarios.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" type="button" onClick={addHorario}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Agregar fila
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {horarios.map((h, i) => (
                    <div key={i} className="p-3 rounded-lg border bg-muted/30 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={h.dia}
                          onChange={e => updateHorario(i, "dia", e.target.value)}
                          placeholder="Lunes a Viernes"
                          className="h-8 text-sm flex-1"
                        />
                        <label className="flex items-center gap-1 cursor-pointer text-xs text-muted-foreground select-none whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={h.cerrado}
                            onChange={e => updateHorario(i, "cerrado", e.target.checked)}
                            className="rounded"
                          />
                          Cerrado
                        </label>
                        <Button variant="ghost" size="icon" type="button" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeHorario(i)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>

                      {!h.cerrado && (
                        <>
                          <div className="flex items-center gap-1 pl-1">
                            <label className="flex items-center gap-1 cursor-pointer text-xs text-muted-foreground select-none">
                              <input
                                type="checkbox"
                                checked={h.corrido !== false}
                                onChange={e => updateHorario(i, "corrido", e.target.checked)}
                                className="rounded"
                              />
                              Horario corrido
                            </label>
                          </div>

                          {h.corrido !== false ? (
                            <div className="flex items-center gap-2 pl-1">
                              <Input value={h.apertura} onChange={e => updateHorario(i, "apertura", e.target.value)} placeholder="09:00" className="h-8 w-20 text-sm font-mono" />
                              <span className="text-xs text-muted-foreground">a</span>
                              <Input value={h.cierre} onChange={e => updateHorario(i, "cierre", e.target.value)} placeholder="18:00" className="h-8 w-20 text-sm font-mono" />
                            </div>
                          ) : (
                            <div className="space-y-1.5 pl-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground w-16">Maniana</span>
                                <Input value={h.apertura} onChange={e => updateHorario(i, "apertura", e.target.value)} placeholder="08:00" className="h-8 w-20 text-sm font-mono" />
                                <span className="text-xs text-muted-foreground">a</span>
                                <Input value={h.cierre1 ?? ""} onChange={e => updateHorario(i, "cierre1", e.target.value)} placeholder="12:00" className="h-8 w-20 text-sm font-mono" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground w-16">Tarde</span>
                                <Input value={h.apertura2 ?? ""} onChange={e => updateHorario(i, "apertura2", e.target.value)} placeholder="16:00" className="h-8 w-20 text-sm font-mono" />
                                <span className="text-xs text-muted-foreground">a</span>
                                <Input value={h.cierre} onChange={e => updateHorario(i, "cierre", e.target.value)} placeholder="20:00" className="h-8 w-20 text-sm font-mono" />
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <Button className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700" disabled={saving === "horarios"} onClick={() => saveDatos("horarios", { horarios })} type="button">
                    {saving === "horarios"
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</>
                      : <><Save className="mr-2 h-4 w-4" />Guardar horarios</>
                    }
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ── ANTICIPACION MINIMA ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Anticipacion minima para turnos</CardTitle>
                <CardDescription>
                  Horas minimas de anticipacion para sacar turno el mismo dia.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={0}
                    max={12}
                    value={minHoras}
                    onChange={e => setMinHoras(Number(e.target.value))}
                    className="h-9 w-20 text-sm font-mono"
                  />
                  <span className="text-sm text-muted-foreground">horas antes del turno</span>
                </div>
                <div className="mt-4">
                  <Button
                    className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
                    disabled={saving === "anticipacion"}
                    onClick={() => saveDatos("anticipacion", { minHorasAnticipacion: minHoras })}
                    type="button"
                  >
                    {saving === "anticipacion"
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</>
                      : <><Save className="mr-2 h-4 w-4" />Guardar</>
                    }
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ── GOOGLE CALENDAR ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Google Calendar</CardTitle>
                <CardDescription>
                  ID del calendario donde se registran los turnos automáticamente.
                  Lo encontrás en Google Calendar → Configuración del calendario → ID del calendario.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Ej: clinica@gmail.com o xxxxxxxx@group.calendar.google.com"
                  value={calendarIdField}
                  onChange={e => setCalendarIdField(e.target.value)}
                  className="font-mono text-sm"
                />
                <Button
                  className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
                  disabled={saving === "calendar"}
                  onClick={() => saveDatos("calendar", { calendarId: calendarIdField.trim() || null })}
                  type="button"
                >
                  {saving === "calendar"
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</>
                    : <><Save className="mr-2 h-4 w-4" />Guardar</>
                  }
                </Button>
              </CardContent>
            </Card>

          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/*  TAB: CONFIGURACION DE TURNOS                                      */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="turnos" className="space-y-6 mt-6">

            {/* ── MASCOTAS QUE ATIENDEN ── */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <PawPrint className="h-4 w-4" />
                      Mascotas que atienden
                    </CardTitle>
                    <CardDescription>Tipos de animales que atiende tu veterinaria.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" type="button" onClick={addMascota}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Agregar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mascotas.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Sin mascotas configuradas. Hace clic en &quot;Agregar&quot; para sumar la primera.
                    </p>
                  )}
                  {mascotas.map((m, i) => (
                    <div key={i} className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
                      <select
                        value={m.emoji}
                        onChange={e => updateMascotaField(i, "emoji", e.target.value)}
                        className="w-14 h-9 rounded-md border bg-background text-lg text-center cursor-pointer"
                      >
                        {EMOJIS_MASCOTA.map(em => <option key={em} value={em}>{em}</option>)}
                      </select>
                      <div className="flex-1">
                        <Input value={m.nombre} onChange={e => updateMascotaField(i, "nombre", e.target.value)} placeholder="Ej: Perro" className="h-9" />
                      </div>
                      <span className="text-xs text-muted-foreground font-mono hidden sm:block">{m.id}</span>
                      <Button variant="ghost" size="icon" type="button" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeMascota(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <Button className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700" disabled={saving === "mascotas"} onClick={() => saveTurno("mascotas", { mascotas })} type="button">
                    {saving === "mascotas"
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</>
                      : <><Save className="mr-2 h-4 w-4" />Guardar mascotas</>
                    }
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ── SERVICIOS REQUERIDOS ── */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Servicios requeridos
                    </CardTitle>
                    <CardDescription>Servicios disponibles para que el cliente elija al sacar turno.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" type="button" onClick={addServicioTurno}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Agregar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {serviciosTurno.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Sin servicios configurados. Hace clic en &quot;Agregar&quot; para sumar el primero.
                    </p>
                  )}
                  {serviciosTurno.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                      <div className="space-y-1">
                        <Label className="text-xs">Icono</Label>
                        <select
                          value={s.emoji}
                          onChange={e => updateServicioTurnoField(i, "emoji", e.target.value)}
                          className="w-14 h-9 rounded-md border bg-background text-lg text-center cursor-pointer"
                        >
                          {EMOJIS_SERVICIO.map(em => <option key={em} value={em}>{em}</option>)}
                        </select>
                      </div>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Nombre *</Label>
                          <Input value={s.nombre} onChange={e => updateServicioTurnoField(i, "nombre", e.target.value)} placeholder="Consulta general" className="h-9" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Descripcion</Label>
                          <Input value={s.descripcion ?? ""} onChange={e => updateServicioTurnoField(i, "descripcion", e.target.value)} placeholder="Breve descripcion..." className="h-9" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Duracion (min)</Label>
                          <Input type="number" min={15} step={15} value={s.duracionMin ?? 60} onChange={e => updateServicioTurnoDuracion(i, e.target.value)} placeholder="60" className="h-9 font-mono" />
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" type="button" className="h-8 w-8 text-muted-foreground hover:text-destructive mt-5" onClick={() => removeServicioTurno(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <Button className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700" disabled={saving === "serviciosTurno"} onClick={() => saveTurno("serviciosTurno", { servicios: serviciosTurno })} type="button">
                    {saving === "serviciosTurno"
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</>
                      : <><Save className="mr-2 h-4 w-4" />Guardar servicios</>
                    }
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ── VACUNAS POR ANIMAL ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Syringe className="h-4 w-4" />
                  Vacunas por animal
                </CardTitle>
                <CardDescription>
                  Configura las vacunas disponibles para cada tipo de mascota. Solo se muestran cuando el servicio es &quot;Vacunacion&quot;.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {mascotas.filter(m => m.id).map(mascota => (
                  <div key={mascota.id} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <span className="text-lg">{mascota.emoji}</span>
                        {mascota.nombre}
                      </h4>
                      <Button variant="outline" size="sm" type="button" onClick={() => addVacuna(mascota.id)}>
                        <Plus className="h-3 w-3 mr-1" />
                        Vacuna
                      </Button>
                    </div>
                    {(!vacunas[mascota.id] || vacunas[mascota.id].length === 0) && (
                      <p className="text-xs text-muted-foreground pl-8">
                        Sin vacunas configuradas para {mascota.nombre.toLowerCase()}.
                      </p>
                    )}
                    {(vacunas[mascota.id] || []).map((v, i) => (
                      <div key={i} className="flex items-center gap-2 pl-8">
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Input value={v.nombre} onChange={e => updateVacunaField(mascota.id, i, "nombre", e.target.value)} placeholder="Nombre de vacuna" className="h-8 text-sm" />
                          <Input value={v.descripcion ?? ""} onChange={e => updateVacunaField(mascota.id, i, "descripcion", e.target.value)} placeholder="Descripcion (opcional)" className="h-8 text-sm" />
                        </div>
                        <Button variant="ghost" size="icon" type="button" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeVacuna(mascota.id, i)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    <div className="border-b border-border/50" />
                  </div>
                ))}
                <Button className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700" disabled={saving === "vacunas"} onClick={() => saveTurno("vacunas", { vacunas })} type="button">
                  {saving === "vacunas"
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</>
                    : <><Save className="mr-2 h-4 w-4" />Guardar vacunas</>
                  }
                </Button>
              </CardContent>
            </Card>

            {/* ── PROFESIONALES (agendas independientes) ── */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Stethoscope className="h-4 w-4" />
                      Profesionales
                    </CardTitle>
                    <CardDescription>
                      Si cargás profesionales, cada uno tiene su propia agenda y el cliente puede elegir con quién atenderse. Dejalo vacío para usar una agenda única.
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" type="button" onClick={addProfesional}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Agregar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {profesionales.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Sin profesionales. Agenda única para toda la veterinaria.
                    </p>
                  )}
                  {profesionales.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
                      <div className="flex-1">
                        <Input value={p.nombre} onChange={e => updateProfesional(i, "nombre", e.target.value)} placeholder="Ej: Dra. Priscila" className="h-9" />
                      </div>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground select-none whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={p.activo !== false}
                          onChange={e => updateProfesional(i, "activo", e.target.checked)}
                          className="rounded"
                        />
                        Activo
                      </label>
                      <Button variant="ghost" size="icon" type="button" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeProfesional(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <Button className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700" disabled={saving === "profesionales"} onClick={() => saveTurno("profesionales", { profesionales: profesionales.filter(p => p.nombre.trim()) })} type="button">
                    {saving === "profesionales"
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</>
                      : <><Save className="mr-2 h-4 w-4" />Guardar profesionales</>
                    }
                  </Button>
                </div>
              </CardContent>
            </Card>

          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/*  TAB: EQUIPO                                                        */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="equipo" className="space-y-6 mt-6">
            <EquipoManagement tenantId={slug} />
          </TabsContent>
        </Tabs>

      </div>
      <Toaster />
    </>
  )
}

function SaveButton({ loading }: { loading: boolean }) {
  return (
    <Button type="submit" disabled={loading} className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700">
      {loading
        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</>
        : <><Save className="mr-2 h-4 w-4" />Guardar cambios</>
      }
    </Button>
  )
}
