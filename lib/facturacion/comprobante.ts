/**
 * Reglas del comprobante electrónico: qué letra corresponde, cómo se reparte
 * el IVA, qué receptor se declara y qué va en el QR. Todo puro y sin I/O para
 * poder testearlo; la llamada a ARCA vive en `wsfe.ts`.
 *
 * Códigos ARCA que se usan acá:
 *  - Tipo de comprobante: 1 Factura A, 6 Factura B, 11 Factura C,
 *    3 Nota de crédito A, 8 NC B, 13 NC C.
 *  - Tipo de documento: 80 CUIT, 96 DNI, 99 Consumidor final (nro 0).
 *  - Condición IVA receptor (RG 5616): 1 RI, 4 Exento, 5 Consumidor final,
 *    6 Monotributo, 7 Sujeto no categorizado.
 *  - Alícuota IVA: 3 → 0 %, 4 → 10,5 %, 5 → 21 %, 6 → 27 %, 8 → 5 %, 9 → 2,5 %.
 */

export type CondicionIvaEmisor = "RI" | "MONOTRIBUTO" | "EXENTO"
export type CondicionIvaCliente = "CF" | "RI" | "MONOTRIBUTO" | "EXENTO" | "NO_CATEGORIZADO"

export const TIPO_CBTE = {
  FACTURA_A: 1,
  FACTURA_B: 6,
  FACTURA_C: 11,
  NC_A: 3,
  NC_B: 8,
  NC_C: 13,
} as const

export const DOC_TIPO = { CUIT: 80, DNI: 96, CONSUMIDOR_FINAL: 99 } as const

export const CONDICION_IVA_RECEPTOR: Record<CondicionIvaCliente, number> = {
  RI: 1,
  EXENTO: 4,
  CF: 5,
  MONOTRIBUTO: 6,
  NO_CATEGORIZADO: 7,
}

export const CONDICION_IVA_LABEL: Record<CondicionIvaCliente | CondicionIvaEmisor, string> = {
  CF: "Consumidor Final",
  RI: "IVA Responsable Inscripto",
  MONOTRIBUTO: "Responsable Monotributo",
  EXENTO: "IVA Sujeto Exento",
  NO_CATEGORIZADO: "Sujeto no categorizado",
}

/** Alícuota (%) → código ARCA. */
export const ALICUOTA_ID: Record<string, number> = {
  "0": 3,
  "10.5": 4,
  "21": 5,
  "27": 6,
  "5": 8,
  "2.5": 9,
}

/**
 * Tope a partir del cual una factura a consumidor final tiene que identificar
 * al comprador (DNI). ARCA lo actualiza periódicamente: es env
 * `ARCA_UMBRAL_IDENTIFICACION_CF`, con este valor como default. **Verificar el
 * vigente** antes de salir a producción.
 */
export const UMBRAL_IDENTIFICACION_CF_DEFAULT = 417288

export function letraComprobante(emisor: CondicionIvaEmisor, receptor: CondicionIvaCliente): "A" | "B" | "C" {
  if (emisor !== "RI") return "C"
  return receptor === "RI" || receptor === "MONOTRIBUTO" ? "A" : "B"
}

export function tipoFactura(letra: "A" | "B" | "C"): number {
  return letra === "A" ? TIPO_CBTE.FACTURA_A : letra === "B" ? TIPO_CBTE.FACTURA_B : TIPO_CBTE.FACTURA_C
}

export function tipoNotaCredito(tipoFactura: number): number {
  if (tipoFactura === TIPO_CBTE.FACTURA_A) return TIPO_CBTE.NC_A
  if (tipoFactura === TIPO_CBTE.FACTURA_B) return TIPO_CBTE.NC_B
  return TIPO_CBTE.NC_C
}

export function letraDeTipo(tipo: number): "A" | "B" | "C" {
  if (tipo === TIPO_CBTE.FACTURA_A || tipo === TIPO_CBTE.NC_A) return "A"
  if (tipo === TIPO_CBTE.FACTURA_B || tipo === TIPO_CBTE.NC_B) return "B"
  return "C"
}

export function esNotaCredito(tipo: number): boolean {
  return tipo === TIPO_CBTE.NC_A || tipo === TIPO_CBTE.NC_B || tipo === TIPO_CBTE.NC_C
}

export function nombreComprobante(tipo: number): string {
  return `${esNotaCredito(tipo) ? "NOTA DE CRÉDITO" : "FACTURA"} ${letraDeTipo(tipo)}`
}

/** `0001-00000042`. */
export function numeroComprobante(puntoVenta: number, numero: number): string {
  return `${String(puntoVenta).padStart(4, "0")}-${String(numero).padStart(8, "0")}`
}

// ── Receptor ────────────────────────────────────────────────────────────────

export interface ReceptorEntrada {
  nombre: string
  cuit?: string | null
  dni?: string | null
  domicilio?: string | null
  condicionIva?: CondicionIvaCliente | null
}

export interface ReceptorResuelto {
  docTipo: number
  docNro: string
  condicionIva: CondicionIvaCliente
  condicionIvaId: number
  nombre: string
  domicilio: string
}

function soloDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "")
}

/** CUIT válido: 11 dígitos y dígito verificador correcto. */
export function cuitValido(cuit: string | null | undefined): boolean {
  const d = soloDigitos(cuit)
  if (d.length !== 11) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(d[i]), 0)
  const resto = 11 - (suma % 11)
  const verificador = resto === 11 ? 0 : resto === 10 ? 9 : resto
  return verificador === Number(d[10])
}

/**
 * Quién recibe la factura. Con CUIT válido se declara por CUIT; si no, por
 * DNI; sin nada, consumidor final (doc 99, nro 0).
 */
export function resolverReceptor(entrada: ReceptorEntrada): ReceptorResuelto {
  const cuit = soloDigitos(entrada.cuit)
  const dni = soloDigitos(entrada.dni)
  const condicion: CondicionIvaCliente = entrada.condicionIva ?? "CF"

  let docTipo: number = DOC_TIPO.CONSUMIDOR_FINAL
  let docNro = "0"
  if (cuit.length === 11 && cuitValido(cuit)) {
    docTipo = DOC_TIPO.CUIT
    docNro = cuit
  } else if (dni.length >= 7 && dni.length <= 8) {
    docTipo = DOC_TIPO.DNI
    docNro = dni
  }

  return {
    docTipo,
    docNro,
    condicionIva: condicion,
    condicionIvaId: CONDICION_IVA_RECEPTOR[condicion],
    nombre: entrada.nombre?.trim() || "Consumidor Final",
    domicilio: entrada.domicilio?.trim() ?? "",
  }
}

// ── Importes ────────────────────────────────────────────────────────────────

export interface ItemFacturable {
  descripcion: string
  cantidad: number
  /** Precio unitario final (con IVA incluido), ya con la oferta aplicada. */
  precioUnitario: number
  /** Importe final de la línea (con IVA incluido). */
  subtotal: number
  /** 0, 2.5, 5, 10.5, 21, 27. `null` = exento. */
  alicuotaIva: number | null
}

export interface AlicuotaResumen {
  id: number
  alicuota: number
  base: number
  importe: number
}

export interface ImportesComprobante {
  impTotal: number
  impNeto: number
  impIva: number
  impOpEx: number
  impTotConc: number
  impTrib: number
  alicuotas: AlicuotaResumen[]
  /** Items ya escalados al total real de la venta (descuentos/recargos repartidos). */
  items: (ItemFacturable & { neto: number; iva: number })[]
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Reparte el total cobrado (que ya incluye descuento y recargo) entre los
 * ítems en proporción a su subtotal y separa el IVA por alícuota.
 *
 * Para Factura C (monotributo/exento) no se discrimina IVA: todo va a ImpNeto.
 * Para A y B, ImpNeto es la suma de bases y ImpIva la suma de IVA; los ítems
 * exentos van a ImpOpEx. ImpTotal siempre tiene que ser igual al total de la
 * venta, así que el último grupo absorbe la diferencia de redondeo.
 */
export function calcularImportes(
  items: ItemFacturable[],
  totalVenta: number,
  discriminaIva: boolean,
): ImportesComprobante {
  const total = r2(totalVenta)
  const sumaItems = items.reduce((acc, i) => acc + i.subtotal, 0)
  const factor = sumaItems > 0 ? total / sumaItems : 1

  if (!discriminaIva) {
    return {
      impTotal: total,
      impNeto: total,
      impIva: 0,
      impOpEx: 0,
      impTotConc: 0,
      impTrib: 0,
      alicuotas: [],
      items: items.map((i) => ({ ...i, subtotal: r2(i.subtotal * factor), neto: r2(i.subtotal * factor), iva: 0 })),
    }
  }

  const grupos = new Map<string, { alicuota: number | null; bruto: number }>()
  const itemsEscalados = items.map((i) => {
    const bruto = i.subtotal * factor
    const clave = i.alicuotaIva === null ? "exento" : String(i.alicuotaIva)
    const g = grupos.get(clave) ?? { alicuota: i.alicuotaIva, bruto: 0 }
    g.bruto += bruto
    grupos.set(clave, g)
    const neto = i.alicuotaIva === null ? bruto : bruto / (1 + i.alicuotaIva / 100)
    return { ...i, subtotal: r2(bruto), neto: r2(neto), iva: r2(bruto - neto) }
  })

  let impOpEx = 0
  const alicuotas: AlicuotaResumen[] = []
  let acumulado = 0
  const entradas = [...grupos.entries()]

  entradas.forEach(([clave, g], idx) => {
    // El último grupo cierra contra el total exacto para que no quede un
    // centavo colgado por el redondeo de los anteriores.
    const esUltimo = idx === entradas.length - 1
    const bruto = esUltimo ? r2(total - acumulado) : r2(g.bruto)
    acumulado = r2(acumulado + bruto)

    if (clave === "exento") {
      impOpEx = r2(impOpEx + bruto)
      return
    }
    const alicuota = g.alicuota as number
    const base = r2(bruto / (1 + alicuota / 100))
    const importe = r2(bruto - base)
    const id = ALICUOTA_ID[String(alicuota)]
    if (!id) throw new Error(`Alícuota de IVA no soportada: ${alicuota}`)
    alicuotas.push({ id, alicuota, base, importe })
  })

  const impNeto = r2(alicuotas.reduce((a, x) => a + x.base, 0))
  const impIva = r2(alicuotas.reduce((a, x) => a + x.importe, 0))

  return {
    impTotal: total,
    impNeto,
    impIva,
    impOpEx,
    impTotConc: 0,
    impTrib: 0,
    alicuotas: alicuotas.sort((a, b) => a.alicuota - b.alicuota),
    items: itemsEscalados,
  }
}

/** Fecha de hoy en Argentina (UTC-3, sin horario de verano) como YYYYMMDD. */
export function fechaArca(ahora: Date = new Date()): string {
  const ar = new Date(ahora.getTime() - 3 * 60 * 60 * 1000)
  return ar.toISOString().slice(0, 10).replace(/-/g, "")
}

/** YYYYMMDD → YYYY-MM-DD. */
export function fechaIso(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
}

// ── QR ──────────────────────────────────────────────────────────────────────

export interface DatosQr {
  fecha: string // YYYY-MM-DD
  cuit: string
  ptoVta: number
  tipoCmp: number
  nroCmp: number
  importe: number
  tipoDocRec: number
  nroDocRec: string
  codAut: string
}

/**
 * URL del QR obligatorio (RG 4892): JSON en base64 en el parámetro `p`.
 * El orden y los tipos son los del spec de ARCA (números como números).
 */
export function urlQrArca(d: DatosQr): string {
  const json = {
    ver: 1,
    fecha: d.fecha,
    cuit: Number(d.cuit.replace(/\D/g, "")),
    ptoVta: d.ptoVta,
    tipoCmp: d.tipoCmp,
    nroCmp: d.nroCmp,
    importe: Number(d.importe.toFixed(2)),
    moneda: "PES",
    ctz: 1,
    tipoDocRec: d.tipoDocRec,
    nroDocRec: Number(d.nroDocRec) || 0,
    tipoCodAut: "E",
    codAut: Number(d.codAut),
  }
  const b64 = typeof Buffer !== "undefined"
    ? Buffer.from(JSON.stringify(json), "utf8").toString("base64")
    : btoa(unescape(encodeURIComponent(JSON.stringify(json))))
  return `https://www.afip.gob.ar/fe/qr/?p=${b64}`
}

/** Validaciones previas a pedir el CAE, con mensajes para el mostrador. */
export function validarAntesDeEmitir(params: {
  receptor: ReceptorResuelto
  importes: ImportesComprobante
  letra: "A" | "B" | "C"
  umbralCf?: number
}): string | null {
  const { receptor, importes, letra } = params
  const umbral = params.umbralCf ?? UMBRAL_IDENTIFICACION_CF_DEFAULT

  if (importes.impTotal <= 0) return "El total tiene que ser mayor a cero."
  if (letra === "A" && receptor.docTipo !== DOC_TIPO.CUIT) {
    return "Para una Factura A el cliente tiene que tener un CUIT válido."
  }
  if (receptor.docTipo === DOC_TIPO.CONSUMIDOR_FINAL && importes.impTotal >= umbral) {
    return `Para importes desde $${umbral.toLocaleString("es-AR")} hay que identificar al cliente: cargale el DNI.`
  }
  return null
}
