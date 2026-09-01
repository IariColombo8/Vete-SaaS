"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { getCarritoPos, guardarCarritoPos, suscribirCarritoPos } from "@/lib/supabase/carrito-pos"
import { SIN_DESCUENTO, type Descuento, type LineaCarrito } from "@/lib/ventas/carrito"
import type { LineaPagoMixto } from "@/components/admin/pos/mixto-pagos"
import type { Cliente, MedioPago } from "@/lib/supabase/types"

/** Duplicado de `CarritoPanel.CUOTAS_DEFAULT`: evita importar un componente UI en el hook. */
const CUOTAS_DEFAULT: Record<number, number> = { 1: 5, 3: 10, 6: 20, 12: 35 }

/** Estado completo del mostrador que se comparte entre pantallas. */
export interface DraftPos {
  carrito: LineaCarrito[]
  cliente: Cliente | null
  medioPago: MedioPago
  descuento: Descuento
  recargoPct: number
  cuotas: number
  recargoPorCuotas: Record<number, number>
  pagosMixto: LineaPagoMixto[]
  /**
   * Marca de tiempo del último cambio hecho por ESTE cliente (no del guardado
   * remoto). Sin esto, la corrección "por si otra pantalla lo actualizó" al
   * montar — o el eco de Realtime de otra pestaña — podían pisar clicks
   * locales recién hechos con una foto vieja: se elegía "2" y quedaba en "1",
   * se borraba una línea y volvía. Solo se acepta una foto entrante si su
   * `_ts` es más nueva que la del draft local.
   */
  _ts?: number
}

export const DRAFT_VACIO: DraftPos = {
  carrito: [],
  cliente: null,
  medioPago: "efectivo",
  descuento: SIN_DESCUENTO,
  recargoPct: 5,
  cuotas: 1,
  recargoPorCuotas: CUOTAS_DEFAULT,
  pagosMixto: [],
}

const DEBOUNCE_MS = 400

function claveLocal(tenantId: string) {
  return `carrito-pos:${tenantId}`
}

function esDraftVacio(d: DraftPos) {
  return d.carrito.length === 0 && !d.cliente
}

/**
 * Carrito de "Vender" persistente y compartido entre dispositivos.
 *
 * Local-first: cada cambio actualiza el estado de React al instante y se
 * guarda en `localStorage` sin demora (sobrevive a un cierre sin red). En
 * paralelo, con debounce, se sube a Supabase; Realtime avisa a las otras
 * pantallas abiertas en el mismo tenant. Si el guardado remoto falla (sin
 * conexión), el intento se reintenta solo al volver el evento `online` —
 * mientras tanto el mostrador sigue funcionando con el estado local.
 *
 * `clientIdRef` identifica esta pestaña: al recibir un cambio por Realtime
 * cuyo `client_id` es el propio, se ignora (es el eco del último guardado).
 */
export function useCarritoCompartido(tenantId: string) {
  const [draft, setDraftInterno] = useState<DraftPos>(DRAFT_VACIO)
  const [cargado, setCargado] = useState(false)
  const clientIdRef = useRef<string>("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendienteRef = useRef<DraftPos | null>(null)

  if (!clientIdRef.current) {
    clientIdRef.current = crypto.randomUUID()
  }

  /** Todo cambio que hace ESTE cliente pasa por acá: se sella con la hora
   *  actual para que ninguna foto vieja (fetch inicial, eco de otra pestaña)
   *  pueda pisarlo más tarde — solo gana quien tenga el `_ts` más nuevo. */
  const setDraft = useCallback(
    (actualizar: DraftPos | ((actual: DraftPos) => DraftPos)) => {
      setDraftInterno((d) => {
        const next = typeof actualizar === "function" ? actualizar(d) : actualizar
        return { ...next, _ts: Date.now() }
      })
    },
    [],
  )

  /** Solo adopta una foto remota (fetch inicial o Realtime) si es más nueva
   *  que el draft local — si no, se ignora en vez de pisar un cambio recién
   *  hecho acá con algo desactualizado. */
  const adoptarSiEsMasNueva = useCallback((remoto: DraftPos) => {
    setDraftInterno((actual) => {
      const remotoTs = remoto._ts ?? 0
      const localTs = actual._ts ?? 0
      return remotoTs > localTs ? remoto : actual
    })
  }, [])

  const subirAhora = useCallback(
    (data: DraftPos) => {
      guardarCarritoPos(tenantId, data as unknown as Record<string, unknown>, clientIdRef.current).catch(() => {
        // Sin conexión: queda en localStorage y se reintenta al volver el online.
        pendienteRef.current = data
      })
    },
    [tenantId],
  )

  // Carga inicial: localStorage primero (instantáneo), después se corrige con
  // lo que haya en Supabase por si otra pantalla lo actualizó mientras tanto.
  useEffect(() => {
    try {
      const local = localStorage.getItem(claveLocal(tenantId))
      if (local) setDraftInterno(JSON.parse(local))
    } catch {
      // localStorage corrupto o inaccesible: se sigue con el draft vacío.
    }

    getCarritoPos(tenantId)
      .then((fila) => {
        if (fila && !esDraftVacio(fila.data as unknown as DraftPos)) {
          adoptarSiEsMasNueva(fila.data as unknown as DraftPos)
        }
      })
      .finally(() => setCargado(true))

    const desuscribir = suscribirCarritoPos(tenantId, (fila) => {
      if (fila.clientId === clientIdRef.current) return // eco propio
      adoptarSiEsMasNueva(fila.data as unknown as DraftPos)
    })

    const reintentar = () => {
      if (pendienteRef.current) {
        subirAhora(pendienteRef.current)
        pendienteRef.current = null
      }
    }
    window.addEventListener("online", reintentar)

    return () => {
      desuscribir()
      window.removeEventListener("online", reintentar)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  // Persiste cada cambio: local inmediato, remoto con debounce.
  useEffect(() => {
    if (!cargado) return
    try {
      localStorage.setItem(claveLocal(tenantId), JSON.stringify(draft))
    } catch {
      // Cuota de localStorage llena o no disponible: no es crítico, se sigue.
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => subirAhora(draft), DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [draft, cargado, tenantId, subirAhora])

  /** Limpia el mostrador en esta pantalla y en las demás (al cobrar o vaciar). */
  const limpiar = useCallback(() => {
    const vacioSellado: DraftPos = { ...DRAFT_VACIO, _ts: Date.now() }
    setDraftInterno(vacioSellado)
    try {
      localStorage.removeItem(claveLocal(tenantId))
    } catch {
      // no crítico
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    subirAhora(vacioSellado)
  }, [tenantId, subirAhora])

  return { draft, setDraft, limpiar }
}
