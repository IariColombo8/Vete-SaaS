import type { HorarioTenant, TenantConfig } from "@/lib/supabase/types"
import { diaToWeekdays } from "@/lib/turnos/horarios"

/**
 * Datos estructurados (schema.org, JSON-LD) de la página pública de cada
 * veterinaria: le dicen a Google que es una clínica veterinaria, dónde está,
 * cuándo atiende y dónde se reserva turno.
 *
 * Solo se publica lo que la veterinaria cargó. Un campo vacío ("telephone": "")
 * Google lo marca como error en Search Console, así que se omite.
 */

/** Nombres de día de schema.org, indexados por número de día (0 = domingo). */
const DIA_SCHEMA = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const

const HORA_VALIDA = /^\d{2}:\d{2}$/

/** "Hasta medianoche" se carga como 24:00, pero Google solo acepta hasta 23:59. */
const cierreParaGoogle = (hora: string) => (hora === "24:00" ? "23:59" : hora)

interface EspecificacionHorario {
  "@type": "OpeningHoursSpecification"
  dayOfWeek: string[]
  opens: string
  closes: string
}

/** Convierte las filas de horario del tenant a OpeningHoursSpecification (siesta = dos bloques). */
export function horariosAEspecificacion(horarios: HorarioTenant[]): EspecificacionHorario[] {
  return horarios.flatMap((h) => {
    if (h.cerrado) return []
    const dayOfWeek = diaToWeekdays(h.dia).map((n) => DIA_SCHEMA[n])
    if (dayOfWeek.length === 0) return []

    const bloques: [string | undefined, string | undefined][] =
      h.corrido === false
        ? [[h.apertura, h.cierre1], [h.apertura2, h.cierre]]
        : [[h.apertura, h.cierre]]

    return bloques
      .filter((b): b is [string, string] => HORA_VALIDA.test(b[0] ?? "") && HORA_VALIDA.test(b[1] ?? ""))
      .map(([opens, closes]) => ({
        "@type": "OpeningHoursSpecification" as const,
        dayOfWeek,
        opens,
        closes: cierreParaGoogle(closes),
      }))
  })
}

/** Texto recortado, o undefined si está vacío (para que el campo no se publique). */
function texto(valor: string | undefined): string | undefined {
  const t = valor?.trim()
  return t ? t : undefined
}

/** Saca las claves con undefined o arrays vacíos. */
function sinVacios(objeto: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(objeto).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)),
  )
}

export function datosEstructuradosVeterinaria(
  slug: string,
  config: TenantConfig,
  baseUrl: string,
): Record<string, unknown> {
  const url = `${baseUrl}/${slug}`
  const fotos = (config.fotosHero ?? []).filter((f) => texto(f))
  const logo = texto(config.logo)

  const direccion = texto(config.direccion)
  const ciudad = texto(config.ciudad)
  const address =
    direccion || ciudad
      ? sinVacios({
          "@type": "PostalAddress",
          streetAddress: direccion,
          addressLocality: ciudad,
          addressCountry: "AR",
        })
      : undefined

  const makesOffer = (config.servicios ?? [])
    .filter((s) => texto(s.nombre))
    .map((s) => ({
      "@type": "Offer",
      itemOffered: sinVacios({ "@type": "Service", name: s.nombre.trim(), description: texto(s.descripcion) }),
    }))

  return sinVacios({
    "@context": "https://schema.org",
    "@type": "VeterinaryCare",
    "@id": `${url}/#veterinaria`,
    name: texto(config.nombre) ?? slug,
    url,
    description: texto(config.descripcion) ?? texto(config.slogan),
    telephone: texto(config.telefono),
    email: texto(config.email),
    logo,
    image: fotos.length > 0 ? fotos : logo ? [logo] : undefined,
    hasMap: texto(config.googleMapsUrl),
    address,
    openingHoursSpecification: horariosAEspecificacion(config.horarios ?? []),
    makesOffer,
    potentialAction: { "@type": "ReserveAction", target: `${url}/turno` },
  })
}
