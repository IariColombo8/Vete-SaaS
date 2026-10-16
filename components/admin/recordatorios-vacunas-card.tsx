"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import {
  descartarRecordatorioVacuna,
  getRecordatoriosPorAvisar,
  marcarRecordatorioAvisadoManual,
} from "@/lib/supabase/recordatorios-vacuna"
import type { RecordatorioVacuna } from "@/lib/supabase/types"
import {
  DIAS_AVISO_DEFAULT,
  MAX_INTENTOS,
  diasHasta,
  fechaArgentina,
  linkRecordatorio,
  rangoCron,
  sumarDias,
  textoVencimiento,
} from "@/lib/recordatorios/vacunas"
import { APP_URL } from "@/lib/seo/sitio"
import { MessageCircle, Syringe, X } from "lucide-react"

/** Vencidas hace más de esto ya no se muestran: a esa altura avisar no sirve. */
const DIAS_VENCIDAS = 30
const VISIBLES = 6

interface Props {
  tenantId: string
  veterinaria: string
  /** Plan con email automático (feature `recordatoriosVacunas`). */
  envioAutomatico: boolean
}

/**
 * Vacunas y desparasitaciones por vencer (próximos 7 días) y vencidas sin
 * avisar. En cualquier plan se avisa a mano con wa.me (gratis); en Pro el cron
 * además manda un email a los clientes que tienen email, y acá se marca cuáles
 * van a salir solas para que no se avise dos veces.
 */
export function RecordatoriosVacunasCard({ tenantId, veterinaria, envioAutomatico }: Props) {
  const { toast } = useToast()
  const [items, setItems] = useState<RecordatorioVacuna[] | null>(null)
  const [verTodos, setVerTodos] = useState(false)
  const hoy = fechaArgentina(new Date())
  // El email automático sale solo del Gmail de la veterinaria. null = cargando
  // o no se pudo saber (no se muestra el aviso de "conectá tu Gmail").
  const [gmailConectado, setGmailConectado] = useState<boolean | null>(null)

  useEffect(() => {
    if (!envioAutomatico) return
    let cancelado = false
    fetch(`/api/gmail/credentials?tenant=${encodeURIComponent(tenantId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((estado: { conectado?: boolean } | null) => {
        if (!cancelado && estado) setGmailConectado(Boolean(estado.conectado))
      })
      .catch(() => {})
    return () => { cancelado = true }
  }, [tenantId, envioAutomatico])

  useEffect(() => {
    let cancelado = false
    getRecordatoriosPorAvisar(tenantId, sumarDias(hoy, -DIAS_VENCIDAS), sumarDias(hoy, DIAS_AVISO_DEFAULT))
      .then((r) => { if (!cancelado) setItems(r) })
      // Sin la migración 060 la consulta falla: la tarjeta no se muestra.
      .catch(() => { if (!cancelado) setItems(null) })
    return () => { cancelado = true }
  }, [tenantId, hoy])

  if (items === null) return null

  const rango = rangoCron(new Date())
  const automatico = envioAutomatico && gmailConectado === true
  const saleSolo = (r: RecordatorioVacuna) =>
    automatico &&
    r.estado === "pendiente" &&
    (r.intentos ?? 0) < MAX_INTENTOS &&
    Boolean(r.clienteEmail) &&
    r.fecha >= rango.desde &&
    r.fecha <= rango.hasta

  const quitar = (id: string) => setItems((prev) => (prev ?? []).filter((r) => r.id !== id))

  const avisar = (r: RecordatorioVacuna) => {
    if (!r.id) return
    const link = linkRecordatorio(r.clienteTelefono || r.telefono, {
      clienteNombre: r.clienteNombre,
      mascotaNombre: r.mascotaNombre,
      vacuna: r.vacuna,
      tipo: r.tipo ?? "vacuna",
      fecha: r.fecha,
      veterinaria,
      urlTurno: `${APP_URL}/${tenantId}/turno`,
    }, hoy)
    // Antes de cualquier await: si no, el navegador lo bloquea como popup.
    window.open(link, "_blank", "noopener,noreferrer")
    const id = r.id
    marcarRecordatorioAvisadoManual(tenantId, id)
      .then(() => quitar(id))
      .catch(() => toast({ title: "No se pudo marcar como avisado", variant: "destructive" }))
  }

  const descartar = (r: RecordatorioVacuna) => {
    if (!r.id) return
    const id = r.id
    descartarRecordatorioVacuna(tenantId, id)
      .then(() => {
        quitar(id)
        toast({ title: "Recordatorio descartado" })
      })
      .catch(() => toast({ title: "No se pudo descartar", variant: "destructive" }))
  }

  const visibles = verTodos ? items : items.slice(0, VISIBLES)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Syringe className="h-4 w-4 text-emerald-600" />
          Vacunas por vencer
          {items.length > 0 && <Badge variant="secondary">{items.length}</Badge>}
        </CardTitle>
        <CardDescription>
          {automatico
            ? "Al que tiene email le llega un aviso solo desde tu Gmail, 7 días antes. A los demás, avisales por WhatsApp desde acá."
            : envioAutomatico
              ? "Avisale al dueño por WhatsApp con un click."
              : "Avisale al dueño por WhatsApp con un click. En el plan Pro les llega además un email automático."}
        </CardDescription>
        {envioAutomatico && gmailConectado === false && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            Para que los recordatorios salgan solos por email,{" "}
            <Link href={`/${tenantId}/admin/Configuracion?tab=integraciones`} className="font-medium underline">
              conectá tu Gmail en Configuración → Integraciones
            </Link>
            .
          </p>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nada por avisar en los próximos {DIAS_AVISO_DEFAULT} días. Los recordatorios se crean solos al cargar
            la próxima dosis de una vacuna o desparasitación en la Libreta.
          </p>
        ) : (
          <ul className="divide-y">
            {visibles.map((r) => {
              const vencida = diasHasta(r.fecha, hoy) < 0
              const automatico = saleSolo(r)
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {r.mascotaNombre || "Mascota"} · {r.vacuna}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.clienteNombre || "Sin dueño"} ·{" "}
                      <span className={vencida ? "font-medium text-red-600 dark:text-red-400" : ""}>
                        {textoVencimiento(r.fecha, hoy)}
                      </span>
                    </p>
                  </div>
                  {r.estado === "fallido" && (
                    <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400" title={r.ultimoError}>
                      {r.ultimoError === "Sin email" ? "Sin email" : "No salió el email"}
                    </Badge>
                  )}
                  {automatico && (
                    <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:text-emerald-400">
                      Sale por email
                    </Badge>
                  )}
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant={automatico ? "ghost" : "outline"}
                      className="h-8 gap-1.5"
                      onClick={() => avisar(r)}
                      title="Abrir WhatsApp con el mensaje escrito"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Avisar
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() => descartar(r)}
                      title="Descartar (no avisar)"
                      aria-label="Descartar recordatorio"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {items.length > VISIBLES && (
          <Button variant="link" size="sm" className="mt-1 h-auto px-0" onClick={() => setVerTodos((v) => !v)}>
            {verTodos ? "Ver menos" : `Ver todos (${items.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
