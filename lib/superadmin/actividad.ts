/**
 * Resumen del contador de uso del panel (`actividad_panel`) por usuario y por
 * veterinaria. Puro, con `ahora` inyectable para testear.
 */

export interface FilaActividad {
  usuarioId: string
  tenantId: string
  /** "2026-10-15", día en hora de Argentina. */
  dia: string
  aperturas: number
  /** Última apertura de ese día. */
  ultima: string
}

export interface UsoResumen {
  /** Última vez que abrió el panel, o null si no hay registro en la ventana. */
  ultima: string | null
  /** Días distintos con al menos una apertura. */
  diasActivos: number
  /** Veces que abrió el panel. */
  aperturas: number
  /** Para la tira de los últimos días: true si ese día entró (más viejo primero). */
  dias: boolean[]
}

const DIA_MS = 24 * 60 * 60 * 1000

/** "2026-10-15" del día de `fecha` en Argentina (UTC-3, sin horario de verano). */
export function diaArgentina(fecha: Date): string {
  return new Date(fecha.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** Los últimos `cantidad` días, el más viejo primero, terminando hoy. */
export function ultimosDias(ahora: Date, cantidad: number): string[] {
  return Array.from({ length: cantidad }, (_, i) =>
    diaArgentina(new Date(ahora.getTime() - (cantidad - 1 - i) * DIA_MS)),
  )
}

function resumir(filas: FilaActividad[], dias: string[]): UsoResumen {
  const conActividad = new Set(filas.map((f) => f.dia))
  const ultima = filas.reduce<string | null>((max, f) => (max === null || f.ultima > max ? f.ultima : max), null)
  return {
    ultima,
    diasActivos: dias.filter((d) => conActividad.has(d)).length,
    aperturas: filas.filter((f) => dias.includes(f.dia)).reduce((acc, f) => acc + f.aperturas, 0),
    dias: dias.map((d) => conActividad.has(d)),
  }
}

/** Uso de los últimos `ventana` días, por usuario y por veterinaria. */
export function resumirActividad(
  filas: FilaActividad[],
  ahora: Date,
  ventana = 30,
): { porUsuario: Record<string, UsoResumen>; porTenant: Record<string, UsoResumen> } {
  const dias = ultimosDias(ahora, ventana)
  const agrupar = (clave: (f: FilaActividad) => string) => {
    const grupos = new Map<string, FilaActividad[]>()
    for (const f of filas) {
      const k = clave(f)
      grupos.set(k, [...(grupos.get(k) ?? []), f])
    }
    return Object.fromEntries([...grupos].map(([k, g]) => [k, resumir(g, dias)]))
  }
  return { porUsuario: agrupar((f) => f.usuarioId), porTenant: agrupar((f) => f.tenantId) }
}

/** "Hoy 14:32", "Ayer 09:10", "Hace 5 días" o "Sin registro". */
export function haceCuanto(iso: string | null, ahora: Date): string {
  if (!iso) return "Sin registro"
  const fecha = new Date(iso)
  const hora = fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" })
  const hoy = diaArgentina(ahora)
  const dia = diaArgentina(fecha)
  if (dia === hoy) return `Hoy ${hora}`
  if (dia === diaArgentina(new Date(ahora.getTime() - DIA_MS))) return `Ayer ${hora}`
  const dias = Math.round((Date.parse(hoy) - Date.parse(dia)) / DIA_MS)
  return `Hace ${dias} días`
}
