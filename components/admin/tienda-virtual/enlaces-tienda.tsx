"use client"

import QRCode from "qrcode"
import { CalendarPlus, Copy, ExternalLink, Globe, Package, QrCode } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"

interface Props {
  slug: string
  /** El catálogo público solo existe con el feature `productos` (plan Pro). */
  conCatalogo: boolean
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.vetpanel.com.ar"

/**
 * Los links que la veterinaria comparte con sus clientes. Antes vivían en el
 * Dashboard mezclados con accesos internos del panel; acá quedan solo los
 * públicos, que son los que tiene sentido mandar por WhatsApp o imprimir.
 */
export function EnlacesTienda({ slug, conCatalogo }: Props) {
  const { toast } = useToast()

  const enlaces = [
    {
      label: "Página pública",
      desc: "Es la que ven tus clientes al buscarte",
      path: `/${slug}`,
      icon: Globe,
      iconColor: "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400",
    },
    {
      label: "Sacar turno",
      desc: "Mandáselo a un cliente para que reserve solo",
      path: `/${slug}/turno`,
      icon: CalendarPlus,
      iconColor: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400",
    },
    ...(conCatalogo
      ? [{
          label: "Catálogo de productos",
          desc: "Tus productos con precio, para consultar por WhatsApp",
          path: `/${slug}/productos`,
          icon: Package,
          iconColor: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400",
        }]
      : []),
  ]

  function copiar(path: string) {
    navigator.clipboard.writeText(`${BASE_URL}${path}`)
    toast({ title: "Link copiado" })
  }

  // El QR sirve para imprimirlo y pegarlo en el mostrador o la vidriera.
  async function descargarQR(path: string, label: string) {
    try {
      const dataUrl = await QRCode.toDataURL(`${BASE_URL}${path}`, { width: 640, margin: 2 })
      const a = document.createElement("a")
      a.href = dataUrl
      a.download = `qr-${label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-")}.png`
      a.click()
    } catch (err) {
      console.error(err)
      toast({ title: "No se pudo generar el QR", variant: "destructive" })
    }
  }

  return (
    <Card data-tour="tienda-enlaces">
      <CardHeader>
        <CardTitle className="text-base">Tus enlaces</CardTitle>
        <CardDescription>
          Compartilos por WhatsApp o en redes, o descargá el QR para imprimirlo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {enlaces.map(({ label, desc, path, icon: Icon, iconColor }) => (
          <div key={path} className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${iconColor}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{label}</p>
                <p className="text-xs text-muted-foreground truncate">{desc}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 rounded bg-muted px-2.5 py-1.5 text-xs font-mono truncate">
                {BASE_URL}{path}
              </code>
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Copiar link" onClick={() => copiar(path)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Descargar QR" onClick={() => descargarQR(path, label)}>
                <QrCode className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Abrir" asChild>
                <a href={path} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
