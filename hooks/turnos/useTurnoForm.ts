import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
  createTurno, createCliente, createMascota,
  updateCliente, updateMascota, getTenantConfig,
} from "@/lib/firebase/firestore"
import type { HorarioTenant } from "@/lib/firebase/firestore"
import { enviarEmailConfirmacion } from "@/app/turno/confirmaciondeturno"
import { useClienteByDNI } from "./useClienteByDNI"
import { useDisponibilidadTurnos } from "./useDisponibilidadTurnos"
import { DEFAULT_TENANT_ID } from "@/lib/config"

// ── Horario helpers (exported for use in FechaHoraSection) ───────────────────

function normalizeStr(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
}

const DAY_NUM: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3,
  jueves: 4, viernes: 5, sabado: 6,
}

export function diaToWeekdays(dia: string): number[] {
  const d = normalizeStr(dia)
  const range = d.match(/^(\w+)\s+a\s+(\w+)$/)
  if (range) {
    const s = DAY_NUM[range[1]], e = DAY_NUM[range[2]]
    if (s !== undefined && e !== undefined) {
      const out: number[] = []
      for (let i = s; i <= e; i++) out.push(i)
      return out
    }
  }
  return DAY_NUM[d] !== undefined ? [DAY_NUM[d]] : []
}

export function generateTimeSlots(apertura: string, cierre: string): string[] {
  const ah = parseInt(apertura.split(":")[0], 10)
  const ch = parseInt(cierre.split(":")[0], 10)
  const slots: string[] = []
  for (let h = ah; h < ch; h++) slots.push(`${h.toString().padStart(2, "0")}:00`)
  return slots
}

export function getHorarioForDay(dayOfWeek: number, horarios: HorarioTenant[]): HorarioTenant | null {
  return horarios.find(h => diaToWeekdays(h.dia).includes(dayOfWeek)) ?? null
}

function computeClosedDays(horarios: HorarioTenant[]): number[] {
  const open = new Set<number>()
  for (const h of horarios) {
    if (!h.cerrado) diaToWeekdays(h.dia).forEach(d => open.add(d))
  }
  return [0, 1, 2, 3, 4, 5, 6].filter(d => !open.has(d))
}

interface UseTurnoFormOptions {
  tenantId?: string
  defaultDni?: string
  lockDni?: boolean
  redirectOnSuccess?: boolean
  onSuccess?: () => void
}

export function useTurnoForm(options: UseTurnoFormOptions = {}) {
  const {
    tenantId = DEFAULT_TENANT_ID,
    defaultDni,
    lockDni = false,
    redirectOnSuccess = true,
    onSuccess,
  } = options

  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading]                 = useState(false)
  const [selectedDate, setSelectedDate]       = useState<Date>()
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [datosEditados, setDatosEditados]     = useState(false)
  const [horariosDisponibles, setHorariosDisponibles] = useState<string[]>([])
  const [tenantHorarios, setTenantHorarios]   = useState<HorarioTenant[]>([])
  const [closedDays, setClosedDays]           = useState<number[]>([0])

  const [formData, setFormData] = useState({
    nombre: "", telefono: "", email: "", dni: "", domicilio: "",
    mascotaExistenteId: "", nombreMascota: "", tipoMascota: "",
    edadMascota: "", razaMascota: "", pesoMascota: "",
    servicio: "", motivo: "", fecha: "", hora: "",
    vacunas: [] as string[],
  })

  const { clienteExistente, mascotas, mostrarNuevaMascota, setMostrarNuevaMascota, loadingCliente } =
    useClienteByDNI(formData.dni, tenantId)

  const { diasBloqueados, turnosExistentes } = useDisponibilidadTurnos(tenantId)

  useEffect(() => {
    getTenantConfig(tenantId).then(cfg => {
      if (cfg?.horarios?.length) {
        setTenantHorarios(cfg.horarios)
        setClosedDays(computeClosedDays(cfg.horarios))
      }
    })
  }, [tenantId])

  useEffect(() => {
    if (defaultDni && defaultDni !== formData.dni) {
      setFormData(prev => ({ ...prev, dni: defaultDni }))
      setDatosEditados(false)
    }
  }, [defaultDni, formData.dni])

  useEffect(() => {
    if (clienteExistente && !datosEditados) {
      setFormData(prev => ({
        ...prev,
        nombre:    clienteExistente.nombre    || "",
        telefono:  clienteExistente.telefono  || "",
        email:     clienteExistente.email     || "",
        domicilio: clienteExistente.domicilio || "",
      }))
    }
  }, [clienteExistente, datosEditados])

  useEffect(() => {
    if (!selectedDate) return
    const fechaSeleccionada = format(selectedDate, "yyyy-MM-dd")
    const ocupados = turnosExistentes
      .filter((t: any) => t.turno?.fecha === fechaSeleccionada && t.estado !== "cancelado")
      .map((t: any) => t.turno?.hora)
    let todos: string[]
    if (tenantHorarios.length > 0) {
      const horario = getHorarioForDay(selectedDate.getDay(), tenantHorarios)
      todos = (!horario || horario.cerrado) ? [] : generateTimeSlots(horario.apertura, horario.cierre)
    } else {
      todos = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"]
    }
    const disponibles = todos.filter(h => !ocupados.includes(h))
    setHorariosDisponibles(disponibles)
    if (formData.hora && !disponibles.includes(formData.hora)) handleChange("hora", "")
  }, [selectedDate, turnosExistentes, tenantHorarios])

  const handleChange = (field: string, value: string) => {
    if (lockDni && field === "dni") return
    setFormData(prev => ({ ...prev, [field]: value }))
    if (["nombre", "telefono", "email", "domicilio"].includes(field) && clienteExistente) setDatosEditados(true)
    if (field === "servicio" && value !== "vacunacion") setFormData(prev => ({ ...prev, vacunas: [] }))
    if (field === "mascotaExistenteId") {
      setMostrarNuevaMascota(value === "nueva")
      if (value !== "nueva") {
        const m = mascotas.find(m => m.id === value)
        if (m) setFormData(prev => ({ ...prev, nombreMascota: m.nombre || "", tipoMascota: m.tipo || "", edadMascota: m.edad || "", razaMascota: m.raza || "", pesoMascota: m.peso || "" }))
      } else {
        setFormData(prev => ({ ...prev, nombreMascota: "", tipoMascota: "", edadMascota: "", razaMascota: "", pesoMascota: "" }))
      }
    }
  }

  const handleVacunasChange = (vacunas: string[]) => {
    setFormData(prev => ({ ...prev, vacunas }))
  }

  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (
      formData.servicio === "vacunacion" &&
      (formData.tipoMascota === "perro" || formData.tipoMascota === "gato") &&
      formData.vacunas.length === 0
    ) {
      toast({ title: "Vacunas requeridas", description: "Por favor seleccioná al menos una vacuna", variant: "destructive" })
      return
    }
    setShowConfirmModal(true)
  }

  const handleConfirmedSubmit = async () => {
    setLoading(true)
    setShowConfirmModal(false)
    try {
      let clienteId = clienteExistente?.id
      let mascotaId = formData.mascotaExistenteId !== "nueva" ? formData.mascotaExistenteId : null

      if (!clienteId) {
        const clienteRef = await createCliente(tenantId, {
          nombre: formData.nombre, telefono: formData.telefono,
          email: formData.email, dni: formData.dni, domicilio: formData.domicilio,
        })
        clienteId = clienteRef.id
      } else if (datosEditados) {
        await updateCliente(tenantId, clienteId, {
          nombre: formData.nombre, telefono: formData.telefono,
          email: formData.email, domicilio: formData.domicilio,
        })
      }

      if (mostrarNuevaMascota || !mascotaId) {
        const mascotaRef = await createMascota(tenantId, clienteId, {
          nombre: formData.nombreMascota, tipo: formData.tipoMascota,
          edad: formData.edadMascota, raza: formData.razaMascota, peso: formData.pesoMascota,
        })
        mascotaId = mascotaRef.id
      } else {
        await updateMascota(tenantId, clienteId, mascotaId, {
          nombre: formData.nombreMascota, tipo: formData.tipoMascota,
          edad: formData.edadMascota, raza: formData.razaMascota, peso: formData.pesoMascota,
        })
      }

      await createTurno(tenantId, {
        clienteId,
        mascotaId: mascotaId || "",
        cliente: { nombre: formData.nombre, telefono: formData.telefono, email: formData.email, dni: formData.dni, domicilio: formData.domicilio },
        mascota: { nombre: formData.nombreMascota, tipo: formData.tipoMascota, motivo: formData.motivo },
        servicio: formData.servicio, fecha: formData.fecha, hora: formData.hora,
        estado: "pendiente", vacunas: formData.vacunas,
      })

      try {
        await fetch("/api/calendar/create-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mascotaNombre: formData.nombreMascota, duenoNombre: formData.nombre,
            motivo: formData.motivo, fecha: formData.fecha, hora: formData.hora,
            servicio: formData.servicio,
          }),
        })
      } catch (e) {
        console.error("No se pudo crear evento en Calendar:", e)
      }

      const emailEnviado = await enviarEmailConfirmacion({
        nombre_y_apellido: formData.nombre,
        fecha: selectedDate ? format(selectedDate, "PPP", { locale: es }) : formData.fecha,
        hora: formData.hora, direccion: formData.domicilio,
        nombre_mascota: formData.nombreMascota, tipo_mascota: formData.tipoMascota,
        servicio_requerido: formData.servicio, email: formData.email,
      })
      if (!emailEnviado) console.warn("No se pudo enviar el email de confirmación")

      toast({ title: "Turno agendado exitosamente", description: "Te enviamos un email de confirmación." })
      onSuccess?.()
      if (redirectOnSuccess) setTimeout(() => router.push("/"), 2000)

    } catch (error: unknown) {
      if (error instanceof Error && error.message === "TENANT_PAUSED") {
        toast({ title: "Servicio pausado", description: "Esta veterinaria no está recibiendo turnos en este momento.", variant: "destructive" })
      } else if (error instanceof Error && error.message === "PLAN_LIMIT_REACHED") {
        toast({ title: "Límite del plan alcanzado", description: "Esta veterinaria alcanzó el límite de 10 turnos por mes del plan gratuito.", variant: "destructive" })
      } else {
        console.error("Error creating turno:", error)
        toast({ title: "Error al agendar turno", description: "Por favor, intenta nuevamente.", variant: "destructive" })
      }
    } finally {
      setLoading(false)
    }
  }

  return {
    formData, handleChange, handleVacunasChange,
    handleSubmit: handlePreSubmit, handleConfirmedSubmit,
    loading, clienteExistente, mascotas, mostrarNuevaMascota, setMostrarNuevaMascota,
    selectedDate, setSelectedDate, horariosDisponibles,
    diasBloqueados, loadingCliente, showConfirmModal, setShowConfirmModal, datosEditados,
    closedDays, tenantHorarios,
  }
}
