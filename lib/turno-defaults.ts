import type { MascotaTurnoConfig, ServicioTurnoConfig, VacunaTurnoConfig } from "@/lib/supabase/queries"

export const MASCOTAS_DEFAULT: MascotaTurnoConfig[] = [
  { id: "perro", emoji: "🐕", nombre: "Perro" },
  { id: "gato", emoji: "🐈", nombre: "Gato" },
  { id: "conejo", emoji: "🐰", nombre: "Conejo" },
  { id: "ave", emoji: "🦜", nombre: "Ave" },
  { id: "otro", emoji: "🐾", nombre: "Otro" },
]

export const SERVICIOS_DEFAULT: ServicioTurnoConfig[] = [
  {
    id: "consulta-general",
    emoji: "🩺",
    nombre: "Consultas Generales",
    descripcion: "Examenes completos y diagnosticos profesionales para tu mascota",
  },
  {
    id: "telemedicina",
    emoji: "💻",
    nombre: "Telemedicina",
    descripcion: "Procedimientos para detectar online y con rapidez el diagnostico",
  },
  {
    id: "vacunacion",
    emoji: "💉",
    nombre: "Vacunacion",
    descripcion: "Plan de vacunacion completo para proteger a tu mascota",
  },
  {
    id: "urgencias",
    emoji: "🚨",
    nombre: "Urgencias",
    descripcion: "Atencion de emergencia las 24 horas del dia",
  },
]

export const VACUNAS_DEFAULT: Record<string, VacunaTurnoConfig[]> = {
  perro: [
    { id: "antirrabica", nombre: "Antirrabica", descripcion: "Obligatoria - Proteccion contra el virus de la rabia" },
    { id: "quintuple", nombre: "Quintuple", descripcion: "Proteccion contra Moquillo, Hepatitis, Parvovirus, Parainfluenza y Adenovirus" },
    { id: "sextuple", nombre: "Sextuple", descripcion: "Quintuple + Leptospirosis - Proteccion mas completa" },
  ],
  gato: [
    { id: "triple-felina", nombre: "Triple Felina", descripcion: "Proteccion contra Panleucopenia, Rinotraqueitis y Calicivirus" },
    { id: "leucemia-felina", nombre: "Leucemia Felina (FeLV)", descripcion: "Recomendada para gatos que salen al exterior o conviven con otros gatos" },
    { id: "antirrabica", nombre: "Antirrabica", descripcion: "Obligatoria - Proteccion contra el virus de la rabia" },
  ],
}
