import type { Cliente } from "@/lib/supabase/types"

/**
 * Saca acentos y pasa a minúscula. Sin esto, buscar "jose" no encuentra a
 * "José" en el selector del mostrador.
 */
export const normalizarTexto = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()

/** Nombres que se reconocen como la fila de venta al público. */
const NOMBRES_CONSUMIDOR_FINAL = ["consumidor final", "cliente final"]

/**
 * La venta al público se modela como un cliente real ("Consumidor final") en
 * vez de `null`: así el remito, la cuenta corriente y los reportes reciben
 * siempre una fila y no hay que tratar el caso "sin cliente" en cada consulta.
 *
 * Se reconoce **por nombre** y no por un id fijo porque la fila la crea cada
 * veterinaria a mano desde Clientes — no hay forma de saber su id de antemano.
 * A cambio hay que blindar dónde importa: vender a cuenta corriente a esta
 * fila acumularía deuda sobre una persona que no existe, así que
 * `PosManagement` lo rechaza igual que rechaza no elegir a nadie.
 */
export const esConsumidorFinal = (cliente: Cliente | null | undefined): boolean =>
  !!cliente && NOMBRES_CONSUMIDOR_FINAL.includes(normalizarTexto(cliente.nombre))

/**
 * La fila de consumidor final del tenant, si la creó. Ante duplicados devuelve
 * la primera del orden que ya trae la consulta (alfabético por nombre), para
 * que la elección sea estable entre recargas.
 */
export const buscarConsumidorFinal = (clientes: readonly Cliente[]): Cliente | null =>
  clientes.find(esConsumidorFinal) ?? null

/**
 * Ordena para el selector: el consumidor final primero, el resto sin tocar el
 * orden alfabético que ya viene de la base.
 */
export const conConsumidorFinalPrimero = (clientes: readonly Cliente[]): Cliente[] => [
  ...clientes.filter(esConsumidorFinal),
  ...clientes.filter((c) => !esConsumidorFinal(c)),
]
