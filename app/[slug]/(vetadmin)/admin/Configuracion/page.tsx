"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useSlug } from "@/context/slug-context"
import { getTenantConfig, updateTenantConfig, getTurnoConfig, updateTurnoConfig } from "@/lib/supabase/queries"
import type { HorarioTenant, MascotaTurnoConfig, ServicioTurnoConfig, VacunaTurnoConfig, TurnoConfig, Profesional, TenantConfig } from "@/lib/supabase/queries"
import { MASCOTAS_DEFAULT, SERVICIOS_DEFAULT, VACUNAS_DEFAULT } from "@/lib/turno-defaults"
import { DIAS_SEMANA, diaToWeekdays, weekdaysToDiaString } from "@/lib/turnos/horarios"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Ayuda } from "@/components/ui/ayuda"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { Save, Loader2, Plus, Trash2, PawPrint, FileText, Syringe, Stethoscope, Store, ArrowRight, Settings } from "lucide-react"
import { EncabezadoPagina } from "@/components/admin/encabezado-pagina"
import { EquipoManagement } from "@/components/admin/equipo-management"
import { EmailProviderConfig } from "@/components/admin/email-provider-config"
import { MiFirmaManagement } from "@/components/admin/mi-firma-management"
import { PlanManagement } from "@/components/billing/plan-management"
import { MpPointConfig } from "@/components/admin/mp-point-config"
import { FacturacionConfig } from "@/components/admin/facturacion-config"
import { useReadOnly } from "@/lib/auth/read-only-context"

const HORARIOS_DEFAULT: HorarioTenant[] = [
  { dia: "Lunes,Martes,Miercoles,Jueves,Viernes", apertura: "09:00", cierre: "18:00", cerrado: false },
  { dia: "Sabado",                                apertura: "09:00", cierre: "13:00", cerrado: false },
  { dia: "Domingo",                               apertura: "",      cierre: "",      cerrado: true  },
]

const EMOJIS_MASCOTA = ["🐕","🐈","🐰","🦜","🐾","🐢","🐹","🐍","🐠","🦎","🐴","🐄"]
const EMOJIS_SERVICIO = ["🩺","💻","💉","🚨","🧪","🏥","🛁","✂️","🦷","🔬","❤️","🌿","💊","🩻"]

export default function ConfiguracionPage() {
  const slug = useSlug()
  const { toast } = useToast()
  const [loadingData, setLoadingData] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  type TabConfig = "datos" | "turnos" | "equipo" | "firma" | "plan" | "integraciones"
  const TABS: TabConfig[] = ["datos", "turnos", "equipo", "firma", "plan", "integraciones"]
  const [activeTab, setActiveTab] = useState<TabConfig>("datos")

  // `?tab=plan` llega desde el banner de trial vencido y los emails de billing.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab")
    if (tab && (TABS as string[]).includes(tab)) setActiveTab(tab as TabConfig)
    // TABS es constante: no hace falta en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Datos de la veterinaria ──
  const [basic, setBasic] = useState({ nombre: "", telefono: "", email: "", direccion: "", ciudad: "" })
  const [horarios, setHorarios] = useState<HorarioTenant[]>(HORARIOS_DEFAULT)
  const [minHoras, setMinHoras] = useState(2)
  const [calendarIdField, setCalendarIdField] = useState("")
  const [emailProvider, setEmailProvider] = useState<TenantConfig["emailProvider"]>("resend")

  // ── Config de turnos ──
  const [mascotas, setMascotas] = useState<MascotaTurnoConfig[]>(MASCOTAS_DEFAULT)
  const [serviciosTurno, setServiciosTurno] = useState<ServicioTurnoConfig[]>(SERVICIOS_DEFAULT)
  const [vacunas, setVacunas] = useState<Record<string, VacunaTurnoConfig[]>>(VACUNAS_DEFAULT)
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const readOnly = useReadOnly()

  useEffect(() => {
    Promise.all([getTenantConfig(slug), getTurnoConfig(slug)]).then(([cfg, turnoCfg]) => {
      if (cfg) {
        setBasic({ nombre: cfg.nombre || "", telefono: cfg.telefono || "", email: cfg.email || "", direccion: cfg.direccion || "", ciudad: cfg.ciudad || "" })
        setHorarios(cfg.horarios?.length ? cfg.horarios : HORARIOS_DEFAULT)
        if (cfg.minHorasAnticipacion !== undefined) setMinHoras(cfg.minHorasAnticipacion)
        if (cfg.calendarId) setCalendarIdField(cfg.calendarId)
        setEmailProvider(cfg.emailProvider ?? "resend")
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

  // ── Horarios handlers ──
  function updateHorario(i: number, field: keyof HorarioTenant, value: string | boolean) {
    setHorarios(prev => prev.map((h, idx) => idx === i ? { ...h, [field]: value } : h))
  }
  function addHorario() {
    setHorarios(prev => [...prev, { dia: "", nombre: "", apertura: "09:00", cierre: "18:00", cerrado: false }])
  }
  function removeHorario(i: number) {
    setHorarios(prev => prev.filter((_, idx) => idx !== i))
  }
  function toggleHorarioDia(i: number, diaNum: number) {
    setHorarios(prev => prev.map((h, idx) => {
      if (idx !== i) return h
      const actuales = diaToWeekdays(h.dia)
      const nuevos = actuales.includes(diaNum) ? actuales.filter(d => d !== diaNum) : [...actuales, diaNum]
      return { ...h, dia: weekdaysToDiaString(nuevos) }
    }))
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
  function updateServicioTurnoNumero(i: number, field: "anticipacionHoras" | "cupoSimultaneo", value: string) {
    const n = parseInt(value, 10)
    setServiciosTurno(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: Number.isNaN(n) ? undefined : n } : s))
  }
  function addServicioHorario(i: number) {
    setServiciosTurno(prev => prev.map((s, idx) => idx === i
      ? { ...s, horarios: [...(s.horarios ?? []), { dia: "", apertura: "10:00", cierre: "12:00", cerrado: false }] }
      : s))
  }
  function removeServicioHorario(i: number, hi: number) {
    setServiciosTurno(prev => prev.map((s, idx) => idx === i
      ? { ...s, horarios: (s.horarios ?? []).filter((_, hidx) => hidx !== hi) }
      : s))
  }
  function updateServicioHorarioField(i: number, hi: number, field: "apertura" | "cierre", value: string) {
    setServiciosTurno(prev => prev.map((s, idx) => idx === i
      ? { ...s, horarios: (s.horarios ?? []).map((h, hidx) => hidx === hi ? { ...h, [field]: value } : h) }
      : s))
  }
  function toggleServicioHorarioDia(i: number, hi: number, diaNum: number) {
    setServiciosTurno(prev => prev.map((s, idx) => {
      if (idx !== i) return s
      const horarios = (s.horarios ?? []).map((h, hidx) => {
        if (hidx !== hi) return h
        const actuales = diaToWeekdays(h.dia)
        const nuevos = actuales.includes(diaNum) ? actuales.filter(d => d !== diaNum) : [...actuales, diaNum]
        return { ...h, dia: weekdaysToDiaString(nuevos) }
      })
      return { ...s, horarios }
    }))
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
      <div className="space-y-6">
        <EncabezadoPagina
          icono={Settings}
          titulo="Configuración"
          descripcion="Datos de la clínica, cómo se toman los turnos, tu equipo, tu plan y las integraciones."
        />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabConfig)} className="max-w-3xl">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6">
            <TabsTrigger value="datos">Clínica</TabsTrigger>
            <TabsTrigger value="turnos">Turnos</TabsTrigger>
            <TabsTrigger value="equipo">Equipo</TabsTrigger>
            <TabsTrigger value="firma">Mi firma</TabsTrigger>
            <TabsTrigger value="plan">Plan</TabsTrigger>
            <TabsTrigger value="integraciones">Integraciones</TabsTrigger>
          </TabsList>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/*  TAB: DATOS DE LA VETERINARIA                                      */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="datos" className="space-y-6 mt-6">

            {/* La portada, fotos, servicios y ubicación de la web se movieron a Tienda virtual */}
            <Link
              href={`/${slug}/admin/TiendaVirtual`}
              className="flex items-center gap-3 rounded-xl border bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 px-4 py-3 hover:shadow-sm transition-shadow"
            >
              <Store className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Logo, portada, servicios y ubicación</p>
                <p className="text-xs text-muted-foreground">Lo que se ve en tu página pública se edita en Tienda virtual.</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>

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

          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/*  TAB: CONFIGURACION DE TURNOS                                      */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="turnos" className="space-y-6 mt-6">

            {/* ── HORARIOS ── */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Horarios de atencion</CardTitle>
                    <CardDescription>Se muestran en tu pagina publica. Marca los dias que cubre cada fila; el nombre (ej &quot;Urgencias&quot;) es solo una etiqueta y no afecta los dias. Si un dia no es de corrido, desactiva &quot;Corrido&quot; para definir dos bloques horarios.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" type="button" onClick={addHorario}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Agregar fila
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {horarios.map((h, i) => {
                    const diasSeleccionados = diaToWeekdays(h.dia)
                    return (
                    <div key={i} className="p-3 rounded-lg border bg-muted/30 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-wrap gap-1 flex-1">
                          {DIAS_SEMANA.map(d => (
                            <button
                              key={d.num}
                              type="button"
                              onClick={() => toggleHorarioDia(i, d.num)}
                              className={`h-8 px-2 rounded-md text-xs font-medium border transition-colors ${
                                diasSeleccionados.includes(d.num)
                                  ? "bg-emerald-600 text-white border-emerald-600"
                                  : "bg-background text-muted-foreground border-input hover:bg-muted"
                              }`}
                            >
                              {d.nombre.slice(0, 3)}
                            </button>
                          ))}
                        </div>
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

                      <Input
                        value={h.nombre ?? ""}
                        onChange={e => updateHorario(i, "nombre", e.target.value)}
                        placeholder="Nombre (opcional, ej: Urgencias)"
                        className="h-8 text-sm"
                      />

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
                  )})}
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
                <CardTitle className="flex items-center gap-1.5 text-base">Anticipación mínima para turnos <Ayuda tema="config.anticipacion" /></CardTitle>
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
                    <div key={i} className="p-3 rounded-lg border bg-muted/30 space-y-3">
                      <div className="flex items-start gap-2">
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
                        </div>
                        <Button variant="ghost" size="icon" type="button" className="h-8 w-8 text-muted-foreground hover:text-destructive mt-5" onClick={() => removeServicioTurno(i)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pl-1">
                        <div className="space-y-1">
                          <Label className="gap-1.5 text-xs">Duración (min) <Ayuda tema="config.duracion" /></Label>
                          <Input type="number" min={5} step={5} value={s.duracionMin ?? 60} onChange={e => updateServicioTurnoDuracion(i, e.target.value)} placeholder="60" className="h-9 font-mono" />
                          <p className="text-[10px] text-muted-foreground">Tambien define cada cuanto se ofrece un horario (ej: 15 min = turnos cada 15 min).</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="gap-1.5 text-xs">Cupo simultáneo <Ayuda tema="config.cupo" /></Label>
                          <Input type="number" min={1} step={1} value={s.cupoSimultaneo ?? 1} onChange={e => updateServicioTurnoNumero(i, "cupoSimultaneo", e.target.value)} placeholder="1" className="h-9 font-mono" />
                        </div>
                        <div className="space-y-1">
                          <Label className="gap-1.5 text-xs">Anticipación mínima (hs) <Ayuda tema="config.anticipacion" /></Label>
                          <Input type="number" min={0} step={1} value={s.anticipacionHoras ?? ""} onChange={e => updateServicioTurnoNumero(i, "anticipacionHoras", e.target.value)} placeholder={`General: ${minHoras}`} className="h-9 font-mono" />
                        </div>
                      </div>

                      <div className="pl-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="gap-1.5 text-xs">Horarios propios (opcional) <Ayuda tema="config.horariosPropios" /></Label>
                          <Button variant="outline" size="sm" type="button" className="h-7 text-xs" onClick={() => addServicioHorario(i)}>
                            <Plus className="h-3 w-3 mr-1" />
                            Agregar bloque
                          </Button>
                        </div>
                        {!s.horarios?.length && (
                          <p className="text-xs text-muted-foreground">Sin horarios propios: usa los horarios generales de la veterinaria.</p>
                        )}
                        {s.horarios?.map((h, hi) => {
                          const diasSeleccionados = diaToWeekdays(h.dia)
                          return (
                            <div key={hi} className="p-2 rounded-md border bg-background space-y-1.5">
                              <div className="flex flex-wrap items-center gap-1">
                                {DIAS_SEMANA.map(d => (
                                  <button
                                    key={d.num}
                                    type="button"
                                    onClick={() => toggleServicioHorarioDia(i, hi, d.num)}
                                    className={`h-7 px-2 rounded-md text-[11px] font-medium border transition-colors ${
                                      diasSeleccionados.includes(d.num)
                                        ? "bg-emerald-600 text-white border-emerald-600"
                                        : "bg-background text-muted-foreground border-input hover:bg-muted"
                                    }`}
                                  >
                                    {d.nombre.slice(0, 3)}
                                  </button>
                                ))}
                                <Button variant="ghost" size="icon" type="button" className="h-7 w-7 ml-auto text-muted-foreground hover:text-destructive" onClick={() => removeServicioHorario(i, hi)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                              <div className="flex items-center gap-2">
                                <Input value={h.apertura} onChange={e => updateServicioHorarioField(i, hi, "apertura", e.target.value)} placeholder="10:00" className="h-8 w-20 text-sm font-mono" />
                                <span className="text-xs text-muted-foreground">a</span>
                                <Input value={h.cierre} onChange={e => updateServicioHorarioField(i, hi, "cierre", e.target.value)} placeholder="12:00" className="h-8 w-20 text-sm font-mono" />
                              </div>
                            </div>
                          )
                        })}
                      </div>
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

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/*  TAB: MI FIRMA (por profesional, no por tenant)                    */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="firma" className="space-y-6 mt-6">
            <MiFirmaManagement tenantId={slug} />
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/*  TAB: PLAN Y SUSCRIPCIÓN                                           */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="plan" className="space-y-6 mt-6">
            <PlanManagement tenantId={slug} />
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/*  TAB: INTEGRACIONES (Point, ARCA, Google Calendar, email)          */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="integraciones" className="space-y-6 mt-6">
            <MpPointConfig tenantId={slug} />
            <FacturacionConfig tenantId={slug} />
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

            <EmailProviderConfig slug={slug} emailProvider={emailProvider} onProviderChange={setEmailProvider} />
          </TabsContent>
        </Tabs>

      </div>
      <Toaster />
    </>
  )
}

function SaveButton({ loading }: { loading: boolean }) {
  const readOnly = useReadOnly()
  return (
    <Button
      type="submit"
      disabled={loading || readOnly}
      title={readOnly ? "Reactivá tu cuenta para editar" : undefined}
      className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
    >
      {loading
        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</>
        : <><Save className="mr-2 h-4 w-4" />Guardar cambios</>
      }
    </Button>
  )
}
