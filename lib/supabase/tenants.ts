import { supabase } from "./config"
import { planAllows, type Feature } from "../plans"
import type { Tenant, TenantConfig, TenantFull, TurnoConfig } from "./types"

/**
 * Tenants y su configuración.
 *
 * En Firestore esto vivía en 3 documentos (`veterinarias/{slug}`,
 * `config/datos`, `config/turno`). Acá son 2 tablas: `tenants` (que absorbe el
 * doc raíz + config/datos) y `turno_config`.
 */

type FilaTenant = Record<string, unknown>

/** Fila de `tenants` (snake_case) → TenantConfig (camelCase). */
function aConfig(fila: FilaTenant): TenantConfig {
  return {
    nombre: (fila.nombre as string) ?? undefined,
    plan: (fila.plan as TenantConfig["plan"]) ?? undefined,
    status: (fila.status as TenantConfig["status"]) ?? undefined,
    adminIds: (fila.admin_ids as string[]) ?? [],
    createdAt: (fila.created_at as string) ?? undefined,
    telefono: (fila.telefono as string) ?? undefined,
    email: (fila.email as string) ?? undefined,
    direccion: (fila.direccion as string) ?? undefined,
    ciudad: (fila.ciudad as string) ?? undefined,
    slogan: (fila.slogan as string) ?? undefined,
    descripcion: (fila.descripcion as string) ?? undefined,
    servicios: (fila.servicios as TenantConfig["servicios"]) ?? [],
    horarios: (fila.horarios as TenantConfig["horarios"]) ?? [],
    fotosHero: (fila.fotos_hero as string[]) ?? [],
    fotosHeroMobile: (fila.fotos_hero_mobile as string[]) ?? [],
    logo: (fila.logo as string) ?? undefined,
    modalidad: (fila.modalidad as TenantConfig["modalidad"]) ?? undefined,
    googleMapsUrl: (fila.google_maps_url as string) ?? undefined,
    minHorasAnticipacion: (fila.min_horas_anticipacion as number) ?? undefined,
    calendarId: (fila.calendar_id as string) ?? undefined,
    emailProvider: (fila.email_provider as TenantConfig["emailProvider"]) ?? "resend",
    onboardingCompletado: (fila.onboarding_completado as boolean) ?? false,
    trialExpiresAt: (fila.trial_expires_at as string) ?? undefined,
  }
}

/** TenantConfig (camelCase) → fila de `tenants` (snake_case). Ignora undefined. */
function aFila(data: Partial<TenantConfig>): Record<string, unknown> {
  const mapa: Record<keyof TenantConfig, string> = {
    nombre: "nombre",
    plan: "plan",
    status: "status",
    adminIds: "admin_ids",
    createdAt: "created_at",
    telefono: "telefono",
    email: "email",
    direccion: "direccion",
    ciudad: "ciudad",
    slogan: "slogan",
    descripcion: "descripcion",
    servicios: "servicios",
    horarios: "horarios",
    fotosHero: "fotos_hero",
    fotosHeroMobile: "fotos_hero_mobile",
    logo: "logo",
    modalidad: "modalidad",
    googleMapsUrl: "google_maps_url",
    minHorasAnticipacion: "min_horas_anticipacion",
    calendarId: "calendar_id",
    emailProvider: "email_provider",
    onboardingCompletado: "onboarding_completado",
    trialExpiresAt: "trial_expires_at",
  }
  const fila: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue
    const col = mapa[k as keyof TenantConfig]
    if (col) fila[col] = v
  }
  return fila
}

export async function getTenant(tenantId: string): Promise<Tenant | null> {
  const { data } = await supabase
    .from("tenants").select("slug").eq("slug", tenantId).maybeSingle()
  return data ? { slug: data.slug } : null
}

export async function getTenantConfig(tenantId: string): Promise<TenantConfig | null> {
  const { data, error } = await supabase
    .from("tenants").select("*").eq("slug", tenantId).maybeSingle()
  if (error) {
    console.error("Error al leer config del tenant:", error.message)
    return null
  }
  return data ? aConfig(data) : null
}

export async function updateTenantConfig(
  tenantId: string,
  data: Partial<TenantConfig>,
): Promise<void> {
  const fila = aFila(data)
  if (Object.keys(fila).length === 0) return
  const { error } = await supabase.from("tenants").update(fila).eq("slug", tenantId)
  if (error) throw new Error(`No se pudo actualizar el tenant: ${error.message}`)
}

/** Feature-gating: ¿el tenant puede usar la feature según su plan? */
export async function canUseFeature(tenantId: string, feature: Feature): Promise<boolean> {
  const config = await getTenantConfig(tenantId)
  return planAllows(config?.plan, feature)
}

// ── Turno config ──
export async function getTurnoConfig(tenantId: string): Promise<TurnoConfig | null> {
  const { data, error } = await supabase
    .from("turno_config")
    .select("mascotas, servicios, vacunas, profesionales")
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (error) {
    console.error("Error al leer turno_config:", error.message)
    return null
  }
  if (!data) return null

  return {
    mascotas: data.mascotas ?? [],
    servicios: data.servicios ?? [],
    vacunas: data.vacunas ?? {},
    profesionales: data.profesionales ?? [],
  }
}

export async function updateTurnoConfig(
  tenantId: string,
  data: Partial<TurnoConfig>,
): Promise<void> {
  const fila: Record<string, unknown> = { tenant_id: tenantId }
  if (data.mascotas !== undefined) fila.mascotas = data.mascotas
  if (data.servicios !== undefined) fila.servicios = data.servicios
  if (data.vacunas !== undefined) fila.vacunas = data.vacunas
  if (data.profesionales !== undefined) fila.profesionales = data.profesionales

  // upsert: replica el `setDoc(..., { merge: true })` de Firestore
  const { error } = await supabase
    .from("turno_config").upsert(fila, { onConflict: "tenant_id" })
  if (error) throw new Error(`No se pudo actualizar turno_config: ${error.message}`)
}

export async function getTenantFull(tenantId: string): Promise<TenantFull | null> {
  const { data, error } = await supabase
    .from("tenants").select("*").eq("slug", tenantId).maybeSingle()
  if (error || !data) return null
  return { slug: data.slug, ...aConfig(data) }
}

export async function getTenants(): Promise<Tenant[]> {
  const { data } = await supabase.from("tenants").select("slug")
  return (data ?? []).map((d) => ({ slug: d.slug }))
}

export async function getTenantsFull(): Promise<TenantFull[]> {
  const { data, error } = await supabase.from("tenants").select("*")
  if (error) {
    console.error("Error al listar tenants:", error.message)
    return []
  }
  // Una sola query: en Firestore esto era 1 + N lecturas.
  return (data ?? []).map((d) => ({ slug: d.slug, ...aConfig(d) }))
}

export async function updateTenant(
  tenantId: string,
  data: Partial<TenantConfig>,
): Promise<void> {
  await updateTenantConfig(tenantId, data)
}

/**
 * Da de alta una veterinaria y promueve al usuario actual a `veterinario` de
 * ese tenant, todo en una transacción (función `crear_veterinaria`).
 *
 * No se puede hacer con un INSERT directo: las policies exigen ser staff del
 * tenant, y nadie puede serlo de un slug que todavía no existe. Además, hacer
 * el alta y la promoción por separado dejaría una veterinaria huérfana si lo
 * segundo falla.
 *
 * Lanza Error("SLUG_TAKEN") si el slug ya está ocupado.
 */
export async function createTenant(
  tenantId: string,
  data: Partial<TenantConfig>,
): Promise<void> {
  const { error } = await supabase.rpc("crear_veterinaria", {
    p_slug: tenantId,
    p_datos: {
      nombre: data.nombre ?? "",
      plan: data.plan ?? "basico",
      telefono: data.telefono ?? null,
      email: data.email ?? null,
      direccion: data.direccion ?? null,
      ciudad: data.ciudad ?? null,
      admin_ids: data.adminIds ?? [],
    },
  })

  if (error) {
    if (error.message.includes("SLUG_TAKEN")) throw new Error("SLUG_TAKEN")
    if (error.message.includes("NO_AUTENTICADO")) throw new Error("NO_AUTENTICADO")
    throw new Error(`No se pudo crear el tenant: ${error.message}`)
  }

  // El resto de la config (servicios, horarios, fotos…) se guarda aparte:
  // ya somos staff del tenant, así que las policies lo permiten.
  const resto = aFila(data)
  for (const k of ["nombre", "plan", "telefono", "email", "direccion", "ciudad", "admin_ids"]) {
    delete resto[k]
  }
  if (Object.keys(resto).length > 0) {
    await supabase.from("tenants").update(resto).eq("slug", tenantId)
  }
}
