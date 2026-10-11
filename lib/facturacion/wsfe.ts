import "server-only"
import { XMLParser } from "fast-xml-parser"
import { buscar, type Ambiente, type TicketAcceso } from "./wsaa"
import type { AlicuotaResumen } from "./comprobante"

/**
 * WSFEv1: facturación electrónica de ARCA (SOAP sobre HTTPS). Se arma el XML a
 * mano porque son tres operaciones y el esquema es estable; una librería SOAP
 * entera sería más código que esto.
 *
 * El orden de los elementos de `FECAEDetRequest` es el del XSD: el servicio
 * es un ASMX y puede rechazar elementos fuera de orden.
 */

const URL_WSFE: Record<Ambiente, string> = {
  homologacion: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  produccion: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
}

const NS = "http://ar.gov.afip.dif.FEV1/"

export interface ErrorArca {
  code: number
  msg: string
}

export class WsfeError extends Error {
  constructor(
    message: string,
    public errores: ErrorArca[] = [],
  ) {
    super(message)
  }
}

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false })

function esc(v: string | number): string {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

async function llamar(
  ambiente: Ambiente,
  operacion: string,
  cuerpo: string,
): Promise<Record<string, unknown>> {
  const envelope =
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${NS}">` +
    `<soapenv:Header/><soapenv:Body><ar:${operacion}>${cuerpo}</ar:${operacion}></soapenv:Body></soapenv:Envelope>`

  const res = await fetch(URL_WSFE[ambiente], {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `${NS}${operacion}` },
    body: envelope,
  })
  const xml = await res.text()
  const doc = parser.parse(xml) as Record<string, unknown>

  const fault = buscar(doc, "Fault") as Record<string, unknown> | undefined
  if (fault) throw new WsfeError(`WSFE ${operacion}: ${String(fault.faultstring ?? "SOAP Fault")}`)
  if (!res.ok) throw new WsfeError(`WSFE ${operacion}: HTTP ${res.status}`)

  const result = buscar(doc, `${operacion}Result`) as Record<string, unknown> | undefined
  if (!result) throw new WsfeError(`WSFE ${operacion}: respuesta sin resultado`)
  return result
}

function authXml(ta: TicketAcceso, cuit: string): string {
  return `<ar:Auth><ar:Token>${esc(ta.token)}</ar:Token><ar:Sign>${esc(ta.sign)}</ar:Sign><ar:Cuit>${esc(cuit)}</ar:Cuit></ar:Auth>`
}

/** `Errors.Err` puede venir como objeto o como array. */
function erroresDe(result: Record<string, unknown>): ErrorArca[] {
  const errs = (result.Errors as { Err?: unknown } | undefined)?.Err
  if (!errs) return []
  const lista = Array.isArray(errs) ? errs : [errs]
  return lista.map((e) => {
    const x = e as { Code?: string; Msg?: string }
    return { code: Number(x.Code ?? 0), msg: String(x.Msg ?? "") }
  })
}

/** FEDummy: ¿están vivos el servidor de aplicación, la base y la autenticación? */
export async function dummy(ambiente: Ambiente): Promise<{ app: string; db: string; auth: string }> {
  const r = await llamar(ambiente, "FEDummy", "")
  return { app: String(r.AppServer ?? ""), db: String(r.DbServer ?? ""), auth: String(r.AuthServer ?? "") }
}

/** Último número autorizado para (punto de venta, tipo). El próximo es +1. */
export async function ultimoAutorizado(params: {
  ambiente: Ambiente
  ta: TicketAcceso
  cuit: string
  puntoVenta: number
  tipoCbte: number
}): Promise<number> {
  const r = await llamar(
    params.ambiente,
    "FECompUltimoAutorizado",
    authXml(params.ta, params.cuit) +
      `<ar:PtoVta>${params.puntoVenta}</ar:PtoVta><ar:CbteTipo>${params.tipoCbte}</ar:CbteTipo>`,
  )
  const errores = erroresDe(r)
  if (errores.length) throw new WsfeError(errores.map((e) => `${e.code}: ${e.msg}`).join(" · "), errores)
  return Number(r.CbteNro ?? 0)
}

export interface SolicitudCae {
  ambiente: Ambiente
  ta: TicketAcceso
  cuit: string
  puntoVenta: number
  tipoCbte: number
  numero: number
  /** YYYYMMDD. */
  fecha: string
  concepto: 1 | 2 | 3
  docTipo: number
  docNro: string
  condicionIvaReceptorId: number
  impTotal: number
  impNeto: number
  impIva: number
  impOpEx: number
  impTotConc: number
  impTrib: number
  /** Vacío para Factura C. */
  alicuotas: AlicuotaResumen[]
  /** Comprobante que se anula (notas de crédito). */
  asociado?: { tipo: number; puntoVenta: number; numero: number; cuit: string; fecha: string }
}

export interface ResultadoCae {
  resultado: "A" | "R" | "P"
  cae: string | null
  /** YYYYMMDD. */
  caeVto: string | null
  observaciones: ErrorArca[]
  errores: ErrorArca[]
  raw: Record<string, unknown>
}

const n2 = (v: number) => v.toFixed(2)

/** FECAESolicitar: pide el CAE de un comprobante. */
export async function solicitarCae(s: SolicitudCae): Promise<ResultadoCae> {
  const iva =
    s.alicuotas.length > 0
      ? `<ar:Iva>${s.alicuotas
          .map(
            (a) =>
              `<ar:AlicIva><ar:Id>${a.id}</ar:Id><ar:BaseImp>${n2(a.base)}</ar:BaseImp><ar:Importe>${n2(a.importe)}</ar:Importe></ar:AlicIva>`,
          )
          .join("")}</ar:Iva>`
      : ""

  const asociados = s.asociado
    ? `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>${s.asociado.tipo}</ar:Tipo><ar:PtoVta>${s.asociado.puntoVenta}</ar:PtoVta>` +
      `<ar:Nro>${s.asociado.numero}</ar:Nro><ar:Cuit>${esc(s.asociado.cuit)}</ar:Cuit><ar:CbteFch>${s.asociado.fecha}</ar:CbteFch></ar:CbteAsoc></ar:CbtesAsoc>`
    : ""

  const detalle =
    `<ar:FECAEDetRequest>` +
    `<ar:Concepto>${s.concepto}</ar:Concepto>` +
    `<ar:DocTipo>${s.docTipo}</ar:DocTipo>` +
    `<ar:DocNro>${esc(s.docNro)}</ar:DocNro>` +
    `<ar:CbteDesde>${s.numero}</ar:CbteDesde>` +
    `<ar:CbteHasta>${s.numero}</ar:CbteHasta>` +
    `<ar:CbteFch>${s.fecha}</ar:CbteFch>` +
    `<ar:ImpTotal>${n2(s.impTotal)}</ar:ImpTotal>` +
    `<ar:ImpTotConc>${n2(s.impTotConc)}</ar:ImpTotConc>` +
    `<ar:ImpNeto>${n2(s.impNeto)}</ar:ImpNeto>` +
    `<ar:ImpOpEx>${n2(s.impOpEx)}</ar:ImpOpEx>` +
    `<ar:ImpTrib>${n2(s.impTrib)}</ar:ImpTrib>` +
    `<ar:ImpIVA>${n2(s.impIva)}</ar:ImpIVA>` +
    `<ar:MonId>PES</ar:MonId>` +
    `<ar:MonCotiz>1</ar:MonCotiz>` +
    `<ar:CondicionIVAReceptorId>${s.condicionIvaReceptorId}</ar:CondicionIVAReceptorId>` +
    asociados +
    iva +
    `</ar:FECAEDetRequest>`

  const r = await llamar(
    s.ambiente,
    "FECAESolicitar",
    authXml(s.ta, s.cuit) +
      `<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${s.puntoVenta}</ar:PtoVta>` +
      `<ar:CbteTipo>${s.tipoCbte}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq>${detalle}</ar:FeDetReq></ar:FeCAEReq>`,
  )

  const errores = erroresDe(r)
  const det = buscar(r, "FECAEDetResponse") as Record<string, unknown> | undefined
  const detalleResp = Array.isArray(det) ? (det[0] as Record<string, unknown>) : det

  const obs = (detalleResp?.Observaciones as { Obs?: unknown } | undefined)?.Obs
  const observaciones: ErrorArca[] = obs
    ? (Array.isArray(obs) ? obs : [obs]).map((o) => {
        const x = o as { Code?: string; Msg?: string }
        return { code: Number(x.Code ?? 0), msg: String(x.Msg ?? "") }
      })
    : []

  const resultado = String(detalleResp?.Resultado ?? (buscar(r, "Resultado") ?? "R")) as "A" | "R" | "P"
  const cae = detalleResp?.CAE ? String(detalleResp.CAE) : null

  return {
    resultado,
    cae: cae && cae.length > 0 ? cae : null,
    caeVto: detalleResp?.CAEFchVto ? String(detalleResp.CAEFchVto) : null,
    observaciones,
    errores,
    raw: r,
  }
}
