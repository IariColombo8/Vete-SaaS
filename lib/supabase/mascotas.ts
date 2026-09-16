import { supabase } from "./config"
import { throwIfSupabaseError } from "./assert"
import type { Mascota } from "./types"
import { calcularEdadActual, formatearEdad } from "@/lib/mascotas/edad"

/**
 * Mascotas. Se conserva la firma `(tenantId, clienteId, ...)` de la versión
 * Firestore aunque `mascota_id` ya alcanza: así los componentes no cambian.
 */

type Fila = Record<string, unknown>

export function aMascota(f: Fila): Mascota {
  const edadValor = f.edad_valor != null ? Number(f.edad_valor) : undefined
  const edadUnidad = (f.edad_unidad as Mascota["edadUnidad"]) ?? undefined
  const edadRegistradaEn = (f.edad_registrada_en as string) ?? undefined

  const edadCalculada =
    edadValor !== undefined && edadUnidad && edadRegistradaEn
      ? calcularEdadActual({ valor: edadValor, unidad: edadUnidad, registradaEn: edadRegistradaEn })
      : null

  return {
    id: f.id as string,
    clienteId: (f.cliente_id as string) ?? undefined,
    nombre: (f.nombre as string) ?? "",
    tipo: (f.tipo as string) ?? "",
    edad: edadCalculada ? formatearEdad(edadCalculada) : (f.edad as string) ?? undefined,
    edadValor,
    edadUnidad,
    edadRegistradaEn,
    raza: (f.raza as string) ?? undefined,
    peso: (f.peso as string) ?? undefined,
    tieneChip: (f.tiene_chip as boolean) ?? false,
    chipNumero: (f.chip_numero as string) ?? undefined,
    sexo: (f.sexo as Mascota["sexo"]) ?? undefined,
    color: (f.color as string) ?? undefined,
    libretaToken: (f.libreta_token as string) ?? undefined,
    fotoUrl: (f.foto_url as string) ?? undefined,
  }
}

/**
 * Crea la mascota (o reutiliza la existente con el mismo nombre+tipo) vía
 * RPC `security definer` (igual que `crear_turno` / `guardar_cliente_publico`):
 * así funciona también sin sesión, para el visitante anónimo que reserva un
 * turno o se autorregistra. La función también crea el registro de historia
 * clínica consolidada, en la misma transacción.
 */
export async function createMascota(
  tenantId: string,
  clienteId: string,
  data: Omit<Mascota, "id">,
) {
  const { data: creada, error } = await supabase.rpc("guardar_mascota_publico", {
    p_tenant: tenantId,
    p_cliente_id: clienteId,
    p_datos: {
      nombre: data.nombre,
      tipo: data.tipo,
      edad: data.edad ?? null,
      edadValor: data.edadValor ?? null,
      edadUnidad: data.edadUnidad ?? null,
      edadRegistradaEn: data.edadRegistradaEn ?? null,
      raza: data.raza ?? null,
      peso: data.peso ?? null,
      tieneChip: data.tieneChip ?? false,
      chipNumero: data.chipNumero ?? null,
      sexo: data.sexo ?? null,
      color: data.color ?? null,
    },
  })

  if (error) throw new Error(`No se pudo crear la mascota: ${error.message}`)
  return { id: creada.id as string }
}

export async function getMascotas(tenantId: string, clienteId: string): Promise<Mascota[]> {
  const { data, error } = await supabase
    .rpc("obtener_mascotas_publico", { p_tenant: tenantId, p_cliente_id: clienteId })
  throwIfSupabaseError(error, "Error al cargar mascotas")
  return (data ?? []).map(aMascota)
}

export const getMascotasByClienteId = getMascotas

/**
 * Mascotas de varios clientes en una sola query, agrupadas por `cliente_id`.
 * Reemplaza a llamar `getMascotas` (RPC, 1 round-trip por cliente) en un
 * loop: para una lista de N clientes evita el patrón N+1 al pedir solo el
 * resumen (nombre/tipo) para mostrar en un listado colapsado. Usa RLS
 * (`es_staff`) en vez de la RPC pública, así que solo sirve con sesión.
 *
 * Incluye también las mascotas donde el cliente es co-dueño (`mascota_duenos`,
 * ver 022): si no, un co-dueño buscado en el panel aparecía con "0 mascotas"
 * aunque comparta una con el dueño principal.
 */
export async function getMascotasBasicByClienteIds(
  tenantId: string,
  clienteIds: string[],
): Promise<Map<string, Mascota[]>> {
  const resultado = new Map<string, Mascota[]>()
  if (clienteIds.length === 0) return resultado

  const [{ data: propias, error: errorPropias }, { data: coDuenos, error: errorCoDuenos }] = await Promise.all([
    supabase.from("mascotas").select("*").eq("tenant_id", tenantId).in("cliente_id", clienteIds),
    supabase.from("mascota_duenos").select("cliente_id, mascota_id").eq("tenant_id", tenantId).in("cliente_id", clienteIds),
  ])
  throwIfSupabaseError(errorPropias, "Error al cargar mascotas del listado")
  throwIfSupabaseError(errorCoDuenos, "Error al cargar co-dueños del listado")

  const agregar = (clienteId: string, mascota: Mascota) => {
    const lista = resultado.get(clienteId) ?? []
    if (!lista.some((m) => m.id === mascota.id)) lista.push(mascota)
    resultado.set(clienteId, lista)
  }

  for (const fila of propias ?? []) {
    agregar((fila as Fila).cliente_id as string, aMascota(fila))
  }

  const idsCompartidas = [...new Set((coDuenos ?? []).map((f) => (f as Fila).mascota_id as string))]
  if (idsCompartidas.length > 0) {
    const { data: mascotasCompartidas, error: errorCompartidas } = await supabase
      .from("mascotas").select("*").eq("tenant_id", tenantId).in("id", idsCompartidas)
    throwIfSupabaseError(errorCompartidas, "Error al cargar mascotas compartidas del listado")
    const porId = new Map((mascotasCompartidas ?? []).map((f) => [(f as Fila).id as string, aMascota(f)]))
    for (const f of coDuenos ?? []) {
      const mascota = porId.get((f as Fila).mascota_id as string)
      if (mascota) agregar((f as Fila).cliente_id as string, mascota)
    }
  }

  return resultado
}

export async function updateMascota(
  tenantId: string,
  clienteId: string,
  mascotaId: string,
  data: Partial<Omit<Mascota, "id">>,
) {
  const datos: Record<string, unknown> = {}
  if (data.nombre !== undefined) datos.nombre = data.nombre
  if (data.tipo !== undefined) datos.tipo = data.tipo
  if (data.edad !== undefined) datos.edad = data.edad
  if (data.edadValor !== undefined) datos.edadValor = data.edadValor
  if (data.edadUnidad !== undefined) datos.edadUnidad = data.edadUnidad
  if (data.edadRegistradaEn !== undefined) datos.edadRegistradaEn = data.edadRegistradaEn
  if (data.raza !== undefined) datos.raza = data.raza
  if (data.peso !== undefined) datos.peso = data.peso
  if (data.tieneChip !== undefined) datos.tieneChip = data.tieneChip
  if (data.chipNumero !== undefined) datos.chipNumero = data.chipNumero
  if (data.sexo !== undefined) datos.sexo = data.sexo
  if (data.color !== undefined) datos.color = data.color
  if (data.libretaToken !== undefined) datos.libretaToken = data.libretaToken

  if (Object.keys(datos).length === 0) return { success: true, id: mascotaId }

  const { error } = await supabase.rpc("actualizar_mascota_publico", {
    p_tenant: tenantId,
    p_mascota_id: mascotaId,
    p_datos: datos,
  })
  if (error) {
    console.error("Error actualizando mascota:", error.message)
    throw error
  }
  return { success: true, id: mascotaId }
}

/** Una mascota puntual, sin sesión (para /mi-historia/[dni]/[mascotaSlug]). */
export async function getMascotaPublico(
  tenantId: string,
  mascotaId: string,
): Promise<Mascota | null> {
  const { data, error } = await supabase
    .rpc("obtener_mascota_publico", { p_tenant: tenantId, p_mascota_id: mascotaId })
  throwIfSupabaseError(error, "Error al cargar mascota")
  const fila = Array.isArray(data) ? data[0] : data
  return fila ? aMascota(fila) : null
}

/**
 * true si `clienteId` es el dueño principal o un co-dueño de la mascota.
 * Complementa la comparación directa contra `mascota.clienteId` en
 * /mi-historia, para que un segundo DNI (agregado como co-dueño) también
 * pueda entrar a la misma ficha.
 */
export async function esDuenoMascotaPublico(
  tenantId: string,
  mascotaId: string,
  clienteId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("es_dueno_mascota_publico", {
    p_tenant: tenantId,
    p_mascota_id: mascotaId,
    p_cliente_id: clienteId,
  })
  throwIfSupabaseError(error, "Error al verificar dueño de mascota")
  return data === true
}

export interface DuenoMascota {
  clienteId: string
  nombre: string
  dni: string
  esPrincipal: boolean
}

/** Dueño principal + co-dueños de una mascota, sin sesión. */
export async function getDuenosMascotaPublico(
  tenantId: string,
  mascotaId: string,
): Promise<DuenoMascota[]> {
  const { data, error } = await supabase.rpc("obtener_duenos_mascota_publico", {
    p_tenant: tenantId,
    p_mascota_id: mascotaId,
  })
  throwIfSupabaseError(error, "Error al cargar dueños de mascota")
  return (data ?? []).map((f: Fila) => ({
    clienteId: f.cliente_id as string,
    nombre: (f.nombre as string) ?? "",
    dni: (f.dni as string) ?? "",
    esPrincipal: f.es_principal as boolean,
  }))
}

/**
 * Agrega otro DNI como co-dueño de la mascota. `dniActual` tiene que ser el
 * de un dueño ya verificado; si `dniNuevo` no corresponde a ningún cliente
 * del tenant, se crea uno con datos mínimos.
 */
export async function agregarDuenoMascotaPublico(
  tenantId: string,
  mascotaId: string,
  dniActual: string,
  dniNuevo: string,
  nombreNuevo: string,
): Promise<void> {
  const { error } = await supabase.rpc("agregar_dueno_mascota_publico", {
    p_tenant: tenantId,
    p_mascota_id: mascotaId,
    p_dni_actual: dniActual,
    p_dni_nuevo: dniNuevo,
    p_nombre_nuevo: nombreNuevo,
  })
  if (error) {
    if (error.message.includes("YA_ES_DUENO")) throw new Error("Ese DNI ya es dueño de esta mascota.")
    if (error.message.includes("DNI_ACTUAL_INVALIDO") || error.message.includes("NO_AUTORIZADO")) {
      throw new Error("No pudimos verificar tu acceso a esta mascota.")
    }
    throw new Error(`No se pudo agregar el dueño: ${error.message}`)
  }
}
