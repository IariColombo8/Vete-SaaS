"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { OfertasTab } from "@/components/admin/promos-sorteos/ofertas-tab"
import { PromocionesTab } from "@/components/admin/promos-sorteos/promociones-tab"
import { SorteosTab } from "@/components/admin/promos-sorteos/sorteos-tab"
import { Gift } from "lucide-react"
import { EncabezadoPagina } from "@/components/admin/encabezado-pagina"

interface Props {
  tenantId: string
}

/**
 * Tres pestañas independientes entre sí — cada una carga sus propios datos,
 * así que cambiar de tab no dispara refetch de las otras.
 */
export function PromosSorteosManagement({ tenantId }: Props) {
  const [tab, setTab] = useState("ofertas")

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        icono={Gift}
        titulo="Promos y sorteos"
        descripcion="Ofertas, promociones y sorteos: todo lo que tus clientes ven como descuento o beneficio."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="ofertas">Ofertas</TabsTrigger>
          <TabsTrigger value="promociones">Promociones</TabsTrigger>
          <TabsTrigger value="sorteos">Sorteos</TabsTrigger>
        </TabsList>
        <TabsContent value="ofertas">
          <OfertasTab tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="promociones">
          <PromocionesTab tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="sorteos">
          <SorteosTab tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
