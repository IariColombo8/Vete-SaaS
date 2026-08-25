"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Save, Mail, CheckCircle2 } from "lucide-react"
import { updateTenantConfig } from "@/lib/supabase/queries"
import type { TenantConfig } from "@/lib/supabase/queries"

interface EmailProviderConfigProps {
  slug: string
  emailProvider: TenantConfig["emailProvider"]
  onProviderChange: (p: NonNullable<TenantConfig["emailProvider"]>) => void
}

interface EstadoGmail {
  tieneClientId: boolean
  conectado: boolean
  senderEmail: string | null
}

interface EstadoEmailJs {
  configurado: boolean
  serviceId: string | null
  templateId: string | null
  publicKey: string | null
}

/**
 * Elegir Resend (default, sin configuración) o Gmail API (el tenant conecta
 * su propia cuenta de Gmail vía OAuth). Las credenciales de Gmail viven en
 * `tenant_email_credentials` (nunca en `tenants`), así que este componente
 * habla con /api/gmail/* en vez de `updateTenantConfig`.
 */
export function EmailProviderConfig({ slug, emailProvider, onProviderChange }: EmailProviderConfigProps) {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const [saving, setSaving] = useState(false)
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [estado, setEstado] = useState<EstadoGmail | null>(null)

  const [serviceId, setServiceId] = useState("")
  const [templateId, setTemplateId] = useState("")
  const [publicKey, setPublicKey] = useState("")
  const [privateKey, setPrivateKey] = useState("")
  const [estadoEmailJs, setEstadoEmailJs] = useState<EstadoEmailJs | null>(null)

  const provider = emailProvider ?? "resend"

  useEffect(() => {
    if (provider !== "gmail") return
    fetch(`/api/gmail/credentials?tenant=${slug}`)
      .then(res => res.json())
      .then(setEstado)
      .catch(() => {})
  }, [slug, provider])

  useEffect(() => {
    if (provider !== "emailjs") return
    fetch(`/api/emailjs/credentials?tenant=${slug}`)
      .then(res => res.json())
      .then((data: EstadoEmailJs) => {
        setEstadoEmailJs(data)
        setServiceId(data.serviceId ?? "")
        setTemplateId(data.templateId ?? "")
        setPublicKey(data.publicKey ?? "")
      })
      .catch(() => {})
  }, [slug, provider])

  useEffect(() => {
    const gmailConectado = searchParams.get("gmail_conectado")
    const gmailError = searchParams.get("gmail_error")
    if (gmailConectado) toast({ title: "Gmail conectado", description: "Ya podés enviar emails desde esa cuenta." })
    if (gmailError) toast({ title: "No se pudo conectar Gmail", description: gmailError, variant: "destructive" })
  }, [searchParams, toast])

  async function guardarProveedor(nuevo: "resend" | "gmail" | "emailjs") {
    setSaving(true)
    try {
      await updateTenantConfig(slug, { emailProvider: nuevo })
      onProviderChange(nuevo)
      toast({ title: "Guardado" })
    } catch (e) {
      console.error(e)
      toast({ title: "Error", description: "No se pudo guardar.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function guardarCredenciales() {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast({ title: "Completá Client ID y Client Secret", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/gmail/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: slug, clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? "Error desconocido")
      setClientSecret("")
      setEstado(prev => ({ tieneClientId: true, conectado: prev?.conectado ?? false, senderEmail: prev?.senderEmail ?? null }))
      toast({ title: "Credenciales guardadas", description: "Ahora conectá la cuenta con el botón de abajo." })
    } catch (e) {
      console.error(e)
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function guardarCredencialesEmailJs() {
    if (!serviceId.trim() || !templateId.trim() || !publicKey.trim() || !privateKey.trim()) {
      toast({ title: "Completá los cuatro campos", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/emailjs/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: slug,
          serviceId: serviceId.trim(),
          templateId: templateId.trim(),
          publicKey: publicKey.trim(),
          privateKey: privateKey.trim(),
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? "Error desconocido")
      setPrivateKey("")
      setEstadoEmailJs({ configurado: true, serviceId: serviceId.trim(), templateId: templateId.trim(), publicKey: publicKey.trim() })
      toast({ title: "Credenciales guardadas" })
    } catch (e) {
      console.error(e)
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" /> Envío de emails
        </CardTitle>
        <CardDescription>
          Elegí cómo se envían los emails de confirmación de turno.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Proveedor</Label>
          <Select value={provider} onValueChange={v => guardarProveedor(v as "resend" | "gmail" | "emailjs")} disabled={saving}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="resend">Resend (predeterminado)</SelectItem>
              <SelectItem value="gmail">Gmail API (tu propia cuenta)</SelectItem>
              <SelectItem value="emailjs">EmailJS (tu propia cuenta)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {provider === "emailjs" && (
          <div className="space-y-4 rounded-lg border p-4">
            {estadoEmailJs?.configurado && (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Configurado con el servicio <span className="font-medium">{estadoEmailJs.serviceId}</span>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Datos del panel de{" "}
              <a href="https://dashboard.emailjs.com" target="_blank" rel="noopener noreferrer" className="underline">
                EmailJS
              </a>
              : Service, Template y las dos claves de API. La plantilla debe usar
              las variables <code className="text-xs">nombre_y_apellido</code>,{" "}
              <code className="text-xs">fecha</code>, <code className="text-xs">hora</code>,{" "}
              <code className="text-xs">direccion</code>, <code className="text-xs">nombre_mascota</code>,{" "}
              <code className="text-xs">tipo_mascota</code> y <code className="text-xs">servicio_requerido</code>.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Service ID</Label>
                <Input value={serviceId} onChange={e => setServiceId(e.target.value)} className="font-mono text-sm" />
              </div>
              <div className="space-y-2">
                <Label>Template ID</Label>
                <Input value={templateId} onChange={e => setTemplateId(e.target.value)} className="font-mono text-sm" />
              </div>
              <div className="space-y-2">
                <Label>Public Key</Label>
                <Input value={publicKey} onChange={e => setPublicKey(e.target.value)} className="font-mono text-sm" />
              </div>
              <div className="space-y-2">
                <Label>Private Key</Label>
                <Input
                  type="password"
                  value={privateKey}
                  onChange={e => setPrivateKey(e.target.value)}
                  placeholder={estadoEmailJs?.configurado ? "•••••••• (ya guardada)" : ""}
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <Button type="button" disabled={saving} onClick={guardarCredencialesEmailJs}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : <><Save className="mr-2 h-4 w-4" />Guardar credenciales</>}
            </Button>
          </div>
        )}

        {provider === "gmail" && (
          <div className="space-y-4 rounded-lg border p-4">
            {estado?.conectado ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Conectado como <span className="font-medium">{estado.senderEmail}</span>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Pegá el Client ID y Client Secret de un cliente OAuth &quot;Web application&quot;
                  de Google Cloud Console (Gmail API habilitada), con{" "}
                  <code className="text-xs">{typeof window !== "undefined" ? window.location.origin : ""}/api/gmail/callback</code>{" "}
                  agregado como URI de redirección autorizada.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Client ID</Label>
                    <Input value={clientId} onChange={e => setClientId(e.target.value)} className="font-mono text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label>Client Secret</Label>
                    <Input
                      type="password"
                      value={clientSecret}
                      onChange={e => setClientSecret(e.target.value)}
                      placeholder={estado?.tieneClientId ? "•••••••• (ya guardado)" : ""}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={saving} onClick={guardarCredenciales}>
                    {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : <><Save className="mr-2 h-4 w-4" />Guardar credenciales</>}
                  </Button>
                  {estado?.tieneClientId && (
                    <Button type="button" variant="outline" asChild>
                      <a href={`/api/gmail/auth?tenant=${slug}`}>Conectar con Google</a>
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
