"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BuscadorProductos } from "./pos/buscador-productos"
import { CajaBar } from "./pos/caja-bar"
import { CantidadDialog } from "./pos/cantidad-dialog"
import { CarritoPanel, CUOTAS_DEFAULT } from "./pos/carrito-panel"
import type { LineaPagoMixto } from "./pos/mixto-pagos"
import { AlimentoSelector } from "./pos/alimento-selector"
import { AtencionDialog } from "./pos/atencion-dialog"
import { RemitoDialog } from "./pos/remito-dialog"
import {
  agregarAlCarrito,
  agregarAtencion,
  cambiarCantidad,
  itemsParaRPC,
  pctRecargoDe,
  quitarDelCarrito,
  subtotalLinea,
  totalesCarrito,
  SIN_DESCUENTO,
  type Descuento,
  type LineaCarrito,
  type VinculoAtencion,
} from "@/lib/ventas/carrito"
import { getCajaAbierta, getVenta, registrarVenta } from "@/lib/supabase/ventas"
import { getTenantConfig } from "@/lib/supabase/queries"
import { getOrCrearServicioAtencion, getProductoPorId, getProductos } from "@/lib/supabase/productos"
import { getPromocionesVigentes } from "@/lib/supabase/promociones"
import { createHistoria } from "@/lib/supabase/historias"
import { formatCurrency } from "@/lib/format"
import { OfertasPromosPanel } from "./pos/ofertas-promos-panel"
import type { EmisorRemito } from "@/lib/ventas/remito"
import type { Caja, Cliente, MedioPago, Producto, Promocion, Venta } from "@/lib/supabase/types"

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
  const [recargoPct, setRecargoPct] = useState(5)
  const [cuotas, setCuotas] = useState(1)
  const [recargoPorCuotas, setRecargoPorCuotas] = useState<Record<number, number>>(CUOTAS_DEFAULT)
  const [pagosMixto, setPagosMixto] = useState<LineaPagoMixto[]>([])

  const [caja, setCaja] = useState<Caja | null>(null)
  const [emisor, setEmisor] = useState<EmisorRemito>({ nombre: "" })

  const [pendiente, setPendiente] = useState<Producto | null>(null)
  const [alimentosAbierto, setAlimentosAbierto] = useState(false)
  const [atencionAbierto, setAtencionAbierto] = useState(false)
  const [cobrando, setCobrando] = useState(false)
  const [ventaHecha, setVentaHecha] = useState<Venta | null>(null)

  const [promociones, setPromociones] = useState<Promocion[]>([])
  const [productosEnOferta, setProductosEnOferta] = useState<Producto[]>([])
  const [ofertasPromosAbierto, setOfertasPromosAbierto] = useState(false)

  // Se cargan una sola vez acá y se pasan tanto al panel de ofertas/promos
  // como al carrito: si cada uno las pidiera por su cuenta, el total que ve
  // el vendedor en pantalla podría no coincidir con el que se cobra.
  useEffect(() => {
    getPromocionesVigentes(tenantId).then(setPromociones)
    getProductos(tenantId, { soloOferta: true, porPagina: 100 })
      .then((pagina) => setProductosEnOferta(pagina.productos))
  }, [tenantId])

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
   * Todo lo que agrega pasa por acá. Los productos por kilo, las bolsas
   * cerradas con peso detectado (ej. abrir una bolsa de 6 kg y vender 1 kg
   * suelto) y los paquetes divisibles (ej. una caja de 100 golosinas que se
   * vende de a una) abren el diálogo de cantidad; el resto entra de a uno,
   * que es lo que hace que escanear sea instantáneo.
   */
  const elegirProducto = (producto: Producto) => {
    const fraccionable =
      producto.unidad === "kg" ||
      (producto.unidad === "un" && ((producto.pesoKg ?? 0) > 0 || (producto.unidadesPorBulto ?? 0) > 0))
    if (fraccionable) {
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

  const agregarAtencionVeterinaria = async (
    costo: number,
    motivo: string,
    vinculo?: VinculoAtencion,
  ) => {
    try {
      const servicio = await getOrCrearServicioAtencion(tenantId)
      setCarrito((actual) => agregarAtencion(actual, servicio, costo, motivo, vinculo))
      setAtencionAbierto(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo agregar la atención")
    }
  }

  /**
   * Cada línea de atención vinculada a una mascota deja una entrada en su
   * historia clínica, para no tener que cargarla de nuevo a mano en Libreta
   * Sanitaria. Es best-effort: la venta ya se cobró, así que un error acá se
   * avisa pero no se reintenta ni bloquea el resto del mostrador.
   */
  const anotarHistoriasClinicas = async (vendido: LineaCarrito[]) => {
    const atenciones = vendido.filter((l) => l.vinculo)
    for (const linea of atenciones) {
      const { vinculo } = linea
      if (!vinculo) continue
      try {
        await createHistoria(tenantId, vinculo.clienteId, vinculo.mascotaId, {
          fechaAtencion: new Date().toISOString().slice(0, 10),
          motivo: linea.motivo || "Atención veterinaria",
          diagnostico: "",
          tratamiento: "",
          observaciones: `Cobrado en el mostrador: ${formatCurrency(subtotalLinea(linea))}`,
          tipoVisita: "consulta",
        })
      } catch {
        toast.error(
          `La venta se registró, pero no se pudo anotar en la historia de ${vinculo.mascotaNombre}`,
        )
      }
    }
  }

  /**
   * Agrega todos los productos de una promoción al carrito de una sola vez.
   * Se resuelve producto por producto (no hay un getProductosPorIds masivo)
   * porque las promos tienen pocos ítems y esto no corre en un loop caliente.
   */
  const agregarPromocionAlCarrito = async (promocion: Promocion) => {
    try {
      let nuevo = carrito
      for (const item of promocion.items) {
        const producto = await getProductoPorId(tenantId, item.productoId)
        if (producto) nuevo = agregarAlCarrito(nuevo, producto, item.cantidad)
      }
      setCarrito(nuevo)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo agregar la promoción")
    } finally {
      setOfertasPromosAbierto(false)
    }
  }

  const limpiar = () => {
    setCarrito([])
    setCliente(null)
    setDescuento(SIN_DESCUENTO)
    setMedioPago("efectivo")
    setRecargoPct(5)
    setCuotas(1)
    setRecargoPorCuotas(CUOTAS_DEFAULT)
    setPagosMixto([])
  }

  const cobrar = async () => {
    if (carrito.length === 0) return

    if (medioPago === "cuenta_corriente" && !cliente) {
      toast.error("Elegí un cliente para vender a cuenta corriente")
      return
    }

    const pctRecargo = pctRecargoDe(medioPago, recargoPct, cuotas, recargoPorCuotas)

    // `totalesCarrito` ya recorta el descuento al subtotal y aplica el
    // recargo después, así que el monto que se manda nunca deja el total en
    // negativo ni desincroniza lo que se ve en pantalla de lo que se cobra.
    const totales = totalesCarrito(carrito, descuento, pctRecargo, promociones)

    if (medioPago === "mixto") {
      const suma = pagosMixto.reduce((acc, p) => acc + (Number(p.monto) || 0), 0)
      if (Math.abs(suma - totales.total) >= 0.01) {
        toast.error("El desglose de pagos tiene que coincidir con el total")
        return
      }
    }

    setCobrando(true)
    try {
      const resultado = await registrarVenta(tenantId, {
        items: itemsParaRPC(carrito, promociones),
        medioPago,
        clienteId: cliente?.id,
        descuento: totales.descuento,
        recargo: totales.recargo,
        cuotas: medioPago === "credito" ? cuotas : undefined,
        pagos: medioPago === "mixto" ? pagosMixto : undefined,
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

      // La venta ya está cobrada; si la historia clínica falla no hay que
      // revertir nada, solo avisar para que se cargue a mano después.
      await anotarHistoriasClinicas(carrito)

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
        <div className="flex min-h-0 flex-col gap-2 rounded-lg border bg-card p-3">
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setOfertasPromosAbierto(true)}
          >
            <Tag className="mr-1.5 h-4 w-4" />
            Ofertas/Promociones
          </Button>
          <div className="min-h-0 flex-1">
            <BuscadorProductos
              tenantId={tenantId}
              onElegir={elegirProducto}
              onAbrirAlimentos={() => setAlimentosAbierto(true)}
              onAbrirAtencion={() => setAtencionAbierto(true)}
            />
          </div>
        </div>

        <div className="min-h-0 rounded-lg border bg-card">
          <CarritoPanel
            tenantId={tenantId}
            carrito={carrito}
            cliente={cliente}
            medioPago={medioPago}
            descuento={descuento}
            recargoPct={recargoPct}
            cuotas={cuotas}
            recargoPorCuotas={recargoPorCuotas}
            pagosMixto={pagosMixto}
            cobrando={cobrando}
            promociones={promociones}
            onCliente={setCliente}
            onMedioPago={setMedioPago}
            onDescuento={setDescuento}
            onRecargoPct={setRecargoPct}
            onCuotas={setCuotas}
            onRecargoPorCuotas={setRecargoPorCuotas}
            onPagosMixto={setPagosMixto}
            onCantidad={actualizarCantidad}
            onQuitar={(id) => setCarrito((actual) => quitarDelCarrito(actual, id))}
            onVaciar={limpiar}
            onCobrar={cobrar}
          />
        </div>
      </div>

      <AtencionDialog
        abierto={atencionAbierto}
        tenantId={tenantId}
        cliente={cliente}
        onCerrar={() => setAtencionAbierto(false)}
        onConfirmar={agregarAtencionVeterinaria}
      />

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

      <OfertasPromosPanel
        open={ofertasPromosAbierto}
        onOpenChange={setOfertasPromosAbierto}
        productosEnOferta={productosEnOferta}
        promociones={promociones}
        onAgregarProducto={(p) => {
          agregar(p, 1)
          setOfertasPromosAbierto(false)
        }}
        onAgregarPromocion={agregarPromocionAlCarrito}
      />
    </div>
  )
}
