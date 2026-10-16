import { DIA_VENCIMIENTO, diaDelMes, periodoActual, sumarMeses } from "./cobro-manual"

/**
 * Cuándo arranca el débito de una suscripción nueva de Mercado Pago.
 *
 * El abono se cobra del 1 al 10 de cada mes, igual que el pago en efectivo:
 * MP repite el débito todos los meses el mismo día que el primero, y si un
 * cobro rebota lo reintenta durante unos días. Por eso el primer débito cae
 * siempre al principio de un mes:
 *
 *  - Si el mes en curso ya está cubierto (pagado en efectivo, en prueba, o
 *    con otra suscripción que ya cobró), arranca el 1 del primer mes impago.
 *  - Si no está cubierto y estamos entre el 1 y el 10, se cobra en el momento
 *    (el día del débito queda dentro de la ventana).
 *  - Si no está cubierto y ya pasó el 10, arranca el 1 del mes que viene: lo
 *    que queda del mes no se cobra.
 *
 * Devuelve el `start_date` para MP (ISO, 9 de la mañana de Argentina) o
 * `null` para cobrar ya. Puro y con `ahora` inyectable.
 */
export function inicioDebito(ahora: Date, primerMesImpago: string): string | null {
  const actual = periodoActual(ahora)
  if (primerMesImpago > actual) return `${primerMesImpago}T09:00:00.000-03:00`
  if (diaDelMes(ahora) <= DIA_VENCIMIENTO) return null
  return `${sumarMeses(actual, 1)}T09:00:00.000-03:00`
}
