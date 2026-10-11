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
    q: "¿Puedo probarlo gratis?",
    a: "Sí. Al registrarte tenés 10 días del plan Pro completo, sin tarjeta y con datos de ejemplo. Cuando termina, elegís con qué plan seguir: Básico ($50.000/mes) o Pro ($80.000/mes). No se cobra nada sin que lo confirmes.",
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
    a: "Sí. Subís o bajás de plan en cualquier momento desde tu panel, pagando con Mercado Pago. El cambio se refleja de inmediato en los límites y funciones disponibles, y cancelás cuando quieras.",
  },
  {
    q: "¿Mis datos y los de mis pacientes están seguros?",
    a: "Sí. La información viaja cifrada y se guarda en infraestructura de nivel empresarial, con accesos por roles para tu equipo. Cada clínica ve únicamente sus propios datos.",
  },
]
