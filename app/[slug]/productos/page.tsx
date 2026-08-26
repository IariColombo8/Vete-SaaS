"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2, ArrowLeft, Stethoscope } from "lucide-react"
import { getTenant, getTenantConfig } from "@/lib/supabase/queries"
import { getProductosPublicados } from "@/lib/supabase/productos"
import { normalizePlan, PLANS } from "@/lib/plans"
import type { TenantConfig } from "@/lib/supabase/queries"
import type { Producto } from "@/lib/supabase/types"
import { Button } from "@/components/ui/button"
import { ProductoTarjeta } from "@/components/public/producto-tarjeta"

export default function ProductosPublicosPage() {
  const params = useParams()
  const slug = params.slug as string
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<TenantConfig | null>(null)
  const [productos, setProductos] = useState<Producto[]>([])

  useEffect(() => {
    Promise.all([getTenant(slug), getTenantConfig(slug), getProductosPublicados(slug)]).then(
      ([t, cfg, prods]) => {
        const tieneFeature = PLANS[normalizePlan(cfg?.plan)].features.productos
        if (!t || !tieneFeature || prods.length === 0) {
          router.replace(`/${slug}`)
          return
        }
        setConfig(cfg)
        setProductos(prods)
        setLoading(false)
      },
    )
  }, [slug, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-white dark:bg-slate-950">
      <div className="container max-w-6xl mx-auto px-6 py-16">
        <Button
          variant="ghost"
          className="mb-8 -ml-3 text-slate-500"
          onClick={() => router.push(`/${slug}`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver a {config?.nombre || slug}
        </Button>

        <div className="flex items-center gap-3 mb-12">
          <Stethoscope className="h-6 w-6 text-emerald-500" />
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
            Productos de {config?.nombre || slug}
          </h1>
        </div>

        <div className="flex flex-wrap justify-center gap-6">
          {productos.map((p) => (
            <div key={p.id} className="w-[calc(50%-12px)] sm:w-[calc(33.333%-16px)] lg:w-[calc(25%-18px)] xl:w-[calc(16.666%-20px)]">
              <ProductoTarjeta producto={p} logo={config?.logo} />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
