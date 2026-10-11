import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getAdminDb } from "@/lib/supabase/admin"
import { getPreapproval, isMercadoPagoConfigured } from "@/lib/billing/mercadopago"
import { aplicarEstadoPreapproval } from "@/lib/billing/aplicar-estado"
import { emailTrialPorVencer, emailTrialVencido, enviarEmailBilling, isResendConfigured } from "@/lib/billing/emails-trial"
import { getTrialStatus } from "@/lib/plans"

/**
 * Cron diario de billing (service_role).
 *
 *  1. Conciliación: para cada tenant con suscripción registrada (vigente o
 *     checkout pendiente), consulta el estado real en Mercado Pago y lo
 *     aplica. Es la red de seguridad del webhook: si una notificación se
 *     perdió, a más tardar al día siguiente el plan refleja lo que MP está
 *     cobrando (o dejó de cobrar).
 *  2. Avisos de trial al dueño: uno cuando faltan `TRIAL_AVISO_DIAS` días
 *     (default 3) y otro el día que vence. Cada aviso se marca en `tenants`
 *     para no repetirlo. Solo para tenants sin suscripción activa: los que
 *     ya pagan no están "en prueba" aunque `trial_expires_at` tenga valor.
 *
 * Seguridad: header `Authorization: Bearer <CRON_SECRET>` (lo envía Vercel Cron).
 */

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get("authorization") === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 })
  }
  const admin = getAdminDb()
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Supabase Admin no configurado" }, { status: 503 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.vetpanel.com.ar"
  const diasAviso = Number(process.env.TRIAL_AVISO_DIAS ?? 3)
  const resumen = { conciliados: 0, cambiados: 0, avisosPorVencer: 0, avisosVencido: 0, errores: [] as string[] }

  // ── 1. Conciliación de suscripciones ─────────────────────────────────────
  if (isMercadoPagoConfigured()) {
    const { data: tenants, error } = await admin
      .from("tenants")
      .select("slug, mp_preapproval_id, mp_preapproval_pendiente")
      .or("mp_preapproval_id.not.is.null,mp_preapproval_pendiente.not.is.null")
    if (error) resumen.errores.push(`tenants: ${error.message}`)

    for (const t of tenants ?? []) {
      const ids = [t.mp_preapproval_pendiente, t.mp_preapproval_id].filter(
        (v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i,
      )
      for (const id of ids) {
        try {
          const info = await getPreapproval(id)
          if (!info) continue
          const r = await aplicarEstadoPreapproval(admin, info, "cron")
          resumen.conciliados++
          if (r?.aplicado) resumen.cambiados++
        } catch (e) {
          resumen.errores.push(`${t.slug}/${id}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
  }

  // ── 2. Avisos de trial ───────────────────────────────────────────────────
  if (isResendConfigured()) {
    const { data: enTrial, error } = await admin
      .from("tenants")
      .select("slug, nombre, email, trial_expires_at, trial_aviso_vence_at, trial_aviso_vencido_at, mp_preapproval_status")
      .not("trial_expires_at", "is", null)
    if (error) resumen.errores.push(`trials: ${error.message}`)

    for (const t of enTrial ?? []) {
      if (t.mp_preapproval_status === "authorized") continue
      const estado = getTrialStatus({ trialExpiresAt: t.trial_expires_at as string })
      const urlPlan = `${appUrl}/${t.slug}/admin/Configuracion?tab=plan`
      const nombre = (t.nombre as string) || (t.slug as string)

      try {
        const destinatario = await emailDelDueno(admin, t.slug as string, t.email as string | null)
        if (!destinatario) continue

        if (estado.vencido && !t.trial_aviso_vencido_at) {
          const mail = emailTrialVencido({ nombreVeterinaria: nombre, urlPlan })
          if (await enviarEmailBilling({ to: destinatario, ...mail })) {
            await admin.from("tenants").update({ trial_aviso_vencido_at: new Date().toISOString() }).eq("slug", t.slug)
            resumen.avisosVencido++
          }
        } else if (
          !estado.vencido &&
          estado.diasRestantes !== null &&
          estado.diasRestantes <= diasAviso &&
          !t.trial_aviso_vence_at
        ) {
          const mail = emailTrialPorVencer({ nombreVeterinaria: nombre, diasRestantes: estado.diasRestantes, urlPlan })
          if (await enviarEmailBilling({ to: destinatario, ...mail })) {
            await admin.from("tenants").update({ trial_aviso_vence_at: new Date().toISOString() }).eq("slug", t.slug)
            resumen.avisosPorVencer++
          }
        }
      } catch (e) {
        resumen.errores.push(`${t.slug}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  return NextResponse.json({ ok: resumen.errores.length === 0, ...resumen })
}

/** Email del veterinario dueño; si no tiene, el de contacto de la veterinaria. */
async function emailDelDueno(admin: SupabaseClient, slug: string, emailContacto: string | null): Promise<string | null> {
  const { data } = await admin
    .from("usuarios")
    .select("email")
    .eq("tenant_id", slug)
    .eq("role", "veterinario")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data?.email as string | null) || emailContacto || null
}
