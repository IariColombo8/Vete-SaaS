import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getAdminDb, verificarToken } from "@/lib/supabase/admin"
import { getConfigPoint, type ConfigPoint } from "@/lib/mp-point/auth"
import {
  asegurarCajaQr,
  crearOrdenQr,
  externalPosIdQr,
  getOrdenPoint,
  interpretarOrden,
  detalleMP,
  MercadoPagoError,
  SinSucursalError,
} from "@/lib/mp-point/api"
import { emitirFacturaDeVenta, getConfigFiscal } from "@/lib/facturacion/emitir"
import { enviarEmailCliente } from "@/lib/email/enviar-cliente"
import { buscarPagos, crearPreferencia, referenciaPedido } from "./mercadopago"
import { esPagoOnline, facturaAutomatica, medioVentaDesdeMP, normalizarDni, rutaPedido } from "./reglas"
import { pedidoDesdeFila, tiendaPublicaDesdeJson, type Pedido } from "./tipos"
import { asuntoPedido, htmlPedido, type TipoEmailPedido } from "./email"
import type { MedioPago } from "@/lib/supabase/types"

/**
 * Lado servidor de los pedidos web: todo con service_role, porque el
 * comprador no es staff y las tablas solo se escriben por RPC.
 *
 * El pago online se confirma SIEMPRE preguntándole a Mercado Pago (nunca por
 * lo que diga el navegador ni el cuerpo del webhook): `verificarPago` busca
 * el pago de la referencia del pedido con el token de la veterinaria.
 */

export async function cargarPedido(admin: SupabaseClient, id: string): Promise<Pedido | null> {
  const { data, error } = await admin.from("pedidos").select("*, pedido_items(*)").eq("id", id).maybeSingle()
  if (error) throw error
  return data ? pedidoDesdeFila(data) : null
}

export type AccesoPedido =
  | { ok: true; admin: SupabaseClient; pedido: Pedido; esStaff: boolean }
  | { ok: false; status: number; error: string }

/** Un pedido por id, o por la ruta pública (veterinaria + DNI + número). */
export type UbicacionPedido = string | { tenantId: string; dni: string; numero: number }

async function buscarPedido(admin: SupabaseClient, u: UbicacionPedido): Promise<Pedido | null> {
  if (typeof u === "string") return cargarPedido(admin, u)
  const { data, error } = await admin
    .from("pedidos")
    .select("*, pedido_items(*)")
    .eq("tenant_id", u.tenantId)
    .eq("numero", u.numero)
    .eq("cliente_dni", normalizarDni(u.dni))
    .maybeSingle()
  if (error) throw error
  return data ? pedidoDesdeFila(data) : null
}

/**
 * El comprador del pedido (la misma cuenta de Google con la que compró) o
 * staff de la veterinaria. Conocer el DNI y el número no alcanza: un pedido
 * ajeno responde igual que uno inexistente, para no confirmar que existe.
 */
export async function autorizarPedido(request: Request, ubicacion: UbicacionPedido): Promise<AccesoPedido> {
  const admin = getAdminDb()
  if (!admin) return { ok: false, status: 503, error: "Servicio no disponible" }

  const authHeader = request.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  if (!token) return { ok: false, status: 401, error: "Iniciá sesión para ver el pedido" }

  const [user, pedido] = await Promise.all([verificarToken(token), buscarPedido(admin, ubicacion)])
  if (!user) return { ok: false, status: 401, error: "Sesión vencida" }
  const noEncontrado = { ok: false as const, status: 404, error: "No encontramos ese pedido en tu cuenta" }
  if (!pedido) return noEncontrado

  if (pedido.usuarioId === user.id) return { ok: true, admin, pedido, esStaff: false }

  const { data: u } = await admin.from("usuarios").select("role, tenant_id").eq("id", user.id).maybeSingle()
  const esStaff =
    u?.role === "superadmin" ||
    ((u?.role === "veterinario" || u?.role === "empleado") && u?.tenant_id === pedido.tenantId)
  if (!esStaff) return noEncontrado

  return { ok: true, admin, pedido, esStaff }
}

// ── Inicio del cobro online ─────────────────────────────────────────────────

export type InicioPago =
  | { tipo: "redirect"; url: string }
  | { tipo: "qr"; qrData: string }
  | { tipo: "ninguno" }

export class PagoError extends Error {}

/** Mensaje para el comprador cuando el cobro no se pudo armar. */
export function mensajePago(e: unknown): string {
  if (e instanceof PagoError) return e.message
  if (e instanceof SinSucursalError) return "La veterinaria todavía no puede cobrar con QR. Probá con tarjeta u otro medio."
  if (e instanceof MercadoPagoError) return `Mercado Pago no pudo generar el cobro (${detalleMP(e.detalle)}). Probá de nuevo.`
  return "No se pudo generar el cobro. Probá de nuevo."
}

/**
 * Arma el cobro de Mercado Pago del pedido: preferencia de Checkout Pro
 * (tarjeta) u orden QR. Se puede llamar de nuevo para reintentar.
 *
 * `precargado`: el alta del pedido ya leyó el token y el nombre en paralelo
 * con todo lo demás; así el QR sale sin dos consultas más en fila.
 */
export async function iniciarPago(
  admin: SupabaseClient,
  pedido: Pedido,
  origen: string,
  precargado: { config?: ConfigPoint | null; nombreTienda?: string } = {},
): Promise<InicioPago> {
  if (!esPagoOnline(pedido.medioPago) || pedido.pagoEstado === "aprobado" || pedido.ventaId) return { tipo: "ninguno" }

  const [config, nombre] = await Promise.all([
    precargado.config !== undefined ? precargado.config : getConfigPoint(admin, pedido.tenantId),
    precargado.nombreTienda ??
      admin.from("tenants").select("nombre").eq("slug", pedido.tenantId).maybeSingle()
        .then(({ data }) => data?.nombre as string | undefined),
  ])
  if (!config) throw new PagoError("La veterinaria no tiene Mercado Pago conectado. Elegí otro medio de pago.")
  const nombreTienda = nombre ?? pedido.tenantId
  const referencia = referenciaPedido(pedido.id)
  const urlPedido = `${origen}${rutaPedido(pedido)}`

  if (pedido.medioPago === "tarjeta") {
    const pref = await crearPreferencia(config.accessToken, {
      externalReference: referencia,
      items: pedido.items.map((i) => ({
        titulo: `${i.cantidad} × ${[i.marca, i.nombre].filter(Boolean).join(" ")}`,
        importe: i.subtotal,
      })),
      total: pedido.total,
      emailComprador: pedido.clienteEmail || undefined,
      urlRetorno: urlPedido,
      urlNotificacion: `${origen}/api/tienda/webhook?pedido=${pedido.id}`,
      nombreTienda,
    })
    await actualizar(admin, pedido.id, { mp_preference_id: pref.id, pago_estado: "pendiente" })
    return { tipo: "redirect", url: pref.initPoint }
  }

  // QR dinámico: misma API de Orders que el QR del mostrador.
  const externalPosId = externalPosIdQr(pedido.tenantId)
  const params = {
    externalPosId,
    monto: pedido.total,
    externalReference: referencia,
    descripcion: `Pedido web N° ${pedido.numero} · ${nombreTienda}`,
    expiraEnMinutos: 30,
  }
  let orden
  try {
    orden = await crearOrdenQr(config.accessToken, params)
  } catch (e) {
    if (!(e instanceof MercadoPagoError && e.detalle.includes("pos_not_found"))) throw e
    await asegurarCajaQr(config.accessToken, externalPosId)
    orden = await crearOrdenQr(config.accessToken, params)
  }
  if (!orden.qrData) throw new PagoError("Mercado Pago no devolvió el QR")

  // Cobro y pedido se guardan a la vez: el cobro se encuentra después por la
  // orden de MP (`order_id`), sin esperar a atarlo con `mp_cobro_id`.
  const [{ error }] = await Promise.all([
    admin.from("mp_point_cobros").insert({
      tenant_id: pedido.tenantId,
      order_id: orden.id,
      external_reference: referencia,
      terminal_id: `qr:${externalPosId}`,
      monto: pedido.total,
      descripcion: params.descripcion,
      estado: orden.status,
      estado_detalle: orden.statusDetail,
      payment_id: orden.paymentId,
    }),
    actualizar(admin, pedido.id, { mp_order_id: orden.id, pago_estado: "pendiente" }),
  ])
  if (error) throw error
  return { tipo: "qr", qrData: orden.qrData }
}

async function actualizar(admin: SupabaseClient, id: string, campos: Record<string, unknown>) {
  const { error } = await admin
    .from("pedidos")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw error
}

// ── Confirmación ────────────────────────────────────────────────────────────

/**
 * Pregunta a Mercado Pago si el pedido ya se pagó y, si sí, lo convierte en
 * venta, factura y avisa. Idempotente: lo llaman el webhook, la vuelta del
 * checkout y el polling del QR, a veces a la vez.
 */
export async function verificarPago(admin: SupabaseClient, pedido: Pedido, origen: string): Promise<Pedido> {
  if (!esPagoOnline(pedido.medioPago) || pedido.estado === "cancelado") return pedido
  if (pedido.ventaId) return pedido

  const [config, { data: fila }] = await Promise.all([
    getConfigPoint(admin, pedido.tenantId),
    admin.from("pedidos").select("mp_order_id").eq("id", pedido.id).maybeSingle(),
  ])
  if (!config) return pedido

  let aprobado: { medio: MedioPago; cuotas: number | null; paymentId: string | null } | null = null
  let rechazado = false

  if (pedido.medioPago === "qr" && fila?.mp_order_id) {
    const orden = await getOrdenPoint(config.accessToken, fila.mp_order_id as string)
    await admin
      .from("mp_point_cobros")
      .update({
        estado: orden.status,
        estado_detalle: orden.paymentStatusDetail ?? orden.statusDetail,
        payment_id: orden.paymentId,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orden.id)
    const r = interpretarOrden(orden)
    if (r === "aprobada") aprobado = { medio: "transferencia", cuotas: null, paymentId: orden.paymentId }
    else if (r === "rechazada" || r === "expirada" || r === "cancelada") rechazado = true
  } else if (pedido.medioPago === "tarjeta") {
    const pagos = await buscarPagos(config.accessToken, referenciaPedido(pedido.id))
    const ok = pagos.find((p) => p.status === "approved")
    if (ok) {
      aprobado = { medio: medioVentaDesdeMP(ok.paymentTypeId), cuotas: ok.installments, paymentId: ok.id }
    } else if (pagos.length > 0 && pagos.every((p) => p.status === "rejected" || p.status === "cancelled")) {
      rechazado = true
    }
  }

  if (aprobado) {
    await confirmarPago(admin, pedido, aprobado.medio, aprobado.cuotas, aprobado.paymentId, origen)
  } else if (rechazado && pedido.pagoEstado !== "rechazado") {
    await actualizar(admin, pedido.id, { pago_estado: "rechazado" })
  }
  return (await cargarPedido(admin, pedido.id)) ?? pedido
}

async function confirmarPago(
  admin: SupabaseClient,
  pedido: Pedido,
  medio: MedioPago,
  cuotas: number | null,
  paymentId: string | null,
  origen: string,
) {
  const { data, error } = await admin.rpc("_venta_de_pedido", {
    p_pedido_id: pedido.id,
    p_medio_pago: medio,
    p_cuotas: cuotas,
    p_mp_payment_id: paymentId,
    p_usuario_id: null,
    p_usuario_nombre: "Tienda web",
  })

  if (error) {
    // El pago está hecho aunque la venta no se pueda registrar (sin stock,
    // producto dado de baja): queda marcado para que el staff lo resuelva.
    console.error("[pedidos] No se pudo registrar la venta del pedido", pedido.id, error.message)
    await actualizar(admin, pedido.id, {
      pago_estado: "aprobado",
      mp_payment_id: paymentId,
      venta_error: error.message,
    })
    return
  }

  const ventaId = (data as { venta_id: string }).venta_id
  // El QR además ata la venta a la orden y al cobro, igual que en el mostrador.
  if (pedido.medioPago === "qr") {
    const { data: fila } = await admin.from("pedidos").select("mp_order_id").eq("id", pedido.id).maybeSingle()
    if (fila?.mp_order_id) {
      const { data: cobro } = await admin
        .from("mp_point_cobros").update({ venta_id: ventaId }).eq("order_id", fila.mp_order_id).select("id").maybeSingle()
      await admin.from("ventas").update({ mp_order_id: fila.mp_order_id }).eq("id", ventaId)
      if (cobro) await actualizar(admin, pedido.id, { mp_cobro_id: cobro.id })
    }
  }

  if (facturaAutomatica(medio)) await facturarPedido(admin, pedido.id, pedido.tenantId, ventaId)

  const actualizado = await cargarPedido(admin, pedido.id)
  if (actualizado) await notificarPedido(admin, actualizado, origen, "pagado")
}

/** Emite la factura de la venta del pedido. Nunca lanza: el error queda en el pedido. */
export async function facturarPedido(admin: SupabaseClient, pedidoId: string, tenantId: string, ventaId: string) {
  try {
    const cfg = await getConfigFiscal(admin, tenantId)
    if (!cfg || !cfg.certPem) return
    const r = await emitirFacturaDeVenta(admin, cfg, ventaId, null)
    const motivo = r.estado === "rechazado"
      ? r.observaciones.map((o) => `${o.code}: ${o.msg}`).join(" · ") || "ARCA rechazó el comprobante"
      : null
    await actualizar(admin, pedidoId, { factura_error: motivo })
  } catch (error) {
    console.error("[pedidos] No se pudo facturar el pedido", pedidoId, error)
    await actualizar(admin, pedidoId, {
      factura_error: error instanceof Error ? error.message : "No se pudo emitir la factura",
    }).catch(() => {})
  }
}

// ── Avisos ──────────────────────────────────────────────────────────────────

/**
 * Email al comprador desde el Gmail de la veterinaria. "pagado" sale una sola
 * vez (`notificado_at`); sin Gmail conectado no se manda nada. Nunca lanza.
 */
export async function notificarPedido(admin: SupabaseClient, pedido: Pedido, origen: string, tipo: TipoEmailPedido) {
  if (!pedido.clienteEmail) return
  try {
    if (tipo === "pagado") {
      const { data: reclamado } = await admin
        .from("pedidos")
        .update({ notificado_at: new Date().toISOString() })
        .eq("id", pedido.id)
        .is("notificado_at", null)
        .select("id")
      if (!reclamado?.length) return
    }

    const [{ data: tenant }, { data: tienda }] = await Promise.all([
      admin.from("tenants").select("nombre").eq("slug", pedido.tenantId).maybeSingle(),
      admin.rpc("tienda_publica", { p_tenant: pedido.tenantId }),
    ])
    const t = tiendaPublicaDesdeJson(tienda as Record<string, unknown> | null)
    const datos = {
      veterinaria: (tenant?.nombre as string | undefined) ?? pedido.tenantId,
      urlPedido: `${origen}${rutaPedido(pedido)}`,
      aliasTransferencia: t.aliasTransferencia,
      titularTransferencia: t.titularTransferencia,
      notaEnvio: t.notaEnvio,
    }
    await enviarEmailCliente(pedido.tenantId, {
      to: pedido.clienteEmail,
      subject: asuntoPedido(pedido, datos, tipo),
      html: htmlPedido(pedido, datos, tipo),
    })
  } catch (error) {
    console.error("[pedidos] No se pudo avisar al comprador", pedido.id, error)
  }
}

/** Origen público para links y back_urls: el de la request (así anda en localhost). */
export function origenDe(request: Request): string {
  const url = new URL(request.url)
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host
  return `${proto}://${host}`
}
