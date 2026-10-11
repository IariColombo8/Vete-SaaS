"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Copy, Download, FileCheck2, FileText, Loader2, RefreshCw, ShieldAlert, Trash2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
  borrarConfigFacturacion,
  cargarCertificado,
  generarCsr,
  getConfigFacturacion,
  guardarDatosFiscales,
  probarConexionArca,
  type ConfigFiscalCliente,
  type DatosFiscalesInput,
} from "@/components/admin/pos/use-facturacion"

interface Props {
  tenantId: string
}

const VACIO: DatosFiscalesInput = {
  cuit: "",
  razonSocial: "",
  domicilioFiscal: "",
  condicionIva: "MONOTRIBUTO",
  inicioActividades: null,
  ingresosBrutos: "",
  puntoVenta: 1,
  ambiente: "homologacion",
}

function formatFecha(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })
}

/**
 * Configuración → Integraciones → Factura electrónica (ARCA).
 *
 * Tres pasos, en orden: datos fiscales → certificado (CSR que se sube a ARCA
 * y .crt que se pega acá) → probar conexión. Arranca en homologación: nada de
 * lo que se emita ahí tiene valor fiscal; cuando funciona, se pasa a
 * producción con un certificado de producción.
 */
export function FacturacionConfig({ tenantId }: Props) {
  const { toast } = useToast()
  const [config, setConfig] = useState<ConfigFiscalCliente | null>(null)
  const [cifradoOk, setCifradoOk] = useState(true)
  const [cargando, setCargando] = useState(true)
  const [form, setForm] = useState<DatosFiscalesInput>(VACIO)
  const [certPem, setCertPem] = useState("")
  const [ocupado, setOcupado] = useState<"guardar" | "csr" | "cert" | "probar" | "borrar" | null>(null)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const [confirmarCsr, setConfirmarCsr] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const r = await getConfigFacturacion(tenantId)
      setCifradoOk(r.cifradoConfigurado)
      setConfig(r.config)
      if (r.config) {
        setForm({
          cuit: r.config.cuit,
          razonSocial: r.config.razonSocial,
          domicilioFiscal: r.config.domicilioFiscal ?? "",
          condicionIva: r.config.condicionIva,
          inicioActividades: r.config.inicioActividades,
          ingresosBrutos: r.config.ingresosBrutos ?? "",
          puntoVenta: r.config.puntoVenta,
          ambiente: r.config.ambiente,
        })
      }
    } catch (error) {
      toast({ title: "No se pudo leer la configuración fiscal", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setCargando(false)
    }
  }, [tenantId, toast])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado("guardar")
    try {
      await guardarDatosFiscales(tenantId, form)
      toast({ title: "Datos fiscales guardados" })
      await cargar()
    } catch (error) {
      toast({ title: "No se pudo guardar", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setOcupado(null)
    }
  }

  async function generar() {
    setOcupado("csr")
    try {
      await generarCsr(tenantId)
      toast({ title: "Pedido de certificado generado", description: "Descargalo y subilo en ARCA." })
      await cargar()
    } catch (error) {
      toast({ title: "No se pudo generar", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setOcupado(null)
    }
  }

  async function cargarCert(e: React.FormEvent) {
    e.preventDefault()
    setOcupado("cert")
    try {
      const r = await cargarCertificado(tenantId, certPem)
      toast({ title: "Certificado cargado", description: `Vence el ${formatFecha(r.vence)}.` })
      setCertPem("")
      await cargar()
    } catch (error) {
      toast({ title: "Certificado rechazado", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setOcupado(null)
    }
  }

  async function probar() {
    setOcupado("probar")
    try {
      const r = await probarConexionArca(tenantId)
      toast({ title: r.ok ? "Conexión con ARCA OK" : "ARCA no respondió bien", description: r.detalle, variant: r.ok ? undefined : "destructive", duration: 10000 })
      await cargar()
    } catch (error) {
      toast({ title: "No se pudo probar", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setOcupado(null)
    }
  }

  async function borrar() {
    setOcupado("borrar")
    try {
      await borrarConfigFacturacion(tenantId)
      setConfig(null)
      setForm(VACIO)
      toast({ title: "Configuración fiscal eliminada" })
    } catch (error) {
      toast({ title: "No se pudo borrar", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setOcupado(null)
    }
  }

  function descargarCsr() {
    if (!config?.csrPem) return
    const blob = new Blob([config.csrPem], { type: "application/pkcs10" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `vetpanel-${tenantId}-${config.ambiente}.csr`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function copiarCsr() {
    if (!config?.csrPem) return
    await navigator.clipboard.writeText(config.csrPem)
    toast({ title: "CSR copiado" })
  }

  if (cargando) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const listo = Boolean(config?.tieneCertificado && config?.tieneClave)
  const certVencido = config?.certVenceAt ? new Date(config.certVenceAt).getTime() < Date.now() : false

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <FileText className="h-5 w-5 text-violet-600" />
          Factura electrónica (ARCA)
          {listo && !certVencido && (
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              Lista · {config?.ambiente === "produccion" ? "Producción" : "Homologación"}
            </Badge>
          )}
          {config && !listo && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Falta el certificado</Badge>}
          {certVencido && <Badge variant="destructive">Certificado vencido</Badge>}
        </CardTitle>
        <CardDescription>
          Emitís Factura A, B o C con tu propio CUIT desde el mostrador y el historial de ventas. El CAE lo
          otorga ARCA en el momento y la factura sale en PDF con el QR obligatorio.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-8">
        {!cifradoOk && (
          <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            El servidor no tiene configurada la clave de cifrado de certificados. Hasta que se cargue no se puede
            generar el certificado.
          </p>
        )}

        {/* ── Paso 1: datos fiscales ── */}
        <form onSubmit={guardar} className="space-y-4">
          <h3 className="text-sm font-semibold">1. Datos fiscales</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fe-cuit">CUIT *</Label>
              <Input id="fe-cuit" value={form.cuit} onChange={(e) => setForm({ ...form, cuit: e.target.value })} placeholder="20-12345678-9" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fe-razon">Razón social *</Label>
              <Input id="fe-razon" value={form.razonSocial} onChange={(e) => setForm({ ...form, razonSocial: e.target.value })} placeholder="Como figura en ARCA" required />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="fe-dom">Domicilio fiscal</Label>
              <Input id="fe-dom" value={form.domicilioFiscal ?? ""} onChange={(e) => setForm({ ...form, domicilioFiscal: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fe-cond">Condición frente al IVA *</Label>
              <select
                id="fe-cond"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.condicionIva}
                onChange={(e) => setForm({ ...form, condicionIva: e.target.value as DatosFiscalesInput["condicionIva"] })}
              >
                <option value="MONOTRIBUTO">Responsable Monotributo (Factura C)</option>
                <option value="RI">IVA Responsable Inscripto (Factura A / B)</option>
                <option value="EXENTO">IVA Exento (Factura C)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fe-pv">Punto de venta *</Label>
              <Input
                id="fe-pv"
                type="number"
                min={1}
                max={99999}
                value={form.puntoVenta}
                onChange={(e) => setForm({ ...form, puntoVenta: Number(e.target.value) })}
                required
              />
              <p className="text-xs text-muted-foreground">
                Tiene que existir en ARCA como punto de venta de <strong>web services</strong> (RECE), no el de
                factura en línea.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fe-iibb">Ingresos brutos</Label>
              <Input id="fe-iibb" value={form.ingresosBrutos ?? ""} onChange={(e) => setForm({ ...form, ingresosBrutos: e.target.value })} placeholder="N° o 'Exento'" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fe-inicio">Inicio de actividades</Label>
              <Input
                id="fe-inicio"
                type="date"
                value={form.inicioActividades ?? ""}
                onChange={(e) => setForm({ ...form, inicioActividades: e.target.value || null })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="fe-amb">Ambiente</Label>
              <select
                id="fe-amb"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.ambiente}
                onChange={(e) => setForm({ ...form, ambiente: e.target.value as DatosFiscalesInput["ambiente"] })}
              >
                <option value="homologacion">Homologación (pruebas, sin valor fiscal)</option>
                <option value="produccion">Producción (facturas reales)</option>
              </select>
              <p className="text-xs text-muted-foreground">
                El certificado es distinto para cada ambiente. Si cambiás de ambiente, generá un CSR nuevo y
                pedí el certificado en el portal correspondiente.
              </p>
            </div>
          </div>
          <Button type="submit" disabled={ocupado !== null} className="bg-violet-600 hover:bg-violet-700">
            {ocupado === "guardar" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar datos fiscales
          </Button>
        </form>

        {/* ── Paso 2: certificado ── */}
        {config && (
          <div className="space-y-4 border-t pt-6">
            <h3 className="text-sm font-semibold">2. Certificado digital</h3>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Generá el pedido de certificado (CSR) y descargalo.</li>
              <li>
                En ARCA con clave fiscal → <strong>Administración de Certificados Digitales</strong>, agregá un
                alias y subí el .csr. Descargá el certificado (.crt).
              </li>
              <li>
                En <strong>Administrador de Relaciones de Clave Fiscal</strong>, autorizá el servicio{" "}
                <strong>&quot;Facturación Electrónica&quot; (wsfe)</strong> para ese certificado.
              </li>
              <li>Pegá acá el contenido del .crt.</li>
            </ol>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => (config.tieneCertificado ? setConfirmarCsr(true) : generar())}
                disabled={ocupado !== null || !cifradoOk}
              >
                {ocupado === "csr" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {config.tieneClave ? "Generar CSR nuevo" : "Generar pedido de certificado (CSR)"}
              </Button>
              {config.csrPem && (
                <>
                  <Button type="button" variant="ghost" onClick={descargarCsr}>
                    <Download className="mr-2 h-4 w-4" /> Descargar .csr
                  </Button>
                  <Button type="button" variant="ghost" onClick={copiarCsr}>
                    <Copy className="mr-2 h-4 w-4" /> Copiar
                  </Button>
                </>
              )}
            </div>

            {config.tieneCertificado ? (
              <p className="flex items-center gap-2 text-sm">
                <FileCheck2 className="h-4 w-4 text-emerald-600" />
                Certificado cargado. Vence el <strong>{formatFecha(config.certVenceAt)}</strong>.
              </p>
            ) : null}

            {config.tieneClave && (
              <form onSubmit={cargarCert} className="space-y-2">
                <Label htmlFor="fe-cert">{config.tieneCertificado ? "Reemplazar certificado (.crt)" : "Certificado (.crt) que devolvió ARCA"}</Label>
                <Textarea
                  id="fe-cert"
                  value={certPem}
                  onChange={(e) => setCertPem(e.target.value)}
                  placeholder="-----BEGIN CERTIFICATE-----"
                  rows={5}
                  className="font-mono text-xs"
                />
                <Button type="submit" variant="outline" disabled={ocupado !== null || !certPem.trim()}>
                  {ocupado === "cert" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Cargar certificado
                </Button>
              </form>
            )}
          </div>
        )}

        {/* ── Paso 3: probar ── */}
        {listo && (
          <div className="space-y-3 border-t pt-6">
            <h3 className="text-sm font-semibold">3. Probar conexión</h3>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={probar} disabled={ocupado !== null} className="bg-violet-600 hover:bg-violet-700">
                {ocupado === "probar" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Probar con ARCA
              </Button>
              {config?.ultimaPrueba && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {config.ultimaPrueba.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                  {config.ultimaPrueba.detalle} · {formatFecha(config.ultimaPrueba.at)}
                </span>
              )}
            </div>
          </div>
        )}

        {config && (
          <div className="border-t pt-4">
            <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setConfirmarBorrar(true)} disabled={ocupado !== null}>
              <Trash2 className="mr-2 h-4 w-4" /> Eliminar configuración fiscal
            </Button>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmarCsr} onOpenChange={setConfirmarCsr}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Generar un CSR nuevo?</AlertDialogTitle>
            <AlertDialogDescription>
              El certificado cargado deja de servir: vas a tener que subir el CSR nuevo a ARCA y pegar el .crt
              que te devuelva. Hasta entonces no se pueden emitir facturas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={generar}>Generar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmarBorrar} onOpenChange={setConfirmarBorrar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la configuración fiscal?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borran CUIT, certificado y clave. Los comprobantes ya emitidos no se tocan. Podés volver a
              configurarla cuando quieras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={borrar}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
