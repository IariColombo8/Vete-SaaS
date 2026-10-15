import "server-only"
import { formatPesos } from "@/lib/plans"
import { DIA_VENCIMIENTO, nombreMes } from "./cobro-manual"
import { layout } from "./emails-trial"

/**
 * Emails del aviso de pago de las veterinarias que pagan en efectivo (058):
 * uno a la veterinaria y un resumen al superadmin. Los manda el cron de
 * billing desde el día 7 si el mes no figura pago, una sola vez por mes.
 */

function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export function emailPagoManualPorVencer(params: {
  nombreVeterinaria: string
  periodo: string
  monto: number
  atrasado: boolean
  urlPlan: string
}): { subject: string; html: string } {
  const mes = nombreMes(params.periodo)
  const nombre = escapar(params.nombreVeterinaria)
  return {
    subject: params.atrasado
      ? `Tu pago de VetPanel de ${mes} está atrasado`
      : `Tu pago de VetPanel de ${mes} vence el ${DIA_VENCIMIENTO}`,
    html: layout(
      params.atrasado ? `El pago de ${mes} está atrasado` : `El pago de ${mes} vence el ${DIA_VENCIMIENTO}`,
      `<p>Hola, equipo de <strong>${nombre}</strong>.</p>
       <p>Todavía no figura el pago de VetPanel de <strong>${mes}</strong>
       (${formatPesos(params.monto)}). Se paga del 1 al ${DIA_VENCIMIENTO} de cada mes, en efectivo o por
       transferencia.</p>
       <p>Si ya lo pagaste, ignorá este mensaje: se registra a mano y puede demorar un poco en figurar.
       Tu panel sigue funcionando normal.</p>`,
      { href: params.urlPlan, texto: "Ver mi plan" },
    ),
  }
}

export function emailResumenImpagos(params: {
  periodo: string
  impagos: { nombre: string; monto: number }[]
  urlPagos: string
}): { subject: string; html: string } {
  const mes = nombreMes(params.periodo)
  const total = params.impagos.reduce((acc, i) => acc + i.monto, 0)
  const filas = params.impagos
    .map((i) => `<li><strong>${escapar(i.nombre)}</strong> — ${formatPesos(i.monto)}</li>`)
    .join("")
  return {
    subject: `${params.impagos.length} ${params.impagos.length === 1 ? "veterinaria no pagó" : "veterinarias no pagaron"} ${mes}`,
    html: layout(
      `Pagos de ${mes} sin registrar`,
      `<p>Se les mandó el aviso de pago a estas veterinarias (pagan en efectivo y no figura el pago):</p>
       <ul>${filas}</ul>
       <p>Total a cobrar: <strong>${formatPesos(total)}</strong>.</p>`,
      { href: params.urlPagos, texto: "Ir a Pagos" },
    ),
  }
}
