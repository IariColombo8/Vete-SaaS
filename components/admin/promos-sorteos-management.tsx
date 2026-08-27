"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { OfertasTab } from "@/components/admin/promos-sorteos/ofertas-tab"
import { PromocionesTab } from "@/components/admin/promos-sorteos/promociones-tab"

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
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">Ofertas, promociones y sorteos</h1>
        <p className="text-sm text-muted-foreground">
          Gestioná todo lo que tus clientes ven como descuento o beneficio.
        </p>
      </div>

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
          {/* Tarea 11: se agrega en un commit posterior */}
        </TabsContent>
      </Tabs>
    </div>
  )
}
