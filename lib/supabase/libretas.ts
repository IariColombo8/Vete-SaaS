import { supabase } from "./config"
import { getMascotas, updateMascota } from "./mascotas"
import { getHistorias } from "./historias"
import type { LibretaPublica } from "./types"

/** Libreta pública por QR. Mismas firmas que la versión Firestore. */

/**
 * Genera (o regenera) la libreta pública de una mascota: token aleatorio +
 * snapshot curado del historial. Solo expone un resumen, sin datos del dueño.
 * La ejecuta el staff del tenant (autenticado).
 */
export async function generarLibretaPublica(
  tenantId: string,
  clienteId: string,
  mascotaId: string,
  vetNombre?: string,
): Promise<string> {
  const mascotas = await getMascotas(tenantId, clienteId)
  const mascota = mascotas.find((m) => m.id === mascotaId)
  if (!mascota) throw new Error("Mascota no encontrada")

  const token =
    mascota.libretaToken ||
    (
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`
    ).replace(/-/g, "")

  const historias = await getHistorias(tenantId, clienteId, mascotaId)
  const historiasResumen = historias
    .filter((h) => h.tipoVisita !== "turno_programado")
    .slice(0, 30)
    .map((h) => ({
      fecha: h.fechaAtencion ?? "",
      motivo: h.motivo ?? "Consulta",
      diagnostico: h.diagnostico,
      tratamiento: h.tratamiento,
    }))

  const snapshot: LibretaPublica = {
    token,
    mascota: {
      nombre: mascota.nombre,
      tipo: mascota.tipo,
      raza: mascota.raza,
      edad: mascota.edad,
    },
    vetNombre,
    historias: historiasResumen,
    generadoEl: new Date().toISOString(),
  }

  const { error } = await supabase.from("libretas_publicas").upsert(
    {
      token,
      tenant_id: tenantId,
      mascota_id: mascotaId,
      mascota: snapshot.mascota,
      vet_nombre: vetNombre ?? null,
      historias: historiasResumen,
      generado_el: snapshot.generadoEl,
    },
    { onConflict: "token" },
  )
  if (error) throw new Error(`No se pudo generar la libreta: ${error.message}`)

  if (!mascota.libretaToken) {
    await updateMascota(tenantId, clienteId, mascotaId, { libretaToken: token })
  }
  return token
}

/** Lee el snapshot público de una libreta por token. */
export async function getLibretaPublica(
  tenantId: string,
  token: string,
): Promise<LibretaPublica | null> {
  const { data } = await supabase
    .from("libretas_publicas").select("*")
    .eq("tenant_id", tenantId).eq("token", token)
    .maybeSingle()

  if (!data) return null
  return {
    token: data.token,
    mascota: data.mascota ?? { nombre: "", tipo: "" },
    vetNombre: data.vet_nombre ?? undefined,
    historias: data.historias ?? [],
    generadoEl: data.generado_el ?? "",
  }
}
