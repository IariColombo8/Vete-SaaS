import { supabase } from "./config"
import type { Promocion, PromocionItem } from "./types"

/**
 * Promociones (combos de varios productos a precio fijo). El precio de cada
 * unidad involucrada no se recalcula acá: `promocionVigente` decide si aplica
 * hoy, y `lib/ventas/promociones.ts` decide cuánto descuenta en un carrito.
 */

type Fila = Record<string, unknown>

function num(v: unknown, porDefecto = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : porDefecto
}

function aPromocion(f: Fila, items: Fila[]): Promocion {
  return {
    id: f.id as string,
    nombre: (f.nombre as string) ?? "",
    descripcion: (f.descripcion as string) ?? undefined,
    precioFinal: num(f.precio_final),
    activa: (f.activa as boolean) ?? false,
    desde: (f.desde as string) ?? undefined,
    hasta: (f.hasta as string) ?? undefined,
    items: items.map((i) => ({
      id: i.id as string,
      productoId: i.producto_id as string,
      cantidad: num(i.cantidad),
    })),
    createdAt: (f.created_at as string) ?? undefined,
    updatedAt: (f.updated_at as string) ?? undefined,
  }
}

function mensajeError(error: { message: string }, accion: string): Error {
  return new Error(`${accion}: ${error.message}`)
}

/** ¿La promoción aplica hoy? Vence al final del día de `hasta`, igual que las ofertas. */
export function promocionVigente(
  p: Pick<Promocion, "activa" | "desde" | "hasta">,
  hoy: Date = new Date(),
): boolean {
  if (!p.activa) return false
  if (p.desde) {
    const inicio = new Date(`${p.desde}T00:00:00`)
    if (!Number.isNaN(inicio.getTime()) && hoy.getTime() < inicio.getTime()) return false
  }
  if (p.hasta) {
    const fin = new Date(`${p.hasta}T23:59:59.999`)
    if (!Number.isNaN(fin.getTime()) && hoy.getTime() > fin.getTime()) return false
  }
  return true
}

export async function getPromociones(tenantId: string): Promise<Promocion[]> {
  const { data, error } = await supabase
    .from("promociones")
    .select("*, promocion_items(*)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
  if (error) throw mensajeError(error, "No se pudieron cargar las promociones")

  return (data ?? []).map((f: Fila) => aPromocion(f, (f.promocion_items as Fila[]) ?? []))
}

/** Solo las vigentes hoy — lo que usa el POS para detectar combos en el carrito. */
export async function getPromocionesVigentes(tenantId: string): Promise<Promocion[]> {
  const todas = await getPromociones(tenantId)
  return todas.filter((p) => promocionVigente(p))
}

export interface PromocionInput {
  nombre: string
  descripcion?: string
  precioFinal: number
  activa: boolean
  desde?: string | null
  hasta?: string | null
  items: Pick<PromocionItem, "productoId" | "cantidad">[]
}

export async function createPromocion(tenantId: string, input: PromocionInput): Promise<Promocion> {
  const { data: creada, error } = await supabase
    .from("promociones")
    .insert({
      tenant_id: tenantId,
      nombre: input.nombre,
      descripcion: input.descripcion || null,
      precio_final: input.precioFinal,
      activa: input.activa,
      desde: input.desde || null,
      hasta: input.hasta || null,
    })
    .select("*")
    .single()
  if (error) throw mensajeError(error, "No se pudo crear la promoción")

  const items = input.items.map((i) => ({
    promocion_id: creada.id, producto_id: i.productoId, cantidad: i.cantidad,
  }))
  const { error: errorItems } = await supabase.from("promocion_items").insert(items)
  if (errorItems) throw mensajeError(errorItems, "No se pudieron guardar los productos de la promoción")

  return aPromocion(creada, items.map((i) => ({ ...i, id: undefined })))
}

export async function updatePromocion(
  tenantId: string,
  id: string,
  input: PromocionInput,
): Promise<void> {
  const { error } = await supabase
    .from("promociones")
    .update({
      nombre: input.nombre,
      descripcion: input.descripcion || null,
      precio_final: input.precioFinal,
      activa: input.activa,
      desde: input.desde || null,
      hasta: input.hasta || null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", id)
  if (error) throw mensajeError(error, "No se pudo actualizar la promoción")

  // Reemplazo completo de los items: más simple y seguro que diffear altas/bajas.
  const { error: errorBorrado } = await supabase.from("promocion_items").delete().eq("promocion_id", id)
  if (errorBorrado) throw mensajeError(errorBorrado, "No se pudieron actualizar los productos de la promoción")

  const items = input.items.map((i) => ({ promocion_id: id, producto_id: i.productoId, cantidad: i.cantidad }))
  const { error: errorItems } = await supabase.from("promocion_items").insert(items)
  if (errorItems) throw mensajeError(errorItems, "No se pudieron guardar los productos de la promoción")
}

export async function eliminarPromocion(tenantId: string, id: string): Promise<void> {
  const { error } = await supabase.from("promociones").delete().eq("tenant_id", tenantId).eq("id", id)
  if (error) throw mensajeError(error, "No se pudo eliminar la promoción")
}
