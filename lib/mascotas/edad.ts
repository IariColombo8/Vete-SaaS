export type UnidadEdad = "meses" | "anios"

export interface Edad {
  valor: number
  unidad: UnidadEdad
}

export interface EdadRegistrada extends Edad {
  /** Fecha (YYYY-MM-DD) en la que se cargo este valor de edad. */
  registradaEn: string
}

function mesesEntre(desde: Date, hasta: Date): number {
  const meses =
    (hasta.getFullYear() - desde.getFullYear()) * 12 +
    (hasta.getMonth() - desde.getMonth())
  return Math.max(0, meses)
}

/**
 * Recalcula la edad actual sumando el tiempo transcurrido desde que se
 * registro. Si la edad llega a 12 meses o mas, se expresa en anios.
 */
export function calcularEdadActual(
  registrada: EdadRegistrada | null | undefined,
  ahora: Date = new Date(),
): Edad | null {
  if (!registrada) return null

  const totalMesesRegistrados =
    registrada.unidad === "anios" ? registrada.valor * 12 : registrada.valor

  const totalMeses =
    totalMesesRegistrados + mesesEntre(new Date(registrada.registradaEn), ahora)

  if (totalMeses < 12) {
    return { valor: totalMeses, unidad: "meses" }
  }
  return { valor: Math.floor(totalMeses / 12), unidad: "anios" }
}

export function formatearEdad(edad: Edad): string {
  const etiqueta =
    edad.unidad === "meses"
      ? edad.valor === 1 ? "mes" : "meses"
      : edad.valor === 1 ? "año" : "años"
  return `${edad.valor} ${etiqueta}`
}
