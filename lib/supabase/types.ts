/**
 * Tipos del dominio. Portados desde `lib/firebase/types.ts` sin cambios de forma,
 * para que los ~61 componentes consumidores no se enteren de la migración.
 *
 * Única diferencia: `ClientesCursor` ya no es un snapshot de Firestore.
 */

// ── Roles / usuarios ──
export type UserRole = "superadmin" | "veterinario" | "empleado" | "usuario"

export interface Usuario {
  uid: string
  email: string | null
  displayName?: string | null
  photoURL?: string | null
  role: UserRole
  tenantId?: string
  /** @deprecated usar role */
  isAdmin?: boolean
  createdAt?: unknown
  lastLogin?: unknown
}

// ── Invitaciones ──
export interface Invitacion {
  id?: string
  email: string
  tenantId: string
  role: "veterinario" | "empleado"
  estado: "pendiente" | "aceptada"
  invitedBy?: string
  createdAt?: unknown
}

// ── Tenant ──
export interface ServicioTenant {
  emoji: string
  nombre: string
  descripcion?: string
}

export interface HorarioTenant {
  dia: string
  apertura: string
  cierre: string
  cerrado: boolean
  /** true (default) = horario corrido, false = cierra al mediodia */
  corrido?: boolean
  /** Cierre del primer bloque (ej: 12:00) — solo cuando corrido === false */
  cierre1?: string
  /** Apertura del segundo bloque (ej: 16:00) — solo cuando corrido === false */
  apertura2?: string
}

export interface Tenant {
  slug: string
}

/** "local" = atiende en consultorio, "domicilio" = va a la casa, "ambos" = las dos */
export type Modalidad = "local" | "domicilio" | "ambos"

// ── Turno config ──
export interface MascotaTurnoConfig {
  id: string
  emoji: string
  nombre: string
}

export interface ServicioTurnoConfig {
  id: string
  emoji: string
  nombre: string
  descripcion?: string
  /** Duración del turno en minutos (default 60). Define cuántos slots ocupa. */
  duracionMin?: number
}

export interface Profesional {
  id: string
  nombre: string
  /** false = no recibe turnos nuevos. Default true. */
  activo?: boolean
}

export interface VacunaTurnoConfig {
  id: string
  nombre: string
  descripcion?: string
}

export interface TurnoConfig {
  mascotas?: MascotaTurnoConfig[]
  servicios?: ServicioTurnoConfig[]
  /** Vacunas agrupadas por tipo de mascota: { perro: [...], gato: [...] } */
  vacunas?: Record<string, VacunaTurnoConfig[]>
  /** Profesionales con agendas independientes. Vacío/ausente = agenda única. */
  profesionales?: Profesional[]
}

export interface TenantConfig {
  nombre?: string
  plan?: "basico" | "plus" | "pro"
  status?: "activo" | "pausado"
  adminIds?: string[]
  createdAt?: string
  telefono?: string
  email?: string
  direccion?: string
  ciudad?: string
  slogan?: string
  descripcion?: string
  servicios?: ServicioTenant[]
  horarios?: HorarioTenant[]
  fotosHero?: string[]
  fotosHeroMobile?: string[]
  logo?: string
  modalidad?: Modalidad
  googleMapsUrl?: string
  /** Horas mínimas de anticipación para turnos del mismo día (default 2) */
  minHorasAnticipacion?: number
  /** ID del Google Calendar donde se crean los eventos de turno */
  calendarId?: string
  /** Proveedor de email para confirmaciones de turno. Default "resend". */
  emailProvider?: "resend" | "gmail" | "emailjs"
  /** true una vez que el dueño completó (o saltó) el wizard de onboarding. */
  onboardingCompletado?: boolean
  /** Vencimiento del trial de plan Pro. null/undefined = sin trial. */
  trialExpiresAt?: string | null
}

export type TenantFull = Tenant & TenantConfig

// ── Clientes / mascotas / historias ──
export interface HistorialDato {
  campo: string
  valorAnterior: string
  valorNuevo: string
  fechaCambio: string
}

export interface Cliente {
  id?: string
  nombre: string
  telefono: string
  email: string
  dni?: string
  domicilio?: string
  historialDatos?: HistorialDato[]
  createdAt?: string
  updatedAt?: string
}

export interface Mascota {
  id?: string
  nombre: string
  tipo: string
  edad?: string
  raza?: string
  peso?: string
  /** Token aleatorio para la libreta pública por QR (no adivinable). */
  libretaToken?: string
}

export interface Turno {
  id?: string
  clienteId: string
  mascotaId?: string
  cliente: {
    nombre: string
    telefono: string
    email: string
    dni?: string
    domicilio?: string
  }
  mascota: {
    nombre: string
    tipo: string
    motivo?: string
  }
  servicio?: string
  fecha?: string
  hora?: string
  /** Duración del turno en minutos (snapshot del servicio al reservar; default 60). */
  duracionMin?: number
  /** Profesional asignado (agenda independiente). Ausente = agenda única. */
  profesionalId?: string
  profesionalNombre?: string
  turno: {
    fecha: string
    hora: string
    timestamp: unknown
  }
  estado: "pendiente" | "confirmado" | "completado" | "cancelado"
  vacunas?: string[]
  diagnostico?: string
  tratamiento?: string
  medicacion?: string
  observaciones?: string
}

export interface Historia {
  id?: string
  fechaAtencion: string
  motivo?: string
  diagnostico: string
  tratamiento: string
  observaciones?: string
  proximaVisita?: string
  archivos?: string[]
  tipoVisita?: "consulta" | "turno_programado" | "visita_programada"
  turnoId?: string
}

export interface HistoriaClinicaRegistro {
  consultas: unknown[]
  vacunas: unknown[]
  tratamientos: unknown[]
  alergias: unknown[]
  cirugias: unknown[]
  fechaCreacion: string
}

// ── Paginación de clientes ──
/**
 * Cursor opaco de paginación. Antes era un `QueryDocumentSnapshot` de Firestore;
 * ahora es la última fila vista (keyset pagination sobre `order by nombre, id`).
 * Se sigue tratando como valor opaco: guardarlo y devolverlo tal cual.
 */
export type ClientesCursor = { nombre: string; id: string } | null

export interface ClientesStats {
  totalClientes: number
  totalMascotas: number
  clientesNuevosMes: number
}

export interface ClientesPage {
  clientes: Cliente[]
  /** Cursor para la siguiente página; pasar a la próxima llamada. */
  nextCursor: ClientesCursor
  /** true si la página vino llena (probablemente hay más). */
  hasMore: boolean
}

// ── Libreta pública (QR) ──
export interface LibretaPublica {
  token: string
  mascota: { nombre: string; tipo: string; raza?: string; edad?: string }
  vetNombre?: string
  historias: { fecha: string; motivo: string; diagnostico?: string; tratamiento?: string }[]
  generadoEl: string
}

// ── Recordatorios de vacunas ──
export interface RecordatorioVacuna {
  id?: string
  clienteId: string
  mascotaId: string
  mascotaNombre: string
  telefono: string
  vacuna: string
  /** Fecha de la próxima dosis (YYYY-MM-DD). */
  fecha: string
  enviado?: boolean
  createdAt?: string
}

// ── Disponibilidad ──
export interface DiaBloqueado {
  id: string
  fecha?: string
  motivo?: string
}

/** Reemplaza el `Unsubscribe` de Firestore. Misma forma: llamar para cortar. */
export type Unsubscribe = () => void

// ── Productos y stock ──

export type ProductoUnidad = "un" | "kg"
export type OfertaTipo = "monto" | "porcentaje" | "combo"
export type MovimientoStockTipo = "entrada" | "ajuste" | "rotura" | "uso" | "venta"

/** Tipos de movimiento que un usuario puede generar a mano desde el panel. */
export type AjusteStockTipo = Exclude<MovimientoStockTipo, "venta">

export interface Producto {
  id: string
  codigo?: string
  codigoBarras?: string
  nombre: string
  descripcion: string
  categoria: string
  imagenUrl?: string
  precio: number
  /**
   * Precio de lista: lo trae la importación o la carga manual, y NUNCA lo
   * toca "Aplicar ganancia" (esa herramienta solo recalcula `precio`). Es lo
   * que se muestra en "Precio original" en la tabla.
   */
  precioLista: number
  /**
   * % de ganancia aplicado con "Aplicar ganancia". Al reimportar, si está
   * cargado, el precio se recalcula con el costo nuevo y este mismo %.
   * `undefined` = nunca se aplicó, o se editó el precio a mano después.
   */
  margenAplicado?: number
  /** Costo de reposición. Opcional: sin esto no se puede calcular el margen. */
  costo?: number
  stock: number
  stockMinimo: number
  /** false = es un servicio (baño, peluquería): se lista pero no lleva stock. */
  controlaStock: boolean
  /**
   * "un" = se vende por unidad. "kg" = se vende suelto y `precio` es el
   * precio POR KILO: el mostrador pregunta cuántos kg se lleva el cliente.
   */
  unidad: ProductoUnidad
  /** Unidades por bulto cerrado del proveedor (ej: 12 latas por caja). */
  unidadesPorBulto?: number
  /** Marca del alimento ("Royal Canin"). Alimenta el selector del mostrador. */
  marca?: string
  /** Línea dentro de la marca ("Adulto Mediano", "Cachorro"). */
  linea?: string
  /** Kilos de la bolsa cerrada (3, 7.5, 15). Solo tiene sentido con unidad "un". */
  pesoKg?: number
  /** YYYY-MM-DD */
  fechaVencimiento?: string
  ofertaActiva: boolean
  ofertaTipo?: OfertaTipo
  ofertaValor: number
  ofertaCantidad?: number
  /** YYYY-MM-DD. `undefined` = sin vencimiento, dura hasta que se saque a mano. */
  ofertaHasta?: string
  activo: boolean
  /** Lo marca la importación cuando la fila del Excel venía incompleta. */
  revisar: boolean
  /** true = aparece en la vidriera pública del tenant (/[slug]/productos). */
  publicadoEnLanding: boolean
  createdAt?: string
  updatedAt?: string
}

export interface MovimientoStock {
  id: string
  productoId: string
  productoNombre?: string
  tipo: MovimientoStockTipo
  /** Delta con signo: positivo entra, negativo sale. */
  cantidad: number
  stockAnterior?: number
  stockNuevo?: number
  referencia?: string
  usuarioNombre?: string
  fecha: string
}

export interface CambioPrecio {
  id: string
  campo: string
  valorAnterior: string
  valorNuevo: string
  usuarioNombre?: string
  fecha: string
}

// ── Ventas, caja y remitos ──

export type MedioPago =
  | "efectivo" | "transferencia" | "mixto"
  | "debito" | "credito" | "cuenta_corriente"
export type VentaEstado = "completada" | "anulada"
export type CajaEstado = "abierta" | "cerrada"

/**
 * Etiquetas para la UI. Un solo lugar, así el POS y el historial no divergen.
 * El orden es el que usa la grilla de 3 columnas del mostrador: no hace falta
 * un array de layout aparte.
 */
export const MEDIOS_PAGO: { id: MedioPago; label: string }[] = [
  { id: "efectivo", label: "Efectivo" },
  { id: "transferencia", label: "Transferencia" },
  { id: "mixto", label: "Mixto" },
  { id: "debito", label: "Débito" },
  { id: "credito", label: "Crédito" },
  { id: "cuenta_corriente", label: "Cta Cte" },
]

/** Medios de pago válidos para un cobro (excluye mixto y cuenta_corriente). */
export const MEDIOS_PAGO_SIMPLES: { id: MedioPago; label: string }[] =
  MEDIOS_PAGO.filter((m) => m.id !== "mixto" && m.id !== "cuenta_corriente")

/**
 * Una línea de la venta. Los datos del producto van copiados, no referenciados:
 * el remito de hace seis meses tiene que seguir diciendo el precio de entonces.
 */
export interface VentaItem {
  id?: string
  productoId?: string
  nombre: string
  marca: string
  /** "15 kg", "por kg" o vacío. */
  presentacion: string
  unidad: ProductoUnidad
  /** Kilos cuando la unidad es "kg". */
  cantidad: number
  /** Por kilo cuando la unidad es "kg". */
  precioUnitario: number
  /** Ya con la oferta aplicada. */
  subtotal: number
}

export interface Venta {
  id: string
  /** Correlativo por veterinaria. Es el número que sale impreso en el remito. */
  numero: number
  cajaId?: string
  clienteId?: string
  clienteNombre: string
  clienteTelefono: string
  clienteDni: string
  clienteDomicilio: string
  medioPago: MedioPago
  estado: VentaEstado
  subtotal: number
  descuento: number
  /** Recargo de débito/crédito, ya en pesos y sumado al total. */
  recargo: number
  /** Cantidad de cuotas, solo cuando medioPago === "credito". */
  cuotas?: number
  total: number
  anuladaAt?: string
  anuladaMotivo?: string
  vendedorNombre?: string
  observaciones: string
  createdAt: string
  /** Un cobro de cuenta corriente, no una venta de productos (sin items). */
  esPagoCtaCte: boolean
  /** Solo viene cuando se pide el detalle completo. */
  items?: VentaItem[]
  /** Desglose de "mixto". Solo viene cuando se pide el detalle completo. */
  pagos?: { medioPago: MedioPago; monto: number }[]
}

export interface Caja {
  id: string
  estado: CajaEstado
  saldoInicial: number
  saldoDeclarado?: number
  saldoEsperado?: number
  diferencia?: number
  totalEfectivo: number
  totalOtros: number
  totalVentas: number
  cantidadVentas: number
  abiertaPorNombre?: string
  cerradaPorNombre?: string
  observaciones: string
  aperturaAt: string
  cierreAt?: string
}
