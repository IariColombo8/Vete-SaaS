/**
 * Textos de los cartelitos de ayuda del panel (`<Ayuda tema="…" />`).
 *
 * Están todos acá, y no sueltos en cada pantalla, para poder corregirlos en un
 * solo lugar y revisarlos con los veterinarios que usan el sistema. Tono:
 * voseo, una o dos oraciones, sin tecnicismos.
 *
 * Cada texto describe lo que el sistema hace de verdad: si cambia la regla
 * (por ejemplo cómo `cerrar_caja` calcula el esperado), hay que cambiarlo acá.
 */
export const TEXTOS_AYUDA = {
  // ── Caja ──────────────────────────────────────────────────────────────────
  "caja.saldoInicial": {
    titulo: "Saldo inicial",
    texto: "La plata que hay en el cajón al abrir, por ejemplo el cambio. Se suma a lo que cobres en efectivo.",
  },
  "caja.arqueo": {
    titulo: "Arqueo",
    texto: "Contar la plata del cajón y compararla con lo que el sistema calcula que debería haber.",
  },
  "caja.esperado": {
    titulo: "Efectivo esperado",
    texto: "Saldo inicial más lo cobrado en efectivo en este turno, incluida la parte en efectivo de los pagos mixtos. Las ventas anuladas no cuentan.",
  },
  "caja.contado": {
    titulo: "Efectivo contado",
    texto: "Lo que contaste en el cajón al cerrar. La diferencia con el esperado queda guardada en el historial de cajas.",
  },

  // ── Vender (mostrador) ────────────────────────────────────────────────────
  "pos.sinCaja": {
    titulo: "Vender sin caja abierta",
    texto: "Podés vender igual: la venta se guarda y descuenta stock, pero no entra en ningún arqueo.",
  },
  "pos.mixto": {
    titulo: "Pago mixto",
    texto: "Para cuando te pagan una parte en efectivo y otra con tarjeta, transferencia u otro medio.",
  },
  "pos.descuento": {
    titulo: "Descuento",
    texto: "Por monto o por porcentaje. El porcentaje se calcula sobre el total con las ofertas ya aplicadas.",
  },


  // ── Productos ─────────────────────────────────────────────────────────────
  "productos.margen": {
    titulo: "% de ganancia",
    texto: "Se suma al costo para calcular el precio de venta. Los productos sin costo cargado quedan afuera.",
  },
  "productos.combo": {
    titulo: "Combo por cantidad",
    texto: "Por ejemplo \"3x2\": cada tantas unidades, el cliente paga el precio del combo en lugar del precio normal.",
  },

  // ── Cuenta corriente ──────────────────────────────────────────────────────
  "ctacte.queEs": {
    titulo: "Cuenta corriente",
    texto: "Lo que cada cliente te debe. Sube con cada cargo o venta a cuenta y baja con cada pago que registrás.",
  },

  // ── Promos y sorteos ──────────────────────────────────────────────────────
  "sorteos.chances": {
    titulo: "Chances del sorteo",
    texto: "Elegí cómo suma chances cada cliente: por estar registrado, por comprar (por venta o por monto gastado) o por subir una foto de su mascota.",
  },

  // ── Configuración ─────────────────────────────────────────────────────────
  "config.anticipacion": {
    titulo: "Anticipación mínima",
    texto: "Cuántas horas antes, como mínimo, se puede sacar un turno online. Así nadie te reserva un turno para dentro de un rato sin que llegues a verlo.",
  },
  "config.duracion": {
    titulo: "Duración",
    texto: "Cuánto dura cada turno de este servicio. Define cada cuánto se ofrecen los horarios.",
  },
  "config.cupo": {
    titulo: "Cupo simultáneo",
    texto: "Cuántos turnos de este servicio se pueden reservar para la misma hora, por ejemplo si atienden dos personas a la vez.",
  },
  "config.horariosPropios": {
    titulo: "Horarios propios",
    texto: "Si este servicio se atiende en otro horario que la veterinaria (por ejemplo, peluquería solo a la mañana).",
  },
  "config.roles": {
    titulo: "Roles del equipo",
    texto: "Veterinario: ve todo, incluida la configuración. Empleado: turnos, clientes, libreta y mostrador, sin configuración ni equipo.",
  },

  // ── Libreta ───────────────────────────────────────────────────────────────
  "libreta.qr": {
    titulo: "QR de la libreta",
    texto: "El QR abre la libreta de la mascota sin iniciar sesión. Compartilo solo con el dueño.",
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  "dashboard.usoPlan": {
    titulo: "Uso del plan",
    texto: "Turnos agendados este mes sobre el máximo que incluye tu plan. El contador arranca de cero cada mes.",
  },
} as const satisfies Record<string, { titulo: string; texto: string }>

export type TemaAyuda = keyof typeof TEXTOS_AYUDA
