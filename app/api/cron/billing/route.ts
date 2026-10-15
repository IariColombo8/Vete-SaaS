import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getAdminDb } from "@/lib/supabase/admin"
import { getPreapproval, isMercadoPagoConfigured } from "@/lib/billing/mercadopago"
import { aplicarEstadoPreapproval } from "@/lib/billing/aplicar-estado"
import { emailTrialPorVencer, emailTrialVencido, enviarEmailBilling, isResendConfigured } from "@/lib/billing/emails-trial"
import { getPlan, getTrialStatus } from "@/lib/plans"
import { cargarPlanesServidor } from "@/lib/planes-servidor"
import { DIA_AVISO, diaDelMes, estadoCobroManual, ultimoPago, type PagoManual } from "@/lib/billing/cobro-manual"
import { emailPagoManualPorVencer, emailResumenImpagos } from "@/lib/billing/emails-pago-manual"

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
 *  3. Aviso de pago a las que pagan en efectivo (`cobro_manual`, 058): desde
 *     el día 7, si el mes no figura pago, un email a la veterinaria y un
 *     resumen al superadmin (`BILLING_AVISOS_EMAIL`, o todos los superadmin).
 *     Una vez por mes por veterinaria: queda en `billing_eventos` como
 *     `aviso_pago_manual` con el período.
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
  // Los emails listan los planes y montos con su precio vigente.
  await cargarPlanesServidor({ fresco: true })
  const admin = getAdminDb()
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Supabase Admin no configurado" }, { status: 503 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.vetpanel.com.ar"
  const diasAviso = Number(process.env.TRIAL_AVISO_DIAS ?? 3)
  const resumen = {
    conciliados: 0, cambiados: 0, avisosPorVencer: 0, avisosVencido: 0, avisosPagoManual: 0, errores: [] as string[],
  }

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
      .select("slug, nombre, email, trial_expires_at, trial_aviso_vence_at, trial_aviso_vencido_at, mp_preapproval_status, cobro_manual")
      .not("trial_expires_at", "is", null)
    if (error) resumen.errores.push(`trials: ${error.message}`)

    for (const t of enTrial ?? []) {
      // Las que pagan en efectivo no están en prueba: tienen su propio aviso (paso 3).
      if (t.mp_preapproval_status === "authorized" || t.cobro_manual) continue
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

  // ── 3. Aviso de pago a las que pagan en efectivo ─────────────────────────
  const ahora = new Date()
  if (isResendConfigured() && diaDelMes(ahora) >= DIA_AVISO) {
    try {
      resumen.avisosPagoManual = await avisarPagosManuales(admin, ahora, appUrl)
    } catch (e) {
      resumen.errores.push(`pagos manuales: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ ok: resumen.errores.length === 0, ...resumen })
}

async function avisarPagosManuales(admin: SupabaseClient, ahora: Date, appUrl: string): Promise<number> {
  const { data: tenants, error } = await admin
    .from("tenants")
    .select("slug, nombre, email, plan")
    .eq("cobro_manual", true)
    .neq("status", "pausado")
  if (error) throw error
  if (!tenants?.length) return 0

  const slugs = tenants.map((t) => t.slug as string)
  const [pagos, avisos] = await Promise.all([
    admin.from("pagos_manuales").select("*").in("tenant_id", slugs).is("anulado_at", null),
    admin.from("billing_eventos").select("tenant_id, detalle").eq("tipo", "aviso_pago_manual").in("tenant_id", slugs),
  ])
  if (pagos.error) throw pagos.error
  if (avisos.error) throw avisos.error

  const avisados = new Set(
    (avisos.data ?? []).map((a) => `${a.tenant_id}:${(a.detalle as { periodo?: string } | null)?.periodo}`),
  )
  const impagos: { nombre: string; monto: number }[] = []

  for (const t of tenants) {
    const slug = t.slug as string
    const propios: PagoManual[] = (pagos.data ?? [])
      .filter((p) => p.tenant_id === slug)
      .map((p) => ({
        id: p.id, tenantId: slug, periodo: p.periodo, monto: Number(p.monto), medio: p.medio,
        pagadoEl: p.pagado_el, nota: p.nota, createdAt: p.created_at, anuladoAt: null, motivoAnulacion: null,
      }))
    const estado = estadoCobroManual(propios, ahora)
    if (!estado.avisar || avisados.has(`${slug}:${estado.periodo}`)) continue

    const nombre = (t.nombre as string) || slug
    const monto = ultimoPago(propios)?.monto ?? getPlan(t.plan as string).precioMensual
    const destinatario = await emailDelDueno(admin, slug, t.email as string | null)
    const enviado = destinatario
      ? await enviarEmailBilling({
          to: destinatario,
          ...emailPagoManualPorVencer({
            nombreVeterinaria: nombre, periodo: estado.periodo, monto,
            atrasado: estado.fase === "atrasado", urlPlan: `${appUrl}/${slug}/admin/Configuracion?tab=plan`,
          }),
        })
      : false
    // Se registra aunque el email no haya salido (sin destinatario): el cartel
    // del panel y el resumen al superadmin igual avisan, y así no se reintenta
    // todos los días.
    await admin.from("billing_eventos").insert({
      tenant_id: slug,
      origen: "cron",
      tipo: "aviso_pago_manual",
      detalle: { periodo: estado.periodo, monto, email: destinatario, enviado },
    })
    impagos.push({ nombre, monto })
  }

  if (impagos.length > 0) {
    const mail = emailResumenImpagos({ periodo: estadoCobroManual([], ahora).periodo, impagos, urlPagos: `${appUrl}/superadmin` })
    for (const to of await emailsSuperadmin(admin)) await enviarEmailBilling({ to, ...mail })
  }
  return impagos.length
}

/** `BILLING_AVISOS_EMAIL` (separados por coma) o, si no está, todos los superadmin. */
async function emailsSuperadmin(admin: SupabaseClient): Promise<string[]> {
  const configurados = (process.env.BILLING_AVISOS_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
  if (configurados.length > 0) return configurados
  const { data } = await admin.from("usuarios").select("email").eq("role", "superadmin")
  return (data ?? []).map((u) => u.email as string | null).filter((e): e is string => Boolean(e))
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
