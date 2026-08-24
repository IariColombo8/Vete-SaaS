"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { BuscadorProductos } from "./pos/buscador-productos"
import { CajaBar } from "./pos/caja-bar"
import { CantidadDialog } from "./pos/cantidad-dialog"
import { CarritoPanel } from "./pos/carrito-panel"
import { AlimentoSelector } from "./pos/alimento-selector"
import { RemitoDialog } from "./pos/remito-dialog"
import {
  agregarAlCarrito,
  cambiarCantidad,
  itemsParaRPC,
  quitarDelCarrito,
  totalesCarrito,
  SIN_DESCUENTO,
  type Descuento,
  type LineaCarrito,
} from "@/lib/ventas/carrito"
import { getCajaAbierta, getVenta, registrarVenta } from "@/lib/supabase/ventas"
import { getTenantConfig } from "@/lib/supabase/queries"
import type { EmisorRemito } from "@/lib/ventas/remito"
import type { Caja, Cliente, MedioPago, Producto, Venta } from "@/lib/supabase/types"

interface Props {
  tenantId: string
}

/**
 * Punto de venta.
 *
 * Orquesta las piezas del mostrador y es el único que habla con la base para
 * cobrar. Las reglas del carrito (stock, decimales, ofertas) viven en
 * `lib/ventas/carrito.ts`, que es puro y está testeado; acá solo se atrapan los
 * errores que tira y se muestran.
 *
 * El flujo completo: buscar o escanear → elegir cantidad → cobrar → remito.
 */
export function PosManagement({ tenantId }: Props) {
  const [carrito, setCarrito] = useState<LineaCarrito[]>([])
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [medioPago, setMedioPago] = useState<MedioPago>("efectivo")
  const [descuento, setDescuento] = useState<Descuento>(SIN_DESCUENTO)

  const [caja, setCaja] = useState<Caja | null>(null)
  const [emisor, setEmisor] = useState<EmisorRemito>({ nombre: "" })

  const [pendiente, setPendiente] = useState<Producto | null>(null)
  const [alimentosAbierto, setAlimentosAbierto] = useState(false)
  const [cobrando, setCobrando] = useState(false)
  const [ventaHecha, setVentaHecha] = useState<Venta | null>(null)

  const recargarCaja = useCallback(() => {
    getCajaAbierta(tenantId)
      .then(setCaja)
      .catch(() => setCaja(null))
  }, [tenantId])

  useEffect(() => {
    recargarCaja()
  }, [recargarCaja])

  // Los datos de la veterinaria van en el encabezado del remito.
  useEffect(() => {
    getTenantConfig(tenantId)
      .then((config) =>
        setEmisor({
          nombre: config?.nombre || "VetPanel",
          direccion: config?.direccion,
          telefono: config?.telefono,
          email: config?.email,
          logoUrl: config?.logo,
        }),
      )
      .catch(() => setEmisor({ nombre: "VetPanel" }))
  }, [tenantId])

  /**
   * Todo lo que agrega pasa por acá. Los productos por kilo y los que ya están
   * en el carrito abren el diálogo de cantidad; el resto entra de a uno, que es
   * lo que hace que escanear sea instantáneo.
   */
  const elegirProducto = (producto: Producto) => {
    if (producto.unidad === "kg") {
      setPendiente(producto)
      return
    }
    agregar(producto, 1)
  }

  const agregar = (producto: Producto, cantidad: number) => {
    try {
      setCarrito((actual) => agregarAlCarrito(actual, producto, cantidad))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo agregar el producto")
    }
  }

  const actualizarCantidad = (productoId: string, cantidad: number) => {
    try {
      setCarrito((actual) => cambiarCantidad(actual, productoId, cantidad))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar la cantidad")
    }
  }

  const limpiar = () => {
    setCarrito([])
    setCliente(null)
    setDescuento(SIN_DESCUENTO)
    setMedioPago("efectivo")
  }

  const cobrar = async () => {
    if (carrito.length === 0) return

    // `totalesCarrito` ya recorta el descuento al subtotal, así que el monto
    // que se manda nunca deja el total en negativo.
    const totales = totalesCarrito(carrito, descuento)

    setCobrando(true)
    try {
      const resultado = await registrarVenta(tenantId, {
        items: itemsParaRPC(carrito),
        medioPago,
        clienteId: cliente?.id,
        descuento: totales.descuento,
      })

      // Se relee la venta ya guardada en vez de armarla con lo que había en
      // pantalla: el remito tiene que mostrar exactamente lo que quedó en la
      // base, incluido el número y los datos congelados del cliente.
      const venta = await getVenta(tenantId, resultado.ventaId)
      if (venta) {
        setVentaHecha(venta)
      } else {
        toast.success(`Venta #${resultado.numero} registrada`)
      }

      limpiar()
      // El stock cambió, así que el resumen de la caja también.
      recargarCaja()
    } catch (e) {
      // Los mensajes de la RPC ya están escritos para el usuario
      // ("No hay stock suficiente de X"), así que se muestran tal cual.
      toast.error(e instanceof Error ? e.message : "No se pudo registrar la venta")
    } finally {
      setCobrando(false)
    }
  }

  return (
    // Alto fijo, no `min-h`: el carrito y el buscador scrollean por dentro y el
    // botón de cobrar tiene que quedar siempre a la vista. Se descuenta el
    // header del panel (3.5rem) y el padding vertical del main (3rem).
    <div className="flex h-[calc(100vh-6.5rem)] flex-col gap-3">
      <CajaBar tenantId={tenantId} caja={caja} onCambio={recargarCaja} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_360px]">
        <div className="min-h-0 rounded-lg border bg-card p-3">
          <BuscadorProductos
            tenantId={tenantId}
            onElegir={elegirProducto}
            onAbrirAlimentos={() => setAlimentosAbierto(true)}
          />
        </div>

        <div className="min-h-0 rounded-lg border bg-card">
          <CarritoPanel
            tenantId={tenantId}
            carrito={carrito}
            cliente={cliente}
            medioPago={medioPago}
            descuento={descuento}
            cobrando={cobrando}
            onCliente={setCliente}
            onMedioPago={setMedioPago}
            onDescuento={setDescuento}
            onCantidad={actualizarCantidad}
            onQuitar={(id) => setCarrito((actual) => quitarDelCarrito(actual, id))}
            onVaciar={limpiar}
            onCobrar={cobrar}
          />
        </div>
      </div>

      <AlimentoSelector
        tenantId={tenantId}
        abierto={alimentosAbierto}
        onCerrar={() => setAlimentosAbierto(false)}
        onElegir={elegirProducto}
      />

      <CantidadDialog
        producto={pendiente}
        onCerrar={() => setPendiente(null)}
        onConfirmar={(cantidad) => {
          if (pendiente) agregar(pendiente, cantidad)
          setPendiente(null)
        }}
      />

      <RemitoDialog
        venta={ventaHecha}
        emisor={emisor}
        onCerrar={() => setVentaHecha(null)}
      />
    </div>
  )
}
