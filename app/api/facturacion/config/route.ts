import { NextResponse } from "next/server"
import { autorizarDueno } from "@/lib/billing/dueno"
import { cifrar, descifrar, isFacturacionCryptoConfigured } from "@/lib/facturacion/crypto"
import { generarClaveYCsr, inspeccionarCertificado, normalizarPem } from "@/lib/facturacion/certificados"
import { getConfigFiscal, obtenerTicket } from "@/lib/facturacion/emitir"
import { dummy } from "@/lib/facturacion/wsfe"
import { cuitValido } from "@/lib/facturacion/comprobante"

/**
 * Configuración de factura electrónica (solo el dueño).
 *
 *  GET  ?tenantId=   → datos fiscales + estado del certificado (sin secretos;
 *                      el CSR sí se devuelve, es público por naturaleza).
 *  POST { tenantId, accion, ... }
 *     - "guardar"     : datos fiscales (cuit, razón social, condición IVA, punto
 *                       de venta, ambiente…).
 *     - "generar_csr" : crea clave privada (cifrada) + CSR para subir a ARCA.
 *                       Si ya hay certificado cargado, lo descarta (hay que
 *                       pedir uno nuevo con el CSR nuevo).
 *     - "cargar_cert" : { certPem } el .crt que devolvió ARCA.
 *     - "probar"      : pide ticket WSAA y llama FEDummy.
 *  DELETE { tenantId } → borra toda la configuración fiscal.
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId")
  const auth = await autorizarDueno(request, tenantId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  try {
    const { data, error } = await auth.admin
      .from("tenant_fiscal")
      .select(
        "cuit, razon_social, domicilio_fiscal, condicion_iva, inicio_actividades, ingresos_brutos, punto_venta, ambiente, csr_pem, cert_pem, cert_vence_at, key_pem_enc, ultima_prueba_at, ultima_prueba_ok, ultima_prueba_detalle",
      )
      .eq("tenant_id", tenantId as string)
      .maybeSingle()
    if (error) throw error

    return NextResponse.json({
      ok: true,
      cifradoConfigurado: isFacturacionCryptoConfigured(),
      config: data
        ? {
            cuit: data.cuit,
            razonSocial: data.razon_social,
            domicilioFiscal: data.domicilio_fiscal,
            condicionIva: data.condicion_iva,
            inicioActividades: data.inicio_actividades,
            ingresosBrutos: data.ingresos_brutos,
            puntoVenta: data.punto_venta,
            ambiente: data.ambiente,
            csrPem: data.csr_pem,
            tieneClave: Boolean(data.key_pem_enc),
            tieneCertificado: Boolean(data.cert_pem),
            certVenceAt: data.cert_vence_at,
            ultimaPrueba: data.ultima_prueba_at
              ? { at: data.ultima_prueba_at, ok: data.ultima_prueba_ok, detalle: data.ultima_prueba_detalle }
              : null,
          }
        : null,
    })
  } catch (error) {
    console.error("[facturacion/config GET]", error)
    return NextResponse.json({ ok: false, error: "No se pudo leer la configuración" }, { status: 500 })
  }
}

interface Payload {
  tenantId?: string
  accion?: "guardar" | "generar_csr" | "cargar_cert" | "probar"
  cuit?: string
  razonSocial?: string
  domicilioFiscal?: string
  condicionIva?: "RI" | "MONOTRIBUTO" | "EXENTO"
  inicioActividades?: string | null
  ingresosBrutos?: string
  puntoVenta?: number
  ambiente?: "homologacion" | "produccion"
  certPem?: string
}

export async function POST(request: Request) {
  let p: Payload
  try {
    p = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }
  const auth = await autorizarDueno(request, p.tenantId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const tenantId = p.tenantId as string
  const admin = auth.admin
  const ahora = new Date().toISOString()

  try {
    if (p.accion === "guardar") {
      const cuit = (p.cuit ?? "").replace(/\D/g, "")
      if (!cuitValido(cuit)) return NextResponse.json({ ok: false, error: "El CUIT no es válido" }, { status: 400 })
      if (!p.razonSocial?.trim()) return NextResponse.json({ ok: false, error: "Falta la razón social" }, { status: 400 })
      const puntoVenta = Number(p.puntoVenta ?? 1)
      if (!Number.isInteger(puntoVenta) || puntoVenta < 1 || puntoVenta > 99999) {
        return NextResponse.json({ ok: false, error: "Punto de venta inválido" }, { status: 400 })
      }
      const { error } = await admin.from("tenant_fiscal").upsert({
        tenant_id: tenantId,
        cuit,
        razon_social: p.razonSocial.trim(),
        domicilio_fiscal: p.domicilioFiscal?.trim() || null,
        condicion_iva: p.condicionIva ?? "MONOTRIBUTO",
        inicio_actividades: p.inicioActividades || null,
        ingresos_brutos: p.ingresosBrutos?.trim() || null,
        punto_venta: puntoVenta,
        ambiente: p.ambiente ?? "homologacion",
        // Cambiar de ambiente invalida el ticket: el de homologación no sirve en producción.
        ta_token: null,
        ta_sign: null,
        ta_expira_at: null,
        updated_at: ahora,
      })
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    const cfg = await getConfigFiscal(admin, tenantId)
    if (!cfg) return NextResponse.json({ ok: false, error: "Primero guardá los datos fiscales" }, { status: 409 })

    if (p.accion === "generar_csr") {
      if (!isFacturacionCryptoConfigured()) {
        return NextResponse.json({ ok: false, error: "FACTURACION_ENCRYPTION_KEY no está configurada en el servidor" }, { status: 503 })
      }
      const par = generarClaveYCsr({ cuit: cfg.cuit, razonSocial: cfg.razonSocial, alias: `vetpanel-${tenantId}` })
      const { error } = await admin
        .from("tenant_fiscal")
        .update({
          key_pem_enc: cifrar(par.privateKeyPem),
          csr_pem: par.csrPem,
          cert_pem: null,
          cert_vence_at: null,
          ta_token: null,
          ta_sign: null,
          ta_expira_at: null,
          updated_at: ahora,
        })
        .eq("tenant_id", tenantId)
      if (error) throw error
      return NextResponse.json({ ok: true, csrPem: par.csrPem })
    }

    if (p.accion === "cargar_cert") {
      if (!cfg.keyPemEnc) return NextResponse.json({ ok: false, error: "Primero generá el pedido de certificado (CSR)" }, { status: 409 })
      if (!p.certPem?.trim()) return NextResponse.json({ ok: false, error: "Pegá el certificado" }, { status: 400 })
      let info
      try {
        info = inspeccionarCertificado(p.certPem, descifrar(cfg.keyPemEnc))
      } catch {
        return NextResponse.json({ ok: false, error: "El certificado no se pudo leer. Pegá el contenido del archivo .crt completo." }, { status: 400 })
      }
      if (!info.coincideConClave) {
        return NextResponse.json(
          { ok: false, error: "Ese certificado no corresponde al CSR generado acá. Subí a ARCA el CSR actual y pegá el .crt que te devuelve." },
          { status: 400 },
        )
      }
      if (info.vence.getTime() < Date.now()) {
        return NextResponse.json({ ok: false, error: "El certificado ya está vencido" }, { status: 400 })
      }
      const { error } = await admin
        .from("tenant_fiscal")
        .update({
          cert_pem: normalizarPem(p.certPem),
          cert_vence_at: info.vence.toISOString(),
          ta_token: null,
          ta_sign: null,
          ta_expira_at: null,
          updated_at: ahora,
        })
        .eq("tenant_id", tenantId)
      if (error) throw error
      return NextResponse.json({ ok: true, vence: info.vence.toISOString(), subject: info.subject })
    }

    if (p.accion === "probar") {
      let detalle: string
      let ok = false
      try {
        await obtenerTicket(admin, cfg)
        const d = await dummy(cfg.ambiente)
        ok = d.app === "OK" && d.db === "OK" && d.auth === "OK"
        detalle = ok
          ? `Conexión OK con ARCA (${cfg.ambiente}). Ticket de acceso obtenido.`
          : `ARCA respondió: app ${d.app}, db ${d.db}, auth ${d.auth}`
      } catch (e) {
        detalle = e instanceof Error ? e.message : "Error desconocido"
      }
      await admin
        .from("tenant_fiscal")
        .update({ ultima_prueba_at: ahora, ultima_prueba_ok: ok, ultima_prueba_detalle: detalle, updated_at: ahora })
        .eq("tenant_id", tenantId)
      return NextResponse.json({ ok: true, prueba: { ok, detalle } })
    }

    return NextResponse.json({ ok: false, error: "Acción desconocida" }, { status: 400 })
  } catch (error) {
    console.error("[facturacion/config POST]", error)
    return NextResponse.json({ ok: false, error: "No se pudo guardar la configuración" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  let p: { tenantId?: string }
  try {
    p = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }
  const auth = await autorizarDueno(request, p.tenantId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { error } = await auth.admin.from("tenant_fiscal").delete().eq("tenant_id", p.tenantId as string)
  if (error) {
    console.error("[facturacion/config DELETE]", error)
    return NextResponse.json({ ok: false, error: "No se pudo borrar la configuración" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
