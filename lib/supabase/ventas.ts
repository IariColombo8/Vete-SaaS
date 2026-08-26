import { supabase } from "./config"
import type {
  Caja,
  CajaEstado,
  MedioPago,
  Venta,
  VentaEstado,
  VentaItem,
  ProductoUnidad,
} from "./types"
import type { ItemRPC } from "@/lib/ventas/carrito"

/**
 * Ventas, caja y métricas del mostrador.
 *
 * Igual que `productos.ts`: RLS (`es_staff(tenant_id)`) alcanza para aislar los
 * tenants, así que el cliente lee directo y no hace falta ninguna API route.
 *
 * Lo que NO se hace desde acá es escribir: vender, anular y mover la caja son
 * operaciones de varios pasos que tienen que ser atómicas, así que van por RPC
 * (`registrar_venta`, `anular_venta`, `abrir_caja`, `cerrar_caja`). Las policies
 * de 005_ventas.sql son de `select` solamente, justamente para que no exista la
 * tentación de hacer un update suelto sobre una venta ya cobrada.
 */

type Fila = Record<string, unknown>

function num(v: unknown, porDefecto = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : porDefecto
}

function aVentaItem(f: Fila): VentaItem {
  return {
    id: f.id as string,
    productoId: (f.producto_id as string) ?? undefined,
    nombre: (f.nombre as string) ?? "",
    marca: (f.marca as string) ?? "",
    presentacion: (f.presentacion as string) ?? "",
    unidad: (f.unidad as ProductoUnidad) ?? "un",
    cantidad: num(f.cantidad),
    precioUnitario: num(f.precio_unitario),
    subtotal: num(f.subtotal),
  }
}

function aVenta(f: Fila): Venta {
  const items = f.venta_items as Fila[] | undefined
  const pagos = f.venta_pagos as Fila[] | undefined

  return {
    id: f.id as string,
    numero: num(f.numero),
    cajaId: (f.caja_id as string) ?? undefined,
    clienteId: (f.cliente_id as string) ?? undefined,
    clienteNombre: (f.cliente_nombre as string) ?? "",
    clienteTelefono: (f.cliente_telefono as string) ?? "",
    clienteDni: (f.cliente_dni as string) ?? "",
    clienteDomicilio: (f.cliente_domicilio as string) ?? "",
    medioPago: (f.medio_pago as MedioPago) ?? "efectivo",
    estado: (f.estado as VentaEstado) ?? "completada",
    subtotal: num(f.subtotal),
    descuento: num(f.descuento),
    recargo: num(f.recargo),
    cuotas: f.cuotas != null ? num(f.cuotas) : undefined,
    total: num(f.total),
    anuladaAt: (f.anulada_at as string) ?? undefined,
    anuladaMotivo: (f.anulada_motivo as string) ?? undefined,
    vendedorNombre: (f.vendedor_nombre as string) ?? undefined,
    observaciones: (f.observaciones as string) ?? "",
    createdAt: (f.created_at as string) ?? "",
    esPagoCtaCte: Boolean(f.es_pago_cta_cte),
    items: items ? items.map(aVentaItem) : undefined,
    pagos: pagos
      ? pagos.map((p) => ({ medioPago: p.medio_pago as MedioPago, monto: num(p.monto) }))
      : undefined,
  }
}

function aCaja(f: Fila): Caja {
  return {
    id: f.id as string,
    estado: (f.estado as CajaEstado) ?? "abierta",
    saldoInicial: num(f.saldo_inicial),
    saldoDeclarado: f.saldo_declarado != null ? num(f.saldo_declarado) : undefined,
    saldoEsperado: f.saldo_esperado != null ? num(f.saldo_esperado) : undefined,
    diferencia: f.diferencia != null ? num(f.diferencia) : undefined,
    totalEfectivo: num(f.total_efectivo),
    totalOtros: num(f.total_otros),
    totalVentas: num(f.total_ventas),
    cantidadVentas: num(f.cantidad_ventas),
    abiertaPorNombre: (f.abierta_por_nombre as string) ?? undefined,
    cerradaPorNombre: (f.cerrada_por_nombre as string) ?? undefined,
    observaciones: (f.observaciones as string) ?? "",
    aperturaAt: (f.apertura_at as string) ?? "",
    cierreAt: (f.cierre_at as string) ?? undefined,
  }
}

const VENTA_COLS = "*, venta_items(*), venta_pagos(*)"

// ── Registrar la venta ──

export interface RegistrarVentaInput {
  items: ItemRPC[]
  medioPago: MedioPago
  clienteId?: string
  descuento?: number
  observaciones?: string
  /** Recargo de débito/crédito, ya en pesos. */
  recargo?: number
  /** Solo cuando medioPago === "credito". */
  cuotas?: number
  /** Obligatorio cuando medioPago === "mixto". */
  pagos?: { medioPago: MedioPago; monto: number }[]
}

export interface ResultadoVenta {
  ventaId: string
  numero: number
  subtotal: number
  descuento: number
  total: number
}

/**
 * Cobra la venta: valida stock, descuenta, numera y guarda, todo en una sola
 * transacción. Si algo falla no queda nada a medio hacer.
 *
 * Los mensajes de error de la RPC están escritos para mostrarse tal cual en
 * pantalla ("No hay stock suficiente de X"), así que se dejan pasar sin traducir.
 */
export async function registrarVenta(
  tenantId: string,
  input: RegistrarVentaInput,
): Promise<ResultadoVenta> {
  const { data, error } = await supabase.rpc("registrar_venta", {
    p_tenant_id: tenantId,
    p_items: input.items,
    p_medio_pago: input.medioPago,
    p_cliente_id: input.clienteId ?? null,
    p_descuento: input.descuento ?? 0,
    p_observaciones: input.observaciones ?? null,
    p_recargo: input.recargo ?? 0,
    p_cuotas: input.cuotas ?? null,
    p_pagos: input.pagos?.map((p) => ({ medio_pago: p.medioPago, monto: p.monto })) ?? null,
  })

  if (error) throw new Error(error.message)

  const r = data as Fila
  return {
    ventaId: r.venta_id as string,
    numero: num(r.numero),
    subtotal: num(r.subtotal),
    descuento: num(r.descuento),
    total: num(r.total),
  }
}

/** Devuelve el stock y marca la venta. No se borra: el correlativo no puede saltear números. */
export async function anularVenta(ventaId: string, motivo?: string): Promise<void> {
  const { error } = await supabase.rpc("anular_venta", {
    p_venta_id: ventaId,
    p_motivo: motivo ?? null,
  })
  if (error) throw new Error(error.message)
}

// ── Consultas ──

export async function getVenta(tenantId: string, id: string): Promise<Venta | null> {
  const { data } = await supabase
    .from("ventas").select(VENTA_COLS)
    .eq("tenant_id", tenantId).eq("id", id)
    .maybeSingle()
  return data ? aVenta(data) : null
}

export interface VentasFiltro {
  /** YYYY-MM-DD inclusive. */
  desde?: string
  /** YYYY-MM-DD inclusive: se convierte al final del día. */
  hasta?: string
  medioPago?: MedioPago
  estado?: VentaEstado
  clienteId?: string
  pagina?: number
  porPagina?: number
}

export interface VentasPagina {
  ventas: Venta[]
  total: number
}

/** Fin del día local en ISO, para que "hasta el 23" incluya al 23 entero. */
function finDelDia(fecha: string): string {
  return new Date(`${fecha}T23:59:59.999`).toISOString()
}

function inicioDelDia(fecha: string): string {
  return new Date(`${fecha}T00:00:00.000`).toISOString()
}

export async function getVentas(
  tenantId: string,
  filtro: VentasFiltro = {},
): Promise<VentasPagina> {
  const porPagina = filtro.porPagina ?? 25
  const pagina = filtro.pagina ?? 0

  let q = supabase
    .from("ventas")
    .select(VENTA_COLS, { count: "exact" })
    .eq("tenant_id", tenantId)

  if (filtro.desde) q = q.gte("created_at", inicioDelDia(filtro.desde))
  if (filtro.hasta) q = q.lte("created_at", finDelDia(filtro.hasta))
  if (filtro.medioPago) q = q.eq("medio_pago", filtro.medioPago)
  if (filtro.estado) q = q.eq("estado", filtro.estado)
  if (filtro.clienteId) q = q.eq("cliente_id", filtro.clienteId)

  const desde = pagina * porPagina
  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .range(desde, desde + porPagina - 1)

  if (error) {
    console.error("Error listando ventas:", error.message)
    return { ventas: [], total: 0 }
  }

  return { ventas: (data ?? []).map(aVenta), total: count ?? 0 }
}

/** Todas las ventas de una caja, para el resumen del turno y el PDF de cierre. */
export async function getVentasDeCaja(tenantId: string, cajaId: string): Promise<Venta[]> {
  const { data, error } = await supabase
    .from("ventas")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("caja_id", cajaId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Error listando ventas de la caja:", error.message)
    return []
  }

  return (data ?? []).map(aVenta)
}

// ── Caja ──

export async function getCajaAbierta(tenantId: string): Promise<Caja | null> {
  const { data } = await supabase
    .from("cajas").select("*")
    .eq("tenant_id", tenantId).eq("estado", "abierta")
    .maybeSingle()
  return data ? aCaja(data) : null
}

export async function getCajas(tenantId: string, limite = 20): Promise<Caja[]> {
  const { data } = await supabase
    .from("cajas").select("*")
    .eq("tenant_id", tenantId)
    .order("apertura_at", { ascending: false })
    .limit(limite)
  return (data ?? []).map(aCaja)
}

export async function abrirCaja(tenantId: string, saldoInicial: number): Promise<string> {
  const { data, error } = await supabase.rpc("abrir_caja", {
    p_tenant_id: tenantId,
    p_saldo_inicial: saldoInicial,
  })
  if (error) throw new Error(error.message)
  return (data as Fila).caja_id as string
}

export interface ResultadoCierre {
  saldoEsperado: number
  saldoDeclarado: number
  diferencia: number
  totalEfectivo: number
  totalOtros: number
  totalVentas: number
  cantidadVentas: number
}

export async function cerrarCaja(
  cajaId: string,
  saldoDeclarado: number,
  observaciones?: string,
): Promise<ResultadoCierre> {
  const { data, error } = await supabase.rpc("cerrar_caja", {
    p_caja_id: cajaId,
    p_saldo_declarado: saldoDeclarado,
    p_observaciones: observaciones ?? null,
  })
  if (error) throw new Error(error.message)

  const r = data as Fila
  return {
    saldoEsperado: num(r.saldo_esperado),
    saldoDeclarado: num(r.saldo_declarado),
    diferencia: num(r.diferencia),
    totalEfectivo: num(r.total_efectivo),
    totalOtros: num(r.total_otros),
    totalVentas: num(r.total_ventas),
    cantidadVentas: num(r.cantidad_ventas),
  }
}

/**
 * Resumen en vivo de la caja abierta. El cierre recalcula esto mismo en la base;
 * acá se hace en el navegador para poder mostrarlo sin cerrar nada.
 */
export interface ResumenCaja {
  totalEfectivo: number
  totalOtros: number
  totalVentas: number
  cantidadVentas: number
  saldoEsperado: number
  /** Facturación por medio de pago, incluido efectivo. */
  porMedioPago: { medio: MedioPago; total: number }[]
}

export async function getResumenCaja(caja: Caja): Promise<ResumenCaja> {
  const { data } = await supabase
    .from("ventas").select("id, medio_pago, total")
    .eq("caja_id", caja.id).eq("estado", "completada")

  const ventas = (data ?? []) as Fila[]
  const idsMixtos = ventas.filter((f) => f.medio_pago === "mixto").map((f) => f.id as string)

  // La parte en efectivo de un "mixto" cuenta como efectivo: sin desglosarla,
  // un cobro de $500 efectivo + $500 tarjeta quedaba entero afuera del cajón.
  const efectivoPorMixto = new Map<string, number>()
  if (idsMixtos.length > 0) {
    const { data: pagos } = await supabase
      .from("venta_pagos")
      .select("venta_id, medio_pago, monto")
      .in("venta_id", idsMixtos)
    for (const p of (pagos ?? []) as Fila[]) {
      const ventaId = p.venta_id as string
      const monto = num(p.monto)
      if (p.medio_pago === "efectivo") {
        efectivoPorMixto.set(ventaId, (efectivoPorMixto.get(ventaId) ?? 0) + monto)
      }
    }
  }

  const porMedio = new Map<MedioPago, number>()
  let efectivo = 0
  let otros = 0

  for (const f of ventas) {
    const total = num(f.total)
    const medio = f.medio_pago as MedioPago
    porMedio.set(medio, (porMedio.get(medio) ?? 0) + total)

    if (medio === "mixto") {
      const efectivoDeEstaVenta = efectivoPorMixto.get(f.id as string) ?? 0
      efectivo += efectivoDeEstaVenta
      otros += total - efectivoDeEstaVenta
    } else if (medio === "efectivo") {
      efectivo += total
    } else {
      otros += total
    }
  }

  return {
    totalEfectivo: efectivo,
    totalOtros: otros,
    totalVentas: efectivo + otros,
    cantidadVentas: (data ?? []).length,
    saldoEsperado: caja.saldoInicial + efectivo,
    porMedioPago: [...porMedio.entries()].map(([medio, total]) => ({ medio, total })),
  }
}

// ── Métricas del dashboard ──

export interface MetricasVentas {
  facturacion: number
  cantidadVentas: number
  ticketPromedio: number
  /** Facturación por medio de pago, para el gráfico de composición. */
  porMedioPago: { medio: MedioPago; total: number }[]
  /** Un punto por día del período, ya ordenado. */
  porDia: { fecha: string; total: number; ventas: number }[]
  topProductos: { nombre: string; cantidad: number; total: number }[]
}

/**
 * Todo el dashboard con dos consultas: la cabecera de las ventas del período y
 * los items de esas ventas. La agregación se hace en el navegador — con el
 * volumen de una veterinaria son cientos de filas, no millones, y evita tener
 * que mantener una vista materializada por cada métrica.
 */
export async function getMetricasVentas(
  tenantId: string,
  desde: string,
  hasta: string,
): Promise<MetricasVentas> {
  const vacio: MetricasVentas = {
    facturacion: 0,
    cantidadVentas: 0,
    ticketPromedio: 0,
    porMedioPago: [],
    porDia: [],
    topProductos: [],
  }

  const { data, error } = await supabase
    .from("ventas")
    .select("id, medio_pago, total, created_at")
    .eq("tenant_id", tenantId)
    .eq("estado", "completada")
    .gte("created_at", inicioDelDia(desde))
    .lte("created_at", finDelDia(hasta))

  if (error) {
    console.error("Error calculando métricas de ventas:", error.message)
    return vacio
  }

  const ventas = (data ?? []) as Fila[]
  if (ventas.length === 0) return vacio

  const porMedio = new Map<MedioPago, number>()
  const porDia = new Map<string, { total: number; ventas: number }>()
  let facturacion = 0

  for (const v of ventas) {
    const total = num(v.total)
    facturacion += total

    const medio = (v.medio_pago as MedioPago) ?? "efectivo"
    porMedio.set(medio, (porMedio.get(medio) ?? 0) + total)

    // Se agrupa por día local, no UTC: una venta de las 22 h no puede aparecer
    // en el día siguiente.
    const d = new Date(v.created_at as string)
    const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const acum = porDia.get(dia) ?? { total: 0, ventas: 0 }
    porDia.set(dia, { total: acum.total + total, ventas: acum.ventas + 1 })
  }

  const topProductos = await getTopProductos(
    ventas.map((v) => v.id as string),
  )

  return {
    facturacion,
    cantidadVentas: ventas.length,
    ticketPromedio: facturacion / ventas.length,
    porMedioPago: [...porMedio.entries()]
      .map(([medio, total]) => ({ medio, total }))
      .sort((a, b) => b.total - a.total),
    porDia: [...porDia.entries()]
      .map(([fecha, v]) => ({ fecha, ...v }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    topProductos,
  }
}

/** Los 8 productos que más facturaron dentro de un conjunto de ventas. */
async function getTopProductos(
  ventaIds: string[],
): Promise<MetricasVentas["topProductos"]> {
  if (ventaIds.length === 0) return []

  const { data } = await supabase
    .from("venta_items")
    .select("nombre, marca, cantidad, subtotal")
    .in("venta_id", ventaIds)

  const acumulado = new Map<string, { cantidad: number; total: number }>()

  for (const f of (data ?? []) as Fila[]) {
    // Se agrupa por el nombre congelado, no por producto_id: si el producto se
    // borró del catálogo igual queremos verlo en el ranking histórico.
    const nombre = [f.marca as string, f.nombre as string].filter(Boolean).join(" ")
    const acum = acumulado.get(nombre) ?? { cantidad: 0, total: 0 }
    acumulado.set(nombre, {
      cantidad: acum.cantidad + num(f.cantidad),
      total: acum.total + num(f.subtotal),
    })
  }

  return [...acumulado.entries()]
    .map(([nombre, v]) => ({ nombre, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
}
