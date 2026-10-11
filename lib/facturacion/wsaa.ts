import "server-only"
import forge from "node-forge"
import { XMLParser } from "fast-xml-parser"

/**
 * WSAA: el servicio de autenticación de ARCA. Se le manda un "ticket de
 * requerimiento de acceso" (TRA) firmado con el certificado de la veterinaria
 * (CMS/PKCS#7) y devuelve un token + sign que valen 12 horas para el servicio
 * pedido (`wsfe`).
 *
 * ARCA rechaza pedir un ticket nuevo mientras el anterior sigue vigente
 * ("ya posee un TA valido"): por eso `emitir.ts` lo cachea en `tenant_fiscal`.
 */

export type Ambiente = "homologacion" | "produccion"

const URL_WSAA: Record<Ambiente, string> = {
  homologacion: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
  produccion: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
}

export interface TicketAcceso {
  token: string
  sign: string
  /** ISO. */
  expira: string
}

export class WsaaError extends Error {}

/** Fecha ISO con offset -03:00 (Argentina no tiene horario de verano). */
function isoArgentina(d: Date): string {
  const ar = new Date(d.getTime() - 3 * 60 * 60 * 1000)
  return `${ar.toISOString().slice(0, 19)}-03:00`
}

function armarTra(servicio: string, ahora = new Date()): string {
  const gen = new Date(ahora.getTime() - 10 * 60 * 1000)
  const exp = new Date(ahora.getTime() + 10 * 60 * 1000)
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<loginTicketRequest version="1.0">` +
    `<header>` +
    `<uniqueId>${Math.floor(ahora.getTime() / 1000)}</uniqueId>` +
    `<generationTime>${isoArgentina(gen)}</generationTime>` +
    `<expirationTime>${isoArgentina(exp)}</expirationTime>` +
    `</header>` +
    `<service>${servicio}</service>` +
    `</loginTicketRequest>`
  )
}

/** Firma CMS (PKCS#7 SignedData, DER, base64) como exige WSAA. */
export function firmarCms(tra: string, certPem: string, privateKeyPem: string): string {
  const cert = forge.pki.certificateFromPem(certPem)
  const key = forge.pki.privateKeyFromPem(privateKeyPem)

  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(tra, "utf8")
  p7.addCertificate(cert)
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
    ],
  })
  p7.sign({ detached: false })

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes()
  return forge.util.encode64(der)
}

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true })

/** Pide un ticket de acceso nuevo para `servicio` (normalmente "wsfe"). */
export async function pedirTicketAcceso(params: {
  ambiente: Ambiente
  certPem: string
  privateKeyPem: string
  servicio?: string
}): Promise<TicketAcceso> {
  const servicio = params.servicio ?? "wsfe"
  const cms = firmarCms(armarTra(servicio), params.certPem, params.privateKeyPem)

  const envelope =
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">` +
    `<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms>` +
    `</soapenv:Body></soapenv:Envelope>`

  const res = await fetch(URL_WSAA[params.ambiente], {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
    body: envelope,
  })
  const xml = await res.text()
  const doc = parser.parse(xml) as Record<string, unknown>
  const body = buscar(doc, "Body") as Record<string, unknown> | undefined

  const fault = body ? (buscar(body, "Fault") as Record<string, unknown> | undefined) : undefined
  if (fault || !res.ok) {
    const msg = String(fault?.faultstring ?? `HTTP ${res.status}`)
    if (/alreadyAuthenticated|ya posee un TA/i.test(msg)) {
      throw new WsaaError("ARCA dice que ya hay un ticket de acceso vigente. Esperá unos minutos y volvé a probar.")
    }
    if (/certificado|certificate|cms/i.test(msg)) {
      throw new WsaaError(`ARCA rechazó el certificado: ${msg}`)
    }
    throw new WsaaError(`WSAA: ${msg}`)
  }

  const loginReturn = buscar(doc, "loginCmsReturn")
  if (typeof loginReturn !== "string") throw new WsaaError("WSAA: respuesta sin loginCmsReturn")

  const ta = parser.parse(loginReturn) as {
    loginTicketResponse?: {
      header?: { expirationTime?: string }
      credentials?: { token?: string; sign?: string }
    }
  }
  const token = ta.loginTicketResponse?.credentials?.token
  const sign = ta.loginTicketResponse?.credentials?.sign
  const expira = ta.loginTicketResponse?.header?.expirationTime
  if (!token || !sign || !expira) throw new WsaaError("WSAA: ticket incompleto")

  return { token, sign, expira: new Date(expira).toISOString() }
}

/** Busca la primera clave `nombre` en cualquier nivel del árbol parseado. */
export function buscar(obj: unknown, nombre: string): unknown {
  if (!obj || typeof obj !== "object") return undefined
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === nombre) return v
    const hallado = buscar(v, nombre)
    if (hallado !== undefined) return hallado
  }
  return undefined
}
