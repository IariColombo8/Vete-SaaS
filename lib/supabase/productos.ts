import { supabase } from "./config"
import type {
  AjusteStockTipo,
  CambioPrecio,
  MovimientoStock,
  OfertaTipo,
  Producto,
  ProductoUnidad,
} from "./types"

/**
 * Productos y stock. Port de la parte de catálogo del POS del kiosko.
 *
 * A diferencia del original, acá no hay API routes con service_role: RLS
 * (`es_staff(tenant_id)`) alcanza para aislar los tenants, así que el cliente
 * consulta y escribe directo, igual que `clientes.ts` o `turnos.ts`.
 *
 * Las dos operaciones que tienen que ser atómicas —mover stock e importar un
 * lote— van por RPC (`ajustar_stock`, `importar_productos`).
 */

type Fila = Record<string, unknown>

function num(v: unknown, porDefecto = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : porDefecto
}

function aProducto(f: Fila): Producto {
  return {
    id: f.id as string,
    codigo: (f.codigo as string) ?? undefined,
    codigoBarras: (f.codigo_barras as string) ?? undefined,
    nombre: (f.nombre as string) ?? "",
    descripcion: (f.descripcion as string) ?? "",
    categoria: (f.categoria as string) ?? "",
    imagenUrl: (f.imagen_url as string) ?? undefined,
    precio: num(f.precio),
    costo: f.costo != null ? num(f.costo) : undefined,
    stock: num(f.stock),
    stockMinimo: num(f.stock_minimo),
    controlaStock: (f.controla_stock as boolean) ?? true,
    unidad: (f.unidad as ProductoUnidad) ?? "un",
    unidadesPorBulto: f.unidades_por_bulto != null ? num(f.unidades_por_bulto) : undefined,
    marca: (f.marca as string) ?? undefined,
    linea: (f.linea as string) ?? undefined,
    pesoKg: f.peso_kg != null ? num(f.peso_kg) : undefined,
    fechaVencimiento: (f.fecha_vencimiento as string) ?? undefined,
    ofertaActiva: (f.oferta_activa as boolean) ?? false,
    ofertaTipo: (f.oferta_tipo as OfertaTipo) ?? undefined,
    ofertaValor: num(f.oferta_valor),
    ofertaCantidad: f.oferta_cantidad != null ? num(f.oferta_cantidad) : undefined,
    activo: (f.activo as boolean) ?? true,
    revisar: (f.revisar as boolean) ?? false,
    createdAt: (f.created_at as string) ?? undefined,
    updatedAt: (f.updated_at as string) ?? undefined,
  }
}

/** Campos editables desde el panel. `undefined` = no tocar esa columna. */
export interface ProductoInput {
  codigo?: string
  codigoBarras?: string
  nombre: string
  descripcion?: string
  categoria?: string
  /** URL pública de la foto. Vacío = sin foto. */
  imagenUrl?: string
  precio: number
  costo?: number
  stockMinimo?: number
  controlaStock?: boolean
  unidad?: ProductoUnidad
  unidadesPorBulto?: number
  /** Marca del alimento. Alimenta el selector guiado del mostrador. */
  marca?: string
  /** Línea dentro de la marca ("Adulto Mediano"). */
  linea?: string
  /** Kilos de la bolsa cerrada. Solo con unidad "un". */
  pesoKg?: number
  /** YYYY-MM-DD */
  fechaVencimiento?: string
  activo?: boolean
  revisar?: boolean
  /** Solo en alta: después se mueve con `ajustarStock` para dejar rastro. */
  stockInicial?: number
}

/**
 * Texto vacío → null. Los índices únicos de código son parciales sobre
 * `not null and <> ''`, así que mandar "" haría chocar a dos productos sin código.
 */
function nulificar(v: string | undefined): string | null {
  const s = (v ?? "").trim()
  return s === "" ? null : s
}

function aFila(input: ProductoInput): Record<string, unknown> {
  const fila: Record<string, unknown> = {
    nombre: input.nombre.trim(),
    precio: input.precio,
  }
  if (input.codigo !== undefined) fila.codigo = nulificar(input.codigo)
  if (input.codigoBarras !== undefined) fila.codigo_barras = nulificar(input.codigoBarras)
  if (input.descripcion !== undefined) fila.descripcion = input.descripcion.trim()
  if (input.categoria !== undefined) fila.categoria = input.categoria.trim()
  if (input.imagenUrl !== undefined) fila.imagen_url = nulificar(input.imagenUrl)
  if (input.costo !== undefined) fila.costo = input.costo ?? null
  if (input.stockMinimo !== undefined) fila.stock_minimo = input.stockMinimo
  if (input.controlaStock !== undefined) fila.controla_stock = input.controlaStock
  if (input.unidad !== undefined) fila.unidad = input.unidad
  if (input.unidadesPorBulto !== undefined) fila.unidades_por_bulto = input.unidadesPorBulto ?? null
  if (input.marca !== undefined) fila.marca = nulificar(input.marca)
  if (input.linea !== undefined) fila.linea = nulificar(input.linea)
  if (input.pesoKg !== undefined) fila.peso_kg = input.pesoKg || null
  if (input.fechaVencimiento !== undefined) fila.fecha_vencimiento = nulificar(input.fechaVencimiento)
  if (input.activo !== undefined) fila.activo = input.activo
  if (input.revisar !== undefined) fila.revisar = input.revisar
  return fila
}

/** Traduce los errores de Postgres a algo que se pueda mostrar en pantalla. */
function mensajeError(error: { message: string; code?: string }, accion: string): Error {
  if (error.code === "23505") {
    return new Error("Ya existe un producto con ese código o código de barras")
  }
  if (error.message.includes("productos_oferta_ck")) {
    return new Error("La oferta no es válida: revisá el tipo y el valor")
  }
  return new Error(`${accion}: ${error.message}`)
}

const COLS = "*"

// ── Listado ──

export interface ProductosFiltro {
  busqueda?: string
  categoria?: string
  /** Solo los que están en o por debajo del mínimo (incluye agotados). */
  soloStockBajo?: boolean
  soloAgotados?: boolean
  soloRevisar?: boolean
  /** Por defecto se ocultan los productos dados de baja. */
  incluirInactivos?: boolean
  pagina?: number
  porPagina?: number
}

export interface ProductosPagina {
  productos: Producto[]
  total: number
}

/** Escapa lo que rompe el parser de `.or()` de PostgREST (comas y paréntesis). */
function limpiarBusqueda(q: string): string {
  return q.trim().replace(/[,()]/g, " ").replace(/\s+/g, " ")
}

export async function getProductos(
  tenantId: string,
  filtro: ProductosFiltro = {},
): Promise<ProductosPagina> {
  const porPagina = filtro.porPagina ?? 30
  const pagina = filtro.pagina ?? 0

  let q = supabase
    .from("productos")
    .select(COLS, { count: "exact" })
    .eq("tenant_id", tenantId)

  if (!filtro.incluirInactivos) q = q.eq("activo", true)
  if (filtro.categoria) q = q.eq("categoria", filtro.categoria)
  if (filtro.soloRevisar) q = q.eq("revisar", true)

  // `soloAgotados` es más específico que `soloStockBajo`, así que gana.
  // `stock_bajo` es una columna generada en la base (ver 004_productos.sql).
  if (filtro.soloAgotados) {
    q = q.eq("controla_stock", true).lte("stock", 0)
  } else if (filtro.soloStockBajo) {
    q = q.eq("stock_bajo", true).gt("stock", 0)
  }

  const busqueda = limpiarBusqueda(filtro.busqueda ?? "")
  if (busqueda) {
    q = q.or(
      `nombre.ilike.%${busqueda}%,marca.ilike.%${busqueda}%,linea.ilike.%${busqueda}%,` +
        `codigo.ilike.%${busqueda}%,codigo_barras.ilike.%${busqueda}%`,
    )
  }

  const desde = pagina * porPagina
  const { data, error, count } = await q
    .order("nombre")
    .range(desde, desde + porPagina - 1)

  if (error) {
    console.error("Error listando productos:", error.message)
    return { productos: [], total: 0 }
  }

  return { productos: (data ?? []).map(aProducto), total: count ?? 0 }
}

export async function getProducto(tenantId: string, id: string): Promise<Producto | null> {
  const { data } = await supabase
    .from("productos").select(COLS)
    .eq("tenant_id", tenantId).eq("id", id)
    .maybeSingle()
  return data ? aProducto(data) : null
}

/** Búsqueda exacta por código de barras o código interno (para el lector). */
export async function getProductoPorCodigo(
  tenantId: string,
  codigo: string,
): Promise<Producto | null> {
  const c = codigo.trim()
  if (!c) return null
  const { data } = await supabase
    .from("productos").select(COLS)
    .eq("tenant_id", tenantId)
    .or(`codigo_barras.eq.${c},codigo.eq.${c}`)
    .limit(1).maybeSingle()
  return data ? aProducto(data) : null
}

export async function getCategorias(tenantId: string): Promise<string[]> {
  const { data } = await supabase
    .from("productos").select("categoria")
    .eq("tenant_id", tenantId).eq("activo", true)
    .not("categoria", "eq", "")

  const unicas = new Set((data ?? []).map((f) => (f as Fila).categoria as string))
  return [...unicas].filter(Boolean).sort((a, b) => a.localeCompare(b, "es"))
}

// ── Tarjetas del encabezado ──

export interface StockStats {
  total: number
  stockBajo: number
  agotados: number
  revisar: number
}

/**
 * Contadores de las tarjetas. Son 4 `count` sin traer filas: más barato que
 * bajar el catálogo entero para contarlo en el navegador.
 */
export async function getStockStats(tenantId: string): Promise<StockStats> {
  const base = () =>
    supabase
      .from("productos")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("activo", true)

  const [total, bajo, agotados, revisar] = await Promise.all([
    base(),
    base().eq("stock_bajo", true).gt("stock", 0),
    base().eq("controla_stock", true).lte("stock", 0),
    base().eq("revisar", true),
  ])

  return {
    total: total.count ?? 0,
    stockBajo: bajo.count ?? 0,
    agotados: agotados.count ?? 0,
    revisar: revisar.count ?? 0,
  }
}

/** Productos que vencen dentro de `dias` (incluye los ya vencidos). */
export async function getVencimientosProximos(
  tenantId: string,
  dias = 30,
): Promise<Producto[]> {
  const limite = new Date()
  limite.setDate(limite.getDate() + dias)

  const { data } = await supabase
    .from("productos").select(COLS)
    .eq("tenant_id", tenantId).eq("activo", true)
    .not("fecha_vencimiento", "is", null)
    .lte("fecha_vencimiento", limite.toISOString().slice(0, 10))
    .order("fecha_vencimiento")

  return (data ?? []).map(aProducto)
}

// ── Alta / edición ──

export async function createProducto(
  tenantId: string,
  input: ProductoInput,
): Promise<Producto> {
  const { data, error } = await supabase
    .from("productos")
    .insert({ ...aFila(input), tenant_id: tenantId, stock: input.stockInicial ?? 0 })
    .select(COLS)
    .single()

  if (error) throw mensajeError(error, "No se pudo crear el producto")
  return aProducto(data)
}

/**
 * Edita los datos del producto. El stock NO se toca acá a propósito: se mueve
 * con `ajustarStock` para que quede el movimiento registrado.
 */
export async function updateProducto(
  tenantId: string,
  id: string,
  input: ProductoInput,
): Promise<void> {
  const { error } = await supabase
    .from("productos").update(aFila(input))
    .eq("tenant_id", tenantId).eq("id", id)

  if (error) throw mensajeError(error, "No se pudo actualizar el producto")
}

/**
 * Baja lógica. No se borra la fila: los movimientos de stock y la auditoría
 * cuelgan de ella con `on delete cascade` y son el historial del negocio.
 */
export async function desactivarProducto(tenantId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from("productos").update({ activo: false })
    .eq("tenant_id", tenantId).eq("id", id)
  if (error) throw mensajeError(error, "No se pudo dar de baja el producto")
}

// ── Ofertas ──

export interface OfertaInput {
  activa: boolean
  tipo?: OfertaTipo
  valor?: number
  cantidad?: number
}

export async function setOferta(
  tenantId: string,
  id: string,
  oferta: OfertaInput,
): Promise<void> {
  const fila = oferta.activa
    ? {
        oferta_activa: true,
        oferta_tipo: oferta.tipo ?? "monto",
        oferta_valor: oferta.valor ?? 0,
        oferta_cantidad: oferta.tipo === "combo" ? (oferta.cantidad ?? null) : null,
      }
    : // Al desactivar se limpia todo: una oferta apagada con valores viejos
      // reaparece intacta si alguien vuelve a prender el switch sin mirar.
      { oferta_activa: false, oferta_tipo: null, oferta_valor: 0, oferta_cantidad: null }

  const { error } = await supabase
    .from("productos").update(fila)
    .eq("tenant_id", tenantId).eq("id", id)

  if (error) throw mensajeError(error, "No se pudo guardar la oferta")
}

// ── Stock ──

export interface ResultadoAjuste {
  stockAnterior: number
  stockNuevo: number
}

/**
 * Mueve el stock de forma atómica y deja el movimiento registrado.
 * `cantidad` es el nuevo total cuando el tipo es "ajuste"; en el resto es
 * cuánto entra o sale.
 */
export async function ajustarStock(
  productoId: string,
  tipo: AjusteStockTipo,
  cantidad: number,
  referencia?: string,
): Promise<ResultadoAjuste> {
  const { data, error } = await supabase.rpc("ajustar_stock", {
    p_producto_id: productoId,
    p_tipo: tipo,
    p_cantidad: cantidad,
    p_referencia: referencia ?? null,
  })

  if (error) throw new Error(error.message)

  const r = data as { stock_anterior: number; stock_nuevo: number }
  return { stockAnterior: num(r.stock_anterior), stockNuevo: num(r.stock_nuevo) }
}

export async function getMovimientos(
  tenantId: string,
  productoId: string,
  limite = 20,
): Promise<MovimientoStock[]> {
  const { data } = await supabase
    .from("stock_movimientos")
    .select("id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia, usuario_nombre, fecha")
    .eq("tenant_id", tenantId).eq("producto_id", productoId)
    .order("fecha", { ascending: false })
    .limit(limite)

  return (data ?? []).map((f: Fila) => ({
    id: f.id as string,
    productoId: f.producto_id as string,
    tipo: f.tipo as MovimientoStock["tipo"],
    cantidad: num(f.cantidad),
    stockAnterior: f.stock_anterior != null ? num(f.stock_anterior) : undefined,
    stockNuevo: f.stock_nuevo != null ? num(f.stock_nuevo) : undefined,
    referencia: (f.referencia as string) ?? undefined,
    usuarioNombre: (f.usuario_nombre as string) ?? undefined,
    fecha: f.fecha as string,
  }))
}

// ── Auditoría de precios ──

/**
 * Historial de cambios de precio. Lo escribe un trigger en la base, no la app:
 * ningún cambio se puede saltear la auditoría.
 */
export async function getHistorialPrecio(
  tenantId: string,
  productoId: string,
  limite = 10,
): Promise<CambioPrecio[]> {
  const { data } = await supabase
    .from("producto_auditoria")
    .select("id, campo, valor_anterior, valor_nuevo, usuario_nombre, fecha")
    .eq("tenant_id", tenantId).eq("producto_id", productoId)
    .order("fecha", { ascending: false })
    .limit(limite)

  return (data ?? []).map((f: Fila) => ({
    id: f.id as string,
    campo: f.campo as string,
    valorAnterior: (f.valor_anterior as string) ?? "",
    valorNuevo: (f.valor_nuevo as string) ?? "",
    usuarioNombre: (f.usuario_nombre as string) ?? undefined,
    fecha: f.fecha as string,
  }))
}

// ── Importación masiva ──

/** Una fila de la lista de precios, ya parseada y lista para mandar a la RPC. */
export interface FilaImportacion {
  barra: string
  codigo: string
  descripcion: string
  precio: number
  costo?: number
  rubro: string
  subrubro: string
  stock: number
  bulto?: number
  revisar: boolean
}

export type EstrategiaStock = "no_tocar" | "reemplazar" | "sumar" | "solo_nuevos"

export interface ResumenImportacion {
  creados: number
  actualizados: number
  omitidos: number
  conAdvertencias: number
  /** Filas que la base rechazó (ej: código repetido dentro del mismo Excel). */
  errores: number
  /** Mensaje de la primera fila que falló, para poder diagnosticar. */
  primerError?: string
}

/**
 * Importa un lote de filas en una sola transacción.
 *
 * Se manda de a tandas desde el llamador para no pasarse del tamaño máximo de
 * request ni del tiempo de la función; cada tanda es atómica por separado.
 */
export async function importarProductos(
  tenantId: string,
  filas: FilaImportacion[],
  estrategia: EstrategiaStock,
): Promise<ResumenImportacion> {
  const { data, error } = await supabase.rpc("importar_productos", {
    p_tenant_id: tenantId,
    p_filas: filas,
    p_estrategia: estrategia,
  })

  if (error) throw new Error(`No se pudo importar: ${error.message}`)

  const r = (data ?? {}) as Partial<ResumenImportacion>
  return {
    creados: r.creados ?? 0,
    actualizados: r.actualizados ?? 0,
    omitidos: r.omitidos ?? 0,
    conAdvertencias: r.conAdvertencias ?? 0,
    errores: r.errores ?? 0,
    primerError: r.primerError ?? undefined,
  }
}

// ── Selector de alimento del mostrador ──

/**
 * Todos los productos que tienen marca cargada, en una sola consulta.
 *
 * El selector es "marca → línea → presentación" y se navega para adelante y
 * para atrás varias veces por venta. Traer el árbol entero de una y armarlo en
 * memoria es más rápido y más simple que pegarle a la base en cada paso: una
 * veterinaria tiene decenas de alimentos, no miles.
 */
export async function getAlimentos(tenantId: string): Promise<Producto[]> {
  const { data, error } = await supabase
    .from("productos").select(COLS)
    .eq("tenant_id", tenantId).eq("activo", true)
    .not("marca", "is", null).not("marca", "eq", "")
    .order("marca").order("linea").order("peso_kg")

  if (error) {
    console.error("Error listando alimentos:", error.message)
    return []
  }

  return (data ?? []).map(aProducto)
}

/** Marca → líneas → presentaciones. Lo que consume el selector guiado. */
export interface MarcaAlimento {
  marca: string
  lineas: { linea: string; presentaciones: Producto[] }[]
}

/**
 * Agrupa el listado plano en el árbol del selector. Puro: recibe los productos
 * ya cargados, así que el POS puede reagrupar sin volver a consultar.
 */
export function agruparPorMarca(productos: Producto[]): MarcaAlimento[] {
  const porMarca = new Map<string, Map<string, Producto[]>>()

  for (const p of productos) {
    const marca = (p.marca ?? "").trim()
    if (!marca) continue
    // Los alimentos sin línea igual tienen que aparecer: van bajo la marca sola.
    const linea = (p.linea ?? "").trim()

    const lineas = porMarca.get(marca) ?? new Map<string, Producto[]>()
    lineas.set(linea, [...(lineas.get(linea) ?? []), p])
    porMarca.set(marca, lineas)
  }

  return [...porMarca.entries()]
    .map(([marca, lineas]) => ({
      marca,
      lineas: [...lineas.entries()]
        .map(([linea, presentaciones]) => ({ linea, presentaciones }))
        .sort((a, b) => a.linea.localeCompare(b.linea, "es")),
    }))
    .sort((a, b) => a.marca.localeCompare(b.marca, "es"))
}
