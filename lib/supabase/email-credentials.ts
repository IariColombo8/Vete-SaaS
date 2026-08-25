import "server-only"
import { getAdminDb } from "./admin"

/**
 * Acceso a `tenant_email_credentials` — SIEMPRE con service_role (`getAdminDb`).
 *
 * La tabla no tiene policies de select/insert/update para anon/authenticated
 * (ver supabase/007_email_gmail.sql), así que el cliente publicable jamás
 * puede leerla. No exportar nada de acá hacia código de cliente.
 */

export interface GmailTenantCredentials {
  clientId: string
  clientSecret: string
  refreshToken: string | null
  senderEmail: string | null
}

export async function getGmailCredentials(
  tenantId: string,
): Promise<GmailTenantCredentials | null> {
  const admin = getAdminDb()
  if (!admin) return null

  const { data, error } = await admin
    .from("tenant_email_credentials")
    .select("gmail_client_id, gmail_client_secret, gmail_refresh_token, gmail_sender_email")
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (error) {
    console.error("[email-credentials] Error al leer credenciales de Gmail:", error.message)
    return null
  }
  if (!data?.gmail_client_id || !data?.gmail_client_secret) return null

  return {
    clientId: data.gmail_client_id,
    clientSecret: data.gmail_client_secret,
    refreshToken: data.gmail_refresh_token,
    senderEmail: data.gmail_sender_email,
  }
}

export async function upsertGmailClientCredentials(
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<void> {
  const admin = getAdminDb()
  if (!admin) throw new Error("Supabase Admin no configurado en el servidor")

  const { error } = await admin.from("tenant_email_credentials").upsert(
    {
      tenant_id: tenantId,
      gmail_client_id: clientId,
      gmail_client_secret: clientSecret,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  )
  if (error) throw new Error(`No se pudo guardar el client_id/secret: ${error.message}`)
}

export interface EmailJsTenantCredentials {
  serviceId: string
  templateId: string
  publicKey: string
  privateKey: string
}

export async function getEmailJsCredentials(
  tenantId: string,
): Promise<EmailJsTenantCredentials | null> {
  const admin = getAdminDb()
  if (!admin) return null

  const { data, error } = await admin
    .from("tenant_email_credentials")
    .select("emailjs_service_id, emailjs_template_id, emailjs_public_key, emailjs_private_key")
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (error) {
    console.error("[email-credentials] Error al leer credenciales de EmailJS:", error.message)
    return null
  }
  if (!data?.emailjs_service_id || !data?.emailjs_template_id || !data?.emailjs_public_key || !data?.emailjs_private_key) {
    return null
  }

  return {
    serviceId: data.emailjs_service_id,
    templateId: data.emailjs_template_id,
    publicKey: data.emailjs_public_key,
    privateKey: data.emailjs_private_key,
  }
}

export async function upsertEmailJsCredentials(
  tenantId: string,
  credenciales: EmailJsTenantCredentials,
): Promise<void> {
  const admin = getAdminDb()
  if (!admin) throw new Error("Supabase Admin no configurado en el servidor")

  const { error } = await admin.from("tenant_email_credentials").upsert(
    {
      tenant_id: tenantId,
      emailjs_service_id: credenciales.serviceId,
      emailjs_template_id: credenciales.templateId,
      emailjs_public_key: credenciales.publicKey,
      emailjs_private_key: credenciales.privateKey,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  )
  if (error) throw new Error(`No se pudo guardar las credenciales de EmailJS: ${error.message}`)
}

export async function saveGmailTokens(
  tenantId: string,
  refreshToken: string,
  senderEmail: string,
): Promise<void> {
  const admin = getAdminDb()
  if (!admin) throw new Error("Supabase Admin no configurado en el servidor")

  const { error } = await admin
    .from("tenant_email_credentials")
    .update({
      gmail_refresh_token: refreshToken,
      gmail_sender_email: senderEmail,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
  if (error) throw new Error(`No se pudo guardar el refresh_token: ${error.message}`)
}
