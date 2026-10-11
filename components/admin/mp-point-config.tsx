"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, CreditCard, Loader2, Plug, RefreshCw, Unplug } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import {
  desconectarPoint,
  getConfigPoint,
  guardarConfigPoint,
  type ConfigPointCliente,
} from "@/components/admin/pos/use-mp-point"

interface Props {
  tenantId: string
}

const MODO_LABEL: Record<string, string> = {
  PDV: "Modo punto de venta",
  STANDALONE: "Modo independiente",
  UNDEFINED: "Sin configurar",
}

/**
 * Configuración → Integraciones → Mercado Pago Point.
 *
 * El dueño pega el access token de producción de su aplicación de Mercado
 * Pago; el servidor lo valida listando las terminales de esa cuenta y lo
 * guarda donde el navegador no puede leerlo. Después elige la terminal, que
 * se pone en modo PDV (hay que reiniciarla una vez).
 */
export function MpPointConfig({ tenantId }: Props) {
  const { toast } = useToast()
  const [config, setConfig] = useState<ConfigPointCliente | null>(null)
  const [cargando, setCargando] = useState(true)
  const [token, setToken] = useState("")
  const [ocupado, setOcupado] = useState<"guardar" | "terminal" | "desconectar" | "refrescar" | null>(null)
  const [confirmarDesconexion, setConfirmarDesconexion] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setConfig(await getConfigPoint(tenantId))
    } catch (error) {
      toast({
        title: "No se pudo leer la integración",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      })
    } finally {
      setCargando(false)
      setOcupado(null)
    }
  }, [tenantId, toast])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function guardarToken(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim()) return
    setOcupado("guardar")
    try {
      const r = await guardarConfigPoint(tenantId, { accessToken: token.trim() })
      setConfig(r)
      setToken("")
      toast({
        title: "Mercado Pago conectado",
        description:
          r.terminales.length === 0
            ? "La cuenta no tiene terminales Point vinculadas todavía."
            : r.terminalId
              ? `Terminal ${r.terminalNombre ?? r.terminalId} lista para cobrar.`
              : "Elegí la terminal con la que vas a cobrar.",
      })
      if (r.requiereReinicio) avisarReinicio()
    } catch (error) {
      toast({
        title: "No se pudo conectar",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      })
    } finally {
      setOcupado(null)
    }
  }

  async function elegirTerminal(terminalId: string) {
    setOcupado("terminal")
    try {
      const r = await guardarConfigPoint(tenantId, { terminalId })
      setConfig(r)
      toast({ title: "Terminal elegida", description: r.terminalNombre ?? terminalId })
      if (r.requiereReinicio) avisarReinicio()
    } catch (error) {
      toast({
        title: "No se pudo elegir la terminal",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      })
    } finally {
      setOcupado(null)
    }
  }

  async function cambiarTicket(imprimir: boolean) {
    try {
      setConfig(await guardarConfigPoint(tenantId, { printOnTerminal: imprimir }))
    } catch (error) {
      toast({ title: "No se pudo guardar", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    }
  }

  async function desconectar() {
    setOcupado("desconectar")
    try {
      await desconectarPoint(tenantId)
      setConfig({ configurado: false, terminales: [] })
      toast({ title: "Mercado Pago desconectado" })
    } catch (error) {
      toast({ title: "No se pudo desconectar", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setOcupado(null)
    }
  }

  function avisarReinicio() {
    toast({
      title: "Reiniciá la terminal",
      description:
        "Se activó el modo punto de venta (PDV). Apagá y prendé la terminal para que tome el cambio; después verificá en Más opciones → Configuración → Modo de vinculación.",
      duration: 12000,
    })
  }

  if (cargando || !config) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-sky-600" />
          Mercado Pago Point
          {config.configurado && config.terminalId && (
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Conectado</Badge>
          )}
          {config.configurado && !config.terminalId && (
            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Falta elegir terminal</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Cobrá débito y crédito desde el mostrador: el monto viaja solo a tu terminal Point y la venta se
          registra cuando el pago se aprueba. La plata entra a tu cuenta de Mercado Pago, no a VetPanel.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {!config.configurado ? (
          <form onSubmit={guardarToken} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="mp-token">Access token de producción</Label>
              <Input
                id="mp-token"
                type="password"
                autoComplete="off"
                placeholder="APP_USR-…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Lo generás en{" "}
                <a
                  href="https://www.mercadopago.com.ar/developers/panel/app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Mercado Pago Developers → Tus integraciones
                </a>
                : creá una aplicación (producto &quot;Pagos presenciales / Point&quot;) y copiá el
                <strong> Access Token</strong> de <strong>Credenciales de producción</strong>. Queda guardado
                cifrado en el servidor; no se muestra de nuevo.
              </p>
            </div>
            <Button type="submit" disabled={ocupado !== null || !token.trim()} className="bg-sky-600 hover:bg-sky-700">
              {ocupado === "guardar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
              Conectar
            </Button>
          </form>
        ) : (
          <>
            {config.errorToken && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {config.errorToken}
              </p>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Terminales de tu cuenta</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setOcupado("refrescar")
                    cargar()
                  }}
                  disabled={ocupado !== null}
                  title="Volver a buscar terminales"
                >
                  {ocupado === "refrescar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>

              {config.terminales.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No aparece ninguna terminal. Vinculá tu Point a la cuenta desde la app de Mercado Pago y volvé a buscar.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {config.terminales.map((t) => {
                    const elegida = t.id === config.terminalId
                    const [modelo, serie] = t.id.split("__")
                    return (
                      <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium">{modelo.replace(/_/g, " ")}</p>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {serie ?? t.id} · {MODO_LABEL[t.operatingMode] ?? t.operatingMode}
                          </p>
                        </div>
                        {elegida ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-4 w-4" /> En uso
                          </span>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => elegirTerminal(t.id)} disabled={ocupado !== null}>
                            {ocupado === "terminal" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                            Usar esta
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-sky-600"
                checked={config.printOnTerminal ?? true}
                onChange={(e) => cambiarTicket(e.target.checked)}
              />
              Imprimir el ticket de Mercado Pago en la terminal
            </label>

            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => setConfirmarDesconexion(true)} disabled={ocupado !== null}>
                {ocupado === "desconectar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unplug className="mr-2 h-4 w-4" />}
                Desconectar
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmarDesconexion} onOpenChange={setConfirmarDesconexion}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desconectar Mercado Pago Point?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra el access token guardado y el mostrador deja de ofrecer &quot;Cobrar con Point&quot;. Las
              ventas ya registradas no se tocan. Podés volver a conectarlo cuando quieras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={desconectar}>Desconectar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
