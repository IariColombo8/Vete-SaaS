import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { descifrar } from "./crypto"
import { pedirTicketAcceso, type Ambiente, type TicketAcceso } from "./wsaa"
import { solicitarCae, ultimoAutorizado, type ErrorArca } from "./wsfe"
import {
  calcularImportes,
  esNotaCredito,
  fechaArca,
  letraComprobante,
  resolverReceptor,
  tipoFactura,
  tipoNotaCredito,
  validarAntesDeEmitir,
  UMBRAL_IDENTIFICACION_CF_DEFAULT,
  type CondicionIvaCliente,
  type CondicionIvaEmisor,
  type ItemFacturable,
} from "./comprobante"

/**
 * Emisión de comprobantes: junta la config fiscal del tenant, la venta y sus
 * ítems, calcula el comprobante (`comprobante.ts`), pide el CAE (`wsfe.ts`) y
 * guarda el resultado en `comprobantes`, salga bien o rechazado.
 *
 * Corre con service_role: `tenant_fiscal` no tiene policies.
 */

export interface ConfigFiscal {
  tenantId: string
  cuit: string
  razonSocial: string
  domicilioFiscal: string | null
  condicionIva: CondicionIvaEmisor
  inicioActividades: string | null
  ingresosBrutos: string | null
  puntoVenta: number
  ambiente: Ambiente
  keyPemEnc: string | null
  certPem: string | null
  ta: TicketAcceso | null
}

export class FacturacionError extends Error {
  constructor(
    message: string,
    public status = 400,
    public detalle: ErrorArca[] = [],
  ) {
    super(message)
  }
}

export async function getConfigFiscal(admin: SupabaseClient, tenantId: string): Promise<ConfigFiscal | null> {
  const { data, error } = await admin.from("tenant_fiscal").select("*").eq("tenant_id", tenantId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const ta =
    data.ta_token && data.ta_sign && data.ta_expira_at
      ? { token: data.ta_token as string, sign: data.ta_sign as string, expira: data.ta_expira_at as string }
      : null
  return {
    tenantId,
    cuit: String(data.cuit).replace(/\D/g, ""),
    razonSocial: data.razon_social as string,
    domicilioFiscal: (data.domicilio_fiscal as string | null) ?? null,
    condicionIva: data.condicion_iva as CondicionIvaEmisor,
    inicioActividades: (data.inicio_actividades as string | null) ?? null,
    ingresosBrutos: (data.ingresos_brutos as string | null) ?? null,
    puntoVenta: Number(data.punto_venta ?? 1),
    ambiente: data.ambiente as Ambiente,
    keyPemEnc: (data.key_pem_enc as string | null) ?? null,
    certPem: (data.cert_pem as string | null) ?? null,
    ta,
  }
}

/**
 * Ticket de acceso vigente, pidiendo uno nuevo si el cacheado venció (con 5
 * minutos de margen). Se guarda en `tenant_fiscal` porque ARCA no da otro
 * mientras el anterior siga vivo.
 */
export async function obtenerTicket(admin: SupabaseClient, cfg: ConfigFiscal): Promise<TicketAcceso> {
  if (!cfg.certPem || !cfg.keyPemEnc) {
    throw new FacturacionError("Falta cargar el certificado de ARCA en Configuración → Integraciones.", 409)
  }
  if (cfg.ta && new Date(cfg.ta.expira).getTime() - Date.now() > 5 * 60 * 1000) return cfg.ta

  const ta = await pedirTicketAcceso({
    ambiente: cfg.ambiente,
    certPem: cfg.certPem,
    privateKeyPem: descifrar(cfg.keyPemEnc),
  })
  const { error } = await admin
    .from("tenant_fiscal")
    .update({ ta_token: ta.token, ta_sign: ta.sign, ta_expira_at: ta.expira, updated_at: new Date().toISOString() })
    .eq("tenant_id", cfg.tenantId)
  if (error) throw error
  return ta
}

interface FilaVenta {
  id: string
  numero: number
  total: number
  estado: string
  cliente_id: string | null
  cliente_nombre: string
  cliente_dni: string
  cliente_domicilio: string
  venta_items: {
    producto_id: string | null
    nombre: string
    marca: string
    presentacion: string
    unidad: string
    cantidad: number
    precio_unitario: number
    subtotal: number
  }[]
}

/**
 * Ítems de la venta con la alícuota de IVA del producto. Se lee la alícuota
 * actual del catálogo (los `venta_items` no la guardan): si cambió después
 * de la venta, la factura sale con la vigente. Es un caso raro y se documenta.
 */
async function itemsDeVenta(admin: SupabaseClient, venta: FilaVenta): Promise<ItemFacturable[]> {
  const ids = venta.venta_items.map((i) => i.producto_id).filter((x): x is string => Boolean(x))
  const alicuotas = new Map<string, number>()
  if (ids.length) {
    const { data, error } = await admin.from("productos").select("id, alicuota_iva").in("id", ids)
    if (error) throw error
    for (const p of data ?? []) alicuotas.set(p.id as string, Number(p.alicuota_iva))
  }
  return venta.venta_items.map((i) => ({
    descripcion: [i.marca, i.nombre].filter(Boolean).join(" ") + (i.presentacion ? ` (${i.presentacion})` : ""),
    cantidad: Number(i.cantidad),
    precioUnitario: Number(i.precio_unitario),
    subtotal: Number(i.subtotal),
    alicuotaIva: i.producto_id ? (alicuotas.get(i.producto_id) ?? 21) : 21,
  }))
}

export interface ResultadoEmision {
  comprobanteId: string
  estado: "emitido" | "rechazado"
  tipoCbte: number
  puntoVenta: number
  numero: number | null
  cae: string | null
  caeVto: string | null
  observaciones: ErrorArca[]
}

/** Factura de una venta. Idempotente: si ya tiene factura emitida, la devuelve. */
export async function emitirFacturaDeVenta(
  admin: SupabaseClient,
  cfg: ConfigFiscal,
  ventaId: string,
  usuarioId: string,
): Promise<ResultadoEmision> {
  const { data: existente } = await admin
    .from("comprobantes")
    .select("id, tipo_cbte, punto_venta, numero, cae, cae_vto, observaciones")
    .eq("venta_id", ventaId)
    .eq("estado", "emitido")
    .in("tipo_cbte", [1, 6, 11])
    .maybeSingle()
  if (existente) {
    return {
      comprobanteId: existente.id as string,
      estado: "emitido",
      tipoCbte: Number(existente.tipo_cbte),
      puntoVenta: Number(existente.punto_venta),
      numero: Number(existente.numero),
      cae: existente.cae as string,
      caeVto: existente.cae_vto as string,
      observaciones: (existente.observaciones as ErrorArca[]) ?? [],
    }
  }

  const { data: ventaRaw, error: errVenta } = await admin
    .from("ventas")
    .select("id, numero, total, estado, cliente_id, cliente_nombre, cliente_dni, cliente_domicilio, venta_items(*)")
    .eq("id", ventaId)
    .eq("tenant_id", cfg.tenantId)
    .maybeSingle()
  if (errVenta) throw errVenta
  if (!ventaRaw) throw new FacturacionError("Venta no encontrada", 404)
  const venta = ventaRaw as unknown as FilaVenta
  if (venta.estado === "anulada") throw new FacturacionError("La venta está anulada: no se puede facturar.", 409)
  if (!venta.venta_items?.length) throw new FacturacionError("La venta no tiene ítems para facturar.", 409)

  // Datos fiscales del cliente (CUIT y condición IVA viven en `clientes`, no en el snapshot).
  let cuitCliente: string | null = null
  let condicionCliente: CondicionIvaCliente = "CF"
  if (venta.cliente_id) {
    const { data: cli } = await admin
      .from("clientes")
      .select("cuit, condicion_iva")
      .eq("id", venta.cliente_id)
      .maybeSingle()
    cuitCliente = (cli?.cuit as string | null) ?? null
    condicionCliente = ((cli?.condicion_iva as CondicionIvaCliente | null) ?? "CF")
  }

  const receptor = resolverReceptor({
    nombre: venta.cliente_nombre,
    cuit: cuitCliente,
    dni: venta.cliente_dni,
    domicilio: venta.cliente_domicilio,
    condicionIva: condicionCliente,
  })
  const letra = letraComprobante(cfg.condicionIva, receptor.condicionIva)
  const tipoCbte = tipoFactura(letra)
  const items = await itemsDeVenta(admin, venta)
  const importes = calcularImportes(items, Number(venta.total), letra !== "C")

  const umbral = Number(process.env.ARCA_UMBRAL_IDENTIFICACION_CF ?? UMBRAL_IDENTIFICACION_CF_DEFAULT)
  const problema = validarAntesDeEmitir({ receptor, importes, letra, umbralCf: umbral })
  if (problema) throw new FacturacionError(problema, 422)

  return pedirYGuardar(admin, cfg, {
    ventaId,
    tipoCbte,
    receptor,
    importes,
    items,
    usuarioId,
  })
}

/** Nota de crédito que anula una factura emitida (venta anulada, devolución). */
export async function emitirNotaCredito(
  admin: SupabaseClient,
  cfg: ConfigFiscal,
  comprobanteId: string,
  usuarioId: string,
): Promise<ResultadoEmision> {
  const { data: fac, error } = await admin
    .from("comprobantes")
    .select("*")
    .eq("id", comprobanteId)
    .eq("tenant_id", cfg.tenantId)
    .eq("estado", "emitido")
    .maybeSingle()
  if (error) throw error
  if (!fac) throw new FacturacionError("Factura no encontrada", 404)
  if (esNotaCredito(Number(fac.tipo_cbte))) throw new FacturacionError("Ese comprobante ya es una nota de crédito.", 409)

  const { data: ncExistente } = await admin
    .from("comprobantes")
    .select("id, tipo_cbte, punto_venta, numero, cae, cae_vto")
    .eq("comprobante_asociado_id", comprobanteId)
    .eq("estado", "emitido")
    .maybeSingle()
  if (ncExistente) {
    return {
      comprobanteId: ncExistente.id as string,
      estado: "emitido",
      tipoCbte: Number(ncExistente.tipo_cbte),
      puntoVenta: Number(ncExistente.punto_venta),
      numero: Number(ncExistente.numero),
      cae: ncExistente.cae as string,
      caeVto: ncExistente.cae_vto as string,
      observaciones: [],
    }
  }

  const alicuotas = (fac.alicuotas as { id: number; alicuota: number; base: number; importe: number }[]) ?? []
  return pedirYGuardar(admin, cfg, {
    ventaId: (fac.venta_id as string | null) ?? null,
    tipoCbte: tipoNotaCredito(Number(fac.tipo_cbte)),
    receptor: {
      docTipo: Number(fac.doc_tipo),
      docNro: String(fac.doc_nro),
      condicionIva: "CF",
      condicionIvaId: Number(fac.receptor_condicion_iva),
      nombre: fac.receptor_nombre as string,
      domicilio: fac.receptor_domicilio as string,
    },
    importes: {
      impTotal: Number(fac.imp_total),
      impNeto: Number(fac.imp_neto),
      impIva: Number(fac.imp_iva),
      impOpEx: Number(fac.imp_op_ex),
      impTotConc: Number(fac.imp_tot_conc),
      impTrib: Number(fac.imp_trib),
      alicuotas,
      items: [],
    },
    items: (fac.items as ItemFacturable[]) ?? [],
    usuarioId,
    asociado: {
      id: comprobanteId,
      tipo: Number(fac.tipo_cbte),
      puntoVenta: Number(fac.punto_venta),
      numero: Number(fac.numero),
      fecha: String(fac.fecha).replace(/-/g, ""),
    },
  })
}

interface PedidoInterno {
  ventaId: string | null
  tipoCbte: number
  receptor: ReturnType<typeof resolverReceptor>
  importes: ReturnType<typeof calcularImportes>
  items: ItemFacturable[]
  usuarioId: string
  asociado?: { id: string; tipo: number; puntoVenta: number; numero: number; fecha: string }
}

async function pedirYGuardar(admin: SupabaseClient, cfg: ConfigFiscal, p: PedidoInterno): Promise<ResultadoEmision> {
  const ta = await obtenerTicket(admin, cfg)
  const ultimo = await ultimoAutorizado({
    ambiente: cfg.ambiente,
    ta,
    cuit: cfg.cuit,
    puntoVenta: cfg.puntoVenta,
    tipoCbte: p.tipoCbte,
  })
  const numero = ultimo + 1
  const fecha = fechaArca()

  const base = {
    tenant_id: cfg.tenantId,
    venta_id: p.ventaId,
    tipo_cbte: p.tipoCbte,
    punto_venta: cfg.puntoVenta,
    numero,
    fecha: `${fecha.slice(0, 4)}-${fecha.slice(4, 6)}-${fecha.slice(6, 8)}`,
    concepto: 1,
    ambiente: cfg.ambiente,
    doc_tipo: p.receptor.docTipo,
    doc_nro: p.receptor.docNro,
    receptor_nombre: p.receptor.nombre,
    receptor_domicilio: p.receptor.domicilio,
    receptor_condicion_iva: p.receptor.condicionIvaId,
    imp_total: p.importes.impTotal,
    imp_neto: p.importes.impNeto,
    imp_iva: p.importes.impIva,
    imp_op_ex: p.importes.impOpEx,
    imp_tot_conc: p.importes.impTotConc,
    imp_trib: p.importes.impTrib,
    alicuotas: p.importes.alicuotas,
    items: p.importes.items.length ? p.importes.items : p.items,
    comprobante_asociado_id: p.asociado?.id ?? null,
    creado_por: p.usuarioId,
  }

  const r = await solicitarCae({
    ambiente: cfg.ambiente,
    ta,
    cuit: cfg.cuit,
    puntoVenta: cfg.puntoVenta,
    tipoCbte: p.tipoCbte,
    numero,
    fecha,
    concepto: 1,
    docTipo: p.receptor.docTipo,
    docNro: p.receptor.docNro,
    condicionIvaReceptorId: p.receptor.condicionIvaId,
    impTotal: p.importes.impTotal,
    impNeto: p.importes.impNeto,
    impIva: p.importes.impIva,
    impOpEx: p.importes.impOpEx,
    impTotConc: p.importes.impTotConc,
    impTrib: p.importes.impTrib,
    alicuotas: p.importes.alicuotas,
    asociado: p.asociado
      ? { tipo: p.asociado.tipo, puntoVenta: p.asociado.puntoVenta, numero: p.asociado.numero, cuit: cfg.cuit, fecha: p.asociado.fecha }
      : undefined,
  })

  const aprobado = r.resultado === "A" && Boolean(r.cae)
  const observaciones = [...r.observaciones, ...r.errores]
  const { data, error } = await admin
    .from("comprobantes")
    .insert({
      ...base,
      numero: aprobado ? numero : null,
      cae: r.cae,
      cae_vto: r.caeVto ? `${r.caeVto.slice(0, 4)}-${r.caeVto.slice(4, 6)}-${r.caeVto.slice(6, 8)}` : null,
      estado: aprobado ? "emitido" : "rechazado",
      observaciones,
      respuesta_raw: r.raw,
    })
    .select("id")
    .single()
  if (error) throw error

  return {
    comprobanteId: data.id as string,
    estado: aprobado ? "emitido" : "rechazado",
    tipoCbte: p.tipoCbte,
    puntoVenta: cfg.puntoVenta,
    numero: aprobado ? numero : null,
    cae: r.cae,
    caeVto: r.caeVto,
    observaciones,
  }
}
