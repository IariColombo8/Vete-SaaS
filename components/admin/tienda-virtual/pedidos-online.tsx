"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Save, ShoppingCart } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getTiendaPublica, guardarTiendaConfig, type TiendaConfigInput } from "@/lib/supabase/pedidos"
import { MEDIOS_WEB, type MedioPagoWeb } from "@/lib/pedidos/tipos"
import { useReadOnly } from "@/lib/auth/read-only-context"

/**
 * Configuración de la compra online desde la vidriera: si se toman pedidos,
 * retiro / envío, medios de pago y alias para transferir. Tarjeta y QR cobran
 * con la cuenta de Mercado Pago conectada en Configuración → Integraciones.
 */
export function PedidosOnline({ slug, conCatalogo }: { slug: string; conCatalogo: boolean }) {
  const readOnly = useReadOnly()
  const [config, setConfig] = useState<TiendaConfigInput | null>(null)
  const [mpConectado, setMpConectado] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    getTiendaPublica(slug).then((t) => {
      setMpConectado(t.mpConectado)
      setConfig({
        pedidosHabilitados: t.pedidosHabilitados,
        retiroHabilitado: t.retiroHabilitado,
        envioHabilitado: t.envioHabilitado,
        notaEnvio: t.notaEnvio || "El envío lo cobra el cadete al entregar.",
        medios: t.medios.length ? t.medios : ["efectivo", "transferencia", "tarjeta", "qr"],
        aliasTransferencia: t.aliasTransferencia,
        titularTransferencia: t.titularTransferencia,
      })
    })
  }, [slug])

  if (!config) {
    return <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
  }

  const set = (cambios: Partial<TiendaConfigInput>) => setConfig({ ...config, ...cambios })
  const alternarMedio = (m: MedioPagoWeb) =>
    set({ medios: config.medios.includes(m) ? config.medios.filter((x) => x !== m) : [...config.medios, m] })

  const guardar = async () => {
    if (config.pedidosHabilitados && !config.retiroHabilitado && !config.envioHabilitado) {
      return toast.error("Elegí al menos una forma de entrega")
    }
    if (config.pedidosHabilitados && config.medios.length === 0) {
      return toast.error("Elegí al menos un medio de pago")
    }
    setGuardando(true)
    try {
      await guardarTiendaConfig(slug, config)
      toast.success("Configuración de pedidos guardada")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingCart className="h-4 w-4" /> Pedidos online
        </CardTitle>
        <CardDescription>
          Tus clientes arman el carrito en la vidriera, ingresan con Google y eligen retiro o envío y cómo pagan.
          Los pedidos llegan a <Link href={`/${slug}/admin/Pedidos`} className="underline">Pedidos</Link>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!conCatalogo && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Los pedidos online necesitan el catálogo de productos (plan Pro).
          </p>
        )}

        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Tomar pedidos desde la vidriera</span>
          <Switch checked={config.pedidosHabilitados} onCheckedChange={(v) => set({ pedidosHabilitados: v })} disabled={readOnly} />
        </label>

        <div className="space-y-2">
          <p className="text-sm font-medium">Entrega</p>
          <label className="flex items-center justify-between gap-3 text-sm">
            Retiro en el local (sin costo de envío)
            <Switch checked={config.retiroHabilitado} onCheckedChange={(v) => set({ retiroHabilitado: v })} disabled={readOnly} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            Envío a domicilio
            <Switch checked={config.envioHabilitado} onCheckedChange={(v) => set({ envioHabilitado: v })} disabled={readOnly} />
          </label>
          {config.envioHabilitado && (
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Aviso del envío (lo ve el cliente)</Label>
              <Textarea value={config.notaEnvio} onChange={(e) => set({ notaEnvio: e.target.value })} rows={2} disabled={readOnly} />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Medios de pago</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {MEDIOS_WEB.map((m) => {
              const requiereMp = m.id === "tarjeta" || m.id === "qr"
              return (
                <label key={m.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
                  <span>
                    {m.label}
                    {requiereMp && !mpConectado && (
                      <span className="block text-xs text-amber-700 dark:text-amber-300">Conectá Mercado Pago en Integraciones</span>
                    )}
                  </span>
                  <Switch checked={config.medios.includes(m.id)} onCheckedChange={() => alternarMedio(m.id)} disabled={readOnly} />
                </label>
              )
            })}
          </div>
        </div>

        {config.medios.includes("transferencia") && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Alias o CBU para transferir</Label>
              <Input value={config.aliasTransferencia} onChange={(e) => set({ aliasTransferencia: e.target.value })} disabled={readOnly} />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Titular de la cuenta</Label>
              <Input value={config.titularTransferencia} onChange={(e) => set({ titularTransferencia: e.target.value })} disabled={readOnly} />
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Con tarjeta, QR o efectivo la factura electrónica sale sola al cobrarse el pedido; con transferencia se factura a mano desde el pedido.
        </p>

        <Button onClick={guardar} disabled={guardando || readOnly}>
          {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Guardar
        </Button>
      </CardContent>
    </Card>
  )
}
