import type {
  ServicioTenant,
  ServicioTurnoConfig,
  HorarioTenant,
  MascotaTurnoConfig,
  Modalidad,
} from "@/lib/supabase/queries"
import { MASCOTAS_DEFAULT } from "@/lib/turno-defaults"

/**
 * Templates de onboarding: pre-configuran servicios, horarios y modalidad
 * según el tipo de veterinaria, para que el panel quede usable en un click.
 */

export interface OnboardingTemplate {
  id: string
  nombre: string
  descripcion: string
  emoji: string
  modalidad: Modalidad
  horarios: HorarioTenant[]
  serviciosPagina: ServicioTenant[]
  serviciosTurno: ServicioTurnoConfig[]
  mascotas: MascotaTurnoConfig[]
}

const HORARIO_ESTANDAR: HorarioTenant[] = [
  { dia: "Lunes a Viernes", apertura: "09:00", cierre: "18:00", cerrado: false },
  { dia: "Sabado", apertura: "09:00", cierre: "13:00", cerrado: false },
  { dia: "Domingo", apertura: "", cierre: "", cerrado: true },
]

export const ONBOARDING_TEMPLATES: OnboardingTemplate[] = [
  {
    id: "general",
    nombre: "Clínica general",
    descripcion: "Consultas, vacunación, cirugía y urgencias en consultorio.",
    emoji: "🏥",
    modalidad: "local",
    horarios: HORARIO_ESTANDAR,
    serviciosPagina: [
      { emoji: "🩺", nombre: "Consulta general", descripcion: "Revisión completa de tu mascota" },
      { emoji: "💉", nombre: "Vacunación", descripcion: "Plan de vacunas al día" },
      { emoji: "🏥", nombre: "Cirugía", descripcion: "Procedimientos quirúrgicos" },
      { emoji: "🚨", nombre: "Urgencias", descripcion: "Atención de emergencias" },
    ],
    serviciosTurno: [
      { id: "consulta-general", emoji: "🩺", nombre: "Consulta general", descripcion: "Examen clínico", duracionMin: 30 },
      { id: "vacunacion", emoji: "💉", nombre: "Vacunación", descripcion: "Aplicación de vacunas", duracionMin: 30 },
      { id: "cirugia", emoji: "🏥", nombre: "Cirugía", descripcion: "Procedimiento quirúrgico", duracionMin: 120 },
      { id: "urgencia", emoji: "🚨", nombre: "Urgencia", descripcion: "Atención prioritaria", duracionMin: 60 },
    ],
    mascotas: MASCOTAS_DEFAULT,
  },
  {
    id: "estetica",
    nombre: "Peluquería / estética",
    descripcion: "Baño, corte y estética. Turnos más largos.",
    emoji: "🛁",
    modalidad: "local",
    horarios: HORARIO_ESTANDAR,
    serviciosPagina: [
      { emoji: "🛁", nombre: "Baño", descripcion: "Baño completo con productos profesionales" },
      { emoji: "✂️", nombre: "Corte", descripcion: "Corte y peinado según raza" },
      { emoji: "🐾", nombre: "Estética integral", descripcion: "Baño + corte + uñas + oídos" },
    ],
    serviciosTurno: [
      { id: "bano", emoji: "🛁", nombre: "Baño", descripcion: "Baño completo", duracionMin: 60 },
      { id: "corte", emoji: "✂️", nombre: "Corte", descripcion: "Corte y peinado", duracionMin: 60 },
      { id: "estetica-integral", emoji: "🐾", nombre: "Estética integral", descripcion: "Baño + corte + uñas", duracionMin: 120 },
    ],
    mascotas: [
      { id: "perro", emoji: "🐕", nombre: "Perro" },
      { id: "gato", emoji: "🐈", nombre: "Gato" },
    ],
  },
  {
    id: "domicilio",
    nombre: "Atención a domicilio",
    descripcion: "Visitas a la casa del cliente. Sin consultorio fijo.",
    emoji: "🏠",
    modalidad: "domicilio",
    horarios: HORARIO_ESTANDAR,
    serviciosPagina: [
      { emoji: "🩺", nombre: "Consulta a domicilio", descripcion: "Atención en tu hogar" },
      { emoji: "💉", nombre: "Vacunación a domicilio", descripcion: "Plan de vacunas sin moverte" },
    ],
    serviciosTurno: [
      { id: "consulta-domicilio", emoji: "🩺", nombre: "Consulta a domicilio", descripcion: "Visita a tu hogar", duracionMin: 60 },
      { id: "vacunacion-domicilio", emoji: "💉", nombre: "Vacunación a domicilio", descripcion: "Vacunas en tu hogar", duracionMin: 30 },
    ],
    mascotas: MASCOTAS_DEFAULT,
  },
]
