import type { AdminSection } from "@/lib/auth/permissions"

export interface PasoTour {
  /** Selector `[data-tour="…"]` del elemento a resaltar. */
  element: string
  popover: { title: string; description: string }
}

/**
 * Tours guiados por pantalla. El botón "Ayuda" del panel arranca el de la
 * sección en la que está el usuario; si la sección no tiene tour propio,
 * lleva al del Dashboard.
 *
 * Los pasos cuyo elemento no está en pantalla (por ejemplo el resumen de caja
 * cuando no hay caja abierta) se saltean al arrancar.
 */
export const TOURS: Partial<Record<AdminSection, PasoTour[]>> = {
  dashboard: [
    {
      element: '[data-tour="plan"]',
      popover: {
        title: "Tu plan",
        description: "Acá ves tu plan actual y el uso de turnos del mes. Podés mejorarlo cuando lo necesites.",
      },
    },
    {
      element: '[data-tour="accesos"]',
      popover: {
        title: "Accesos rápidos",
        description: "Desde acá llegás a turnos, libreta sanitaria, clientes y configuración.",
      },
    },
    {
      element: '[data-tour="enlaces"]',
      popover: {
        title: "Tus enlaces",
        description: "Compartí tu página pública y el link para sacar turnos con tus clientes.",
      },
    },
    {
      element: '[data-tour="metricas"]',
      popover: {
        title: "Métricas",
        description: "Seguí la evolución de tus turnos, servicios más pedidos y más.",
      },
    },
    {
      element: '[data-tour="comercio"]',
      popover: {
        title: "Comercio",
        description: "Vender: cobrás en el mostrador y emitís el remito. Productos: cargás tu catálogo y controlás el stock. Ventas: revisás el historial de remitos. Caja: abrís, arqueás y cerrás la caja del día.",
      },
    },
    {
      element: '[data-tour="cuenta"]',
      popover: {
        title: "Cuenta",
        description: "Configurá los datos de tu clínica, horarios, servicios y mascotas que atendés.",
      },
    },
  ],

  pos: [
    {
      element: '[data-tour="caja-bar"]',
      popover: {
        title: "1. La caja",
        description: "Abrí la caja al empezar el turno con el cambio que tengas en el cajón. Podés vender sin caja, pero esas ventas no entran en el arqueo.",
      },
    },
    {
      element: '[data-tour="pos-buscador"]',
      popover: {
        title: "2. Buscar productos",
        description: "Escribí el nombre o escaneá el código de barras. Con + y − sumás o sacás unidades del carrito.",
      },
    },
    {
      element: '[data-tour="pos-ofertas"]',
      popover: {
        title: "Ofertas y promociones",
        description: "Los productos en oferta y los combos armados, a un toque de agregarse al carrito.",
      },
    },
    {
      element: '[data-tour="pos-carrito"]',
      popover: {
        title: "3. Cobrar",
        description: "Abrí el carrito para elegir el medio de pago, el cliente y un descuento. Al cobrar se descuenta el stock y podés descargar el remito o mandarlo por WhatsApp.",
      },
    },
  ],

  caja: [
    {
      element: '[data-tour="caja-bar"]',
      popover: {
        title: "Abrir y cerrar",
        description: "Abrí la caja al empezar con el saldo inicial. Al cerrar, contás el efectivo del cajón y el sistema te muestra la diferencia.",
      },
    },
    {
      element: '[data-tour="caja-resumen"]',
      popover: {
        title: "Lo cobrado en este turno",
        description: "Cuánto entró por cada medio de pago y cuánto efectivo debería haber en el cajón ahora.",
      },
    },
    {
      element: '[data-tour="caja-historial"]',
      popover: {
        title: "Cierres anteriores",
        description: "Cada caja cerrada con lo esperado, lo contado y la diferencia. Sirve para detectar faltantes.",
      },
    },
  ],
}

/** Clave de localStorage que marca un tour como ya visto. */
export function claveTourVisto(slug: string, seccion: AdminSection): string {
  // El del dashboard conserva la clave de antes: quien ya lo vio no lo
  // vuelve a ver solo porque cambió el código.
  return seccion === "dashboard" ? `vetpanel-tour-${slug}` : `vetpanel-tour-${slug}-${seccion}`
}
