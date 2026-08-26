"use client"

import { useCallback, useEffect, useState } from "react"
import { Wallet } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TablaSaldos } from "./cuenta-corriente/tabla-saldos"
import { DetalleClienteDialog } from "./cuenta-corriente/detalle-cliente-dialog"
import { getSaldosClientes, type ClienteConSaldo } from "@/lib/supabase/cuentaCorriente"

interface Props {
  tenantId: string
}

/** Saldos deudores por cliente, con detalle de movimientos y cobro. */
export function CuentaCorrienteManagement({ tenantId }: Props) {
  const [clientes, setClientes] = useState<ClienteConSaldo[]>([])
  const [cargando, setCargando] = useState(true)
  const [detalle, setDetalle] = useState<ClienteConSaldo | null>(null)

  const cargar = useCallback(() => {
    setCargando(true)
    getSaldosClientes(tenantId)
      .then(setClientes)
      .catch(() => toast.error("No se pudieron cargar los saldos"))
      .finally(() => setCargando(false))
  }, [tenantId])

  useEffect(() => {
    cargar()
  }, [cargar])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border bg-gradient-to-br from-rose-50 via-amber-50/60 to-transparent p-4 dark:from-rose-950/30 dark:via-amber-950/10">
        <div className="hidden rounded-xl bg-rose-600 p-2.5 text-white shadow-sm sm:flex">
          <Wallet className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cuenta corriente</h1>
          <p className="text-sm text-muted-foreground">
            Clientes con saldo pendiente y registro de cobros
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Saldos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <TablaSaldos clientes={clientes} cargando={cargando} onVerDetalle={setDetalle} />
        </CardContent>
      </Card>

      <DetalleClienteDialog
        tenantId={tenantId}
        cliente={detalle}
        onCerrar={() => setDetalle(null)}
        onCambio={cargar}
      />
    </div>
  )
}
