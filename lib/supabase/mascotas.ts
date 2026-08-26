import { supabase } from "./config"
import { mascotaDocId } from "./ids"
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
    nombre: (f.nombre as string) ?? "",
    tipo: (f.tipo as string) ?? "",
    edad: edadCalculada ? formatearEdad(edadCalculada) : (f.edad as string) ?? undefined,
    edadValor,
    edadUnidad,
    edadRegistradaEn,
    raza: (f.raza as string) ?? undefined,
    peso: (f.peso as string) ?? undefined,
    libretaToken: (f.libreta_token as string) ?? undefined,
  }
}

export async function createMascota(
  tenantId: string,
  clienteId: string,
  data: Omit<Mascota, "id">,
) {
  const slug = mascotaDocId(data.nombre, data.tipo)

  const { data: creada, error } = await supabase
    .from("mascotas")
    .insert({
      tenant_id: tenantId,
      cliente_id: clienteId,
      nombre: data.nombre,
      tipo: data.tipo,
      edad: data.edad ?? null,
      edad_valor: data.edadValor ?? null,
      edad_unidad: data.edadUnidad ?? null,
      edad_registrada_en: data.edadRegistradaEn ?? null,
      raza: data.raza ?? null,
      peso: data.peso ?? null,
      libreta_token: data.libretaToken ?? null,
      slug,
    })
    .select("id")
    .single()

  if (error) {
    // unique (cliente_id, slug): ya existe esa mascota para ese cliente.
    // En Firestore el setDoc la pisaba en silencio; acá la reutilizamos.
    if (error.code === "23505") {
      const { data: existente } = await supabase
        .from("mascotas").select("id")
        .eq("cliente_id", clienteId).eq("slug", slug)
        .maybeSingle()
      if (existente) return { id: existente.id as string }
    }
    throw new Error(`No se pudo crear la mascota: ${error.message}`)
  }

  const id = creada.id as string
  await crearRegistroHistoriaClinica(tenantId, id)
  return { id }
}

export async function getMascotas(tenantId: string, clienteId: string): Promise<Mascota[]> {
  const { data } = await supabase
    .from("mascotas").select("*")
    .eq("tenant_id", tenantId).eq("cliente_id", clienteId)
    .order("nombre")
  return (data ?? []).map(aMascota)
}

export const getMascotasByClienteId = getMascotas

export async function updateMascota(
  tenantId: string,
  clienteId: string,
  mascotaId: string,
  data: Partial<Omit<Mascota, "id">>,
) {
  const fila: Record<string, unknown> = {}
  if (data.nombre !== undefined) fila.nombre = data.nombre
  if (data.tipo !== undefined) fila.tipo = data.tipo
  if (data.edad !== undefined) fila.edad = data.edad
  if (data.edadValor !== undefined) fila.edad_valor = data.edadValor
  if (data.edadUnidad !== undefined) fila.edad_unidad = data.edadUnidad
  if (data.edadRegistradaEn !== undefined) fila.edad_registrada_en = data.edadRegistradaEn
  if (data.raza !== undefined) fila.raza = data.raza
  if (data.peso !== undefined) fila.peso = data.peso
  if (data.libretaToken !== undefined) fila.libreta_token = data.libretaToken
  // El slug sigue al nombre/tipo para no desincronizarse
  if (data.nombre !== undefined || data.tipo !== undefined) {
    const { data: actual } = await supabase
      .from("mascotas").select("nombre, tipo").eq("id", mascotaId).maybeSingle()
    if (actual) {
      fila.slug = mascotaDocId(
        (data.nombre ?? actual.nombre) as string,
        (data.tipo ?? actual.tipo) as string,
      )
    }
  }

  if (Object.keys(fila).length === 0) return { success: true, id: mascotaId }

  const { error } = await supabase.from("mascotas").update(fila).eq("id", mascotaId)
  if (error) {
    console.error("Error actualizando mascota:", error.message)
    throw error
  }
  return { success: true, id: mascotaId }
}

/** Crea la fila de resumen consolidado al dar de alta una mascota. */
async function crearRegistroHistoriaClinica(tenantId: string, mascotaId: string) {
  await supabase.from("historia_clinica").upsert(
    {
      mascota_id: mascotaId,
      tenant_id: tenantId,
      consultas: [], vacunas: [], tratamientos: [], alergias: [], cirugias: [],
    },
    { onConflict: "mascota_id" },
  )
}
