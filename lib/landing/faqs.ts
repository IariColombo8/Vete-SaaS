/**
 * Preguntas frecuentes de la landing. Viven acá y no en el componente porque
 * las usan dos lugares: la sección visible (`components/landing/faq.tsx`, que es
 * "use client") y los datos estructurados para Google, que se arman en el
 * servidor y no pueden importar valores de un módulo cliente.
 */
export interface PreguntaFrecuente {
  q: string
  a: string
}

export const FAQS: PreguntaFrecuente[] = [
  {
    q: "¿Puedo empezar gratis?",
    a: "Sí. El plan Básico es gratuito e incluye hasta 10 turnos por mes, tu página pública y la gestión de turnos y clientes. No pedimos tarjeta para empezar.",
  },
  {
    q: "¿Necesito instalar algo o saber de tecnología?",
    a: "No. VetPanel funciona desde el navegador, en cualquier celular o computadora. Te registrás con Google y en minutos ya tenés tu clínica online con un asistente que te guía.",
  },
  {
    q: "¿Mis clientes cómo reservan?",
    a: "Compartís tu link propio (por WhatsApp, Instagram o donde quieras). Tus clientes entran, eligen mascota, servicio y horario disponible, y listo. Vos lo ves al instante en tu panel.",
  },
  {
    q: "¿Puedo cambiar de plan cuando quiera?",
    a: "Sí. Subís o bajás de plan en cualquier momento. El cambio se refleja de inmediato en los límites y funciones disponibles.",
  },
  {
    q: "¿Mis datos y los de mis pacientes están seguros?",
    a: "Sí. La información viaja cifrada y se guarda en infraestructura de nivel empresarial, con accesos por roles para tu equipo. Cada clínica ve únicamente sus propios datos.",
  },
]
