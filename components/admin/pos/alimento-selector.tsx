"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, Loader2, PawPrint } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { agruparPorMarca, getAlimentos } from "@/lib/supabase/productos"
import { presentacionDe } from "@/lib/ventas/carrito"
import { precioFinal, tieneOferta } from "@/lib/productos/precios"
import { formatCantidad, formatCurrency } from "@/lib/format"
import type { Producto } from "@/lib/supabase/types"

interface Props {
  tenantId: string
  abierto: boolean
  onCerrar: () => void
  /** El diálogo solo elige el producto; los kilos los pide el POS después. */
  onElegir: (producto: Producto) => void
}

/**
 * Selector guiado de alimento: marca → línea → presentación.
 *
 * Existe porque en el mostrador nadie se acuerda del nombre exacto de la bolsa,
 * pero sí de la marca y de cuántos kilos quiere el cliente. El buscador por
 * texto sigue estando para el resto del catálogo.
 */
export function AlimentoSelector({ tenantId, abierto, onCerrar, onElegir }: Props) {
  const [alimentos, setAlimentos] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(false)
  const [marca, setMarca] = useState<string | null>(null)
  const [linea, setLinea] = useState<string | null>(null)

  // Se cargan al abrir, no al montar: el POS arranca en el buscador y muchas
  // ventas no tocan nunca el selector.
  useEffect(() => {
    if (!abierto || alimentos.length > 0) return

    setCargando(true)
    getAlimentos(tenantId)
      .then(setAlimentos)
      .catch(() => toast.error("No se pudieron cargar los alimentos"))
      .finally(() => setCargando(false))
  }, [abierto, tenantId, alimentos.length])

  // Al cerrar se vuelve al primer paso: la próxima venta empieza de cero.
  useEffect(() => {
    if (!abierto) {
      setMarca(null)
      setLinea(null)
    }
  }, [abierto])

  const marcas = useMemo(() => agruparPorMarca(alimentos), [alimentos])
  const marcaActual = marcas.find((m) => m.marca === marca)
  const lineaActual = marcaActual?.lineas.find((l) => l.linea === linea)

  // Cuando la marca tiene una sola línea (o directamente ninguna, que es el
  // caso más común en este catálogo: el Excel del proveedor no trae línea),
  // ese paso intermedio no elige nada — se salta derecho a las presentaciones.
  const elegirMarca = (m: string) => {
    setMarca(m)
    const encontrada = marcas.find((x) => x.marca === m)
    if (encontrada && encontrada.lineas.length === 1) {
      setLinea(encontrada.lineas[0].linea)
    }
  }

  const volver = () => {
    if (linea !== null) {
      // Si la línea se saltó sola al entrar, volver tiene que saltarla también.
      if ((marcaActual?.lineas.length ?? 0) <= 1) setMarca(null)
      else setLinea(null)
    } else {
      setMarca(null)
    }
  }

  const elegir = (producto: Producto) => {
    onElegir(producto)
    onCerrar()
  }

  const titulo = linea !== null ? `${marca} ${linea}`.trim() : (marca ?? "Alimentos")

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {marca !== null && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={volver}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <DialogTitle>{titulo}</DialogTitle>
          </div>
          <DialogDescription>
            {marca === null
              ? "Elegí la marca"
              : linea === null
                ? "Elegí la línea"
                : "Elegí la presentación"}
          </DialogDescription>
        </DialogHeader>

        {cargando ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : marcas.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <PawPrint className="mx-auto mb-3 h-8 w-8 opacity-40" />
            Todavía no hay alimentos con marca cargada.
            <br />
            Completá el campo <strong>Marca</strong> en Productos para que aparezcan acá.
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto">
            {marca === null && (
              <Grilla>
                {marcas.map((m) => (
                  <Opcion key={m.marca} onClick={() => elegirMarca(m.marca)}>
                    <span className="font-semibold">{m.marca}</span>
                    <span className="text-xs text-muted-foreground">
                      {m.lineas.length} {m.lineas.length === 1 ? "línea" : "líneas"}
                    </span>
                  </Opcion>
                ))}
              </Grilla>
            )}

            {marca !== null && linea === null && (
              <Grilla>
                {marcaActual?.lineas.map((l) => (
                  <Opcion key={l.linea || "_"} onClick={() => setLinea(l.linea)}>
                    <span className="font-semibold">{l.linea || "Sin línea"}</span>
                    <span className="text-xs text-muted-foreground">
                      {l.presentaciones.length}{" "}
                      {l.presentaciones.length === 1 ? "presentación" : "presentaciones"}
                    </span>
                  </Opcion>
                ))}
              </Grilla>
            )}

            {lineaActual && (
              <Grilla>
                {lineaActual.presentaciones.map((p) => (
                  <Presentacion key={p.id} producto={p} onElegir={() => elegir(p)} />
                ))}
              </Grilla>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Grilla({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2 p-1">{children}</div>
}

function Opcion({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-lg border bg-card p-3 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
    >
      {children}
    </button>
  )
}

/**
 * Una bolsa concreta. Muestra el stock porque en el mostrador es lo primero que
 * se pregunta, y deshabilita la opción cuando no queda nada: es más claro que
 * dejar que la agregue y que la venta falle recién al cobrar.
 */
function Presentacion({ producto, onElegir }: { producto: Producto; onElegir: () => void }) {
  const agotado = producto.controlaStock && producto.stock <= 0
  const porKg = producto.unidad === "kg"
  // El nombre completo del Excel identifica la bolsa (perro/gato, adulto/
  // cachorro...); el peso solo (presentacionDe) se repite igual en varias
  // filas de la misma marca y no alcanza para distinguirlas.
  const presentacion = presentacionDe(producto)

  return (
    <button
      type="button"
      onClick={onElegir}
      disabled={agotado}
      className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-card dark:hover:bg-emerald-950/40"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate font-semibold">{producto.nombre}</span>
        {tieneOferta(producto) && (
          <Badge className="shrink-0 bg-amber-500 hover:bg-amber-500">Oferta</Badge>
        )}
      </div>
      {presentacion && (
        <span className="shrink-0 text-xs font-medium text-muted-foreground">{presentacion}</span>
      )}
      {producto.controlaStock && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {agotado ? "Sin stock" : `${formatCantidad(producto.stock)} ${porKg ? "kg" : "u."}`}
        </span>
      )}
      <span className="shrink-0 font-bold text-emerald-600 dark:text-emerald-400">
        {formatCurrency(precioFinal(producto))}
        {porKg && <span className="text-xs font-normal"> / kg</span>}
      </span>
    </button>
  )
}
