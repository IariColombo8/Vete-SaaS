import { escapeHtml } from "@/lib/recordatorios/email"
import { formatCantidad, formatCurrency } from "@/lib/format"
import { esPagoOnline } from "./reglas"
import { etiquetaMedioWeb, numeroPedido, type Pedido } from "./tipos"

/**
 * Emails del pedido web al comprador. Puros, para poder testearlos; los manda
 * el servidor con `enviarEmailCliente` (el Gmail de la veterinaria).
 *
 *  · "recibido": al crear un pedido que se paga después (efectivo o
 *    transferencia), con el alias si es transferencia.
 *  · "pagado": cuando queda cobrado (Mercado Pago aprobó). Lleva al pedido,
 *    donde se descargan el remito y la factura.
 */

export interface DatosEmailPedido {
  veterinaria: string
  urlPedido: string
  aliasTransferencia?: string
  titularTransferencia?: string
  notaEnvio?: string
}

export type TipoEmailPedido = "recibido" | "pagado"

export function asuntoPedido(p: Pedido, d: DatosEmailPedido, tipo: TipoEmailPedido): string {
  return tipo === "pagado"
    ? `Pago aprobado · ${numeroPedido(p.numero)} — ${d.veterinaria}`
    : `Recibimos tu pedido · ${numeroPedido(p.numero)} — ${d.veterinaria}`
}

export function htmlPedido(p: Pedido, d: DatosEmailPedido, tipo: TipoEmailPedido): string {
  const e = escapeHtml
  const nombre = p.clienteNombre.trim().split(/\s+/)[0]
  const filas = p.items
    .map(
      (i) => `<tr>
          <td style="padding:6px 0;color:#334155;font-size:14px;">${e([i.marca, i.nombre].filter(Boolean).join(" "))}${i.presentacion ? ` <span style="color:#94a3b8;">(${e(i.presentacion)})</span>` : ""} × ${formatCantidad(i.cantidad)}${i.unidad === "kg" ? " kg" : ""}</td>
          <td style="padding:6px 0;color:#334155;font-size:14px;text-align:right;white-space:nowrap;">${formatCurrency(i.subtotal)}</td>
        </tr>`,
    )
    .join("")

  const entrega = p.entrega === "envio"
    ? `Envío a <strong>${e(p.direccion)}</strong>.${d.notaEnvio ? ` ${e(d.notaEnvio)}` : ""}`
    : "Retiro en el local."

  let pago: string
  if (tipo === "pagado") {
    pago = "Tu pago quedó aprobado. En el pedido podés descargar el remito y la factura."
  } else if (p.medioPago === "transferencia" && d.aliasTransferencia) {
    pago = `Transferí <strong>${formatCurrency(p.total)}</strong> al alias <strong>${e(d.aliasTransferencia)}</strong>${d.titularTransferencia ? ` (${e(d.titularTransferencia)})` : ""} y mandanos el comprobante.`
  } else if (esPagoOnline(p.medioPago)) {
    pago = "Todavía no registramos el pago. Podés completarlo desde el pedido."
  } else {
    pago = `Pagás en ${etiquetaMedioWeb(p.medioPago).toLowerCase()} ${p.entrega === "envio" ? "al recibirlo" : "al retirarlo"}.`
  }

  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 4px;color:#64748b;font-size:13px;">${e(d.veterinaria)}</p>
      <h1 style="margin:0 0 16px;color:#0f172a;font-size:20px;">${tipo === "pagado" ? "¡Pago aprobado!" : "¡Recibimos tu pedido!"}</h1>
      <p style="margin:0 0 16px;color:#334155;font-size:15px;">${nombre ? `Hola <strong>${e(nombre)}</strong>, ` : ""}este es tu ${e(numeroPedido(p.numero).toLowerCase())}.</p>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">${filas}</table>
      ${p.descuento > 0 ? `<p style="margin:8px 0 0;text-align:right;color:#64748b;font-size:13px;">Descuento: − ${formatCurrency(p.descuento)}</p>` : ""}
      <p style="margin:8px 0 16px;text-align:right;color:#0f172a;font-size:18px;font-weight:bold;">Total ${formatCurrency(p.total)}</p>
      <p style="margin:0 0 8px;color:#334155;font-size:14px;">${entrega}</p>
      <p style="margin:0 0 8px;color:#334155;font-size:14px;">${pago}</p>
      <div style="text-align:center;margin-top:24px;">
        <a href="${e(d.urlPedido)}" target="_blank" rel="noopener"
           style="display:inline-block;background:#0d74a9;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:10px;">
          Ver mi pedido
        </a>
      </div>
    </div>
  </div>
</body></html>`
}
