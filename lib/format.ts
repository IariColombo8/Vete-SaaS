/**
 * Formato de moneda y fechas, en es-AR.
 *
 * Los `Intl.*Format` se construyen una sola vez a nivel de módulo: crearlos
 * dentro de la función cuesta caro y esto se llama por cada celda de la tabla.
 */

const moneda = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const monedaConDecimales = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
})

const fechaCorta = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

const fechaHora = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

/** Cantidades de stock: hasta 3 decimales, sin ceros de relleno (para los kg). */
const cantidad = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 })

export function formatCurrency(monto: number): string {
  return moneda.format(Number.isFinite(monto) ? monto : 0)
}

export function formatCurrencyDecimals(monto: number): string {
  return monedaConDecimales.format(Number.isFinite(monto) ? monto : 0)
}

export function formatCantidad(n: number): string {
  return cantidad.format(Number.isFinite(n) ? n : 0)
}

function aDate(valor: unknown): Date | null {
  if (!valor) return null
  const d = valor instanceof Date ? valor : new Date(String(valor))
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDate(valor: unknown): string {
  const d = aDate(valor)
  return d ? fechaCorta.format(d) : "—"
}

export function formatDateTime(valor: unknown): string {
  const d = aDate(valor)
  return d ? fechaHora.format(d) : "—"
}

/**
 * Fecha en formato YYYY-MM-DD sin desfase de zona horaria.
 *
 * `new Date("2026-08-23")` se parsea como UTC y en Argentina (UTC-3) muestra
 * el 22. Agregar la hora local evita ese día de menos.
 */
export function formatFechaISO(iso?: string | null): string {
  if (!iso) return "—"
  return formatDate(`${iso.slice(0, 10)}T00:00:00`)
}
