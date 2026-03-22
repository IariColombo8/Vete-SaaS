"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { useMisTurnosCliente } from "@/hooks/turnos/useMisTurnosCliente"
import { MisTurnosCliente } from "@/components/turnos/MisTurnosCliente"
import { MiLibretaCliente } from "@/components/turnos/MiLibretaCliente"
import { getTenantsFull, type TenantFull } from "@/lib/firebase/firestore"
import { MapPin, Phone, CalendarPlus, Stethoscope, Loader2 } from "lucide-react"

export default function MisTurnosPage() {
  const router = useRouter()
  const [dniInput, setDniInput] = useState("")
  const [vets, setVets] = useState<TenantFull[]>([])
  const [loadingVets, setLoadingVets] = useState(true)

  const {
    loading,
    error,
    cliente,
    mascotas,
    turnos,
    buscarPorDni,
    cancelarTurno,
    refrescar,
    reset,
    dniActual,
  } = useMisTurnosCliente()

  useEffect(() => {
    getTenantsFull()
      .then(all => setVets(all.filter(v => v.status === "activo")))
      .catch(() => setVets([]))
      .finally(() => setLoadingVets(false))
  }, [])

  return (
    <main className="min-h-screen bg-gradient-to-b from-muted/30 via-muted/50 to-muted/30 py-8 md:py-16">
      <div className="container max-w-5xl px-4 sm:px-6 lg:px-8 space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <Stethoscope className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100">
            Mi espacio
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Reserva turnos o consulta tus citas anteriores
          </p>
        </div>

        {/* Sacar turno */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-emerald-600" />
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Sacar un turno</h2>
          </div>

          {loadingVets ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : vets.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No hay veterinarias disponibles en este momento.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {vets.map(vet => (
                <Card
                  key={vet.slug}
                  className="hover:border-emerald-400 transition-colors cursor-pointer group"
                  onClick={() => router.push(`/${vet.slug}/turno`)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30 shrink-0">
                          <Stethoscope className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <CardTitle className="text-sm leading-tight">{vet.nombre}</CardTitle>
                          {vet.ciudad && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <MapPin className="h-3 w-3" />
                              {vet.ciudad}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {vet.plan === "basico" ? "Basico" : vet.plan === "plus" ? "Plus" : "Pro"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 pb-3">
                    <div className="flex items-center justify-between">
                      {vet.telefono ? (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {vet.telefono}
                        </p>
                      ) : (
                        <span />
                      )}
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 group-hover:bg-emerald-700"
                        onClick={e => { e.stopPropagation(); router.push(`/${vet.slug}/turno`) }}
                      >
                        Reservar turno
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Ver mis turnos por DNI */}
        <section className="space-y-3">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Ver mis turnos</h2>

          <Card className="border-slate-200 dark:border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Acceso rapido</CardTitle>
              <CardDescription className="text-xs">
                Ingresa tu DNI para ver y gestionar tus turnos anteriores.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
              <div className="flex-1 w-full">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">DNI</label>
                <Input
                  placeholder="12345678"
                  value={dniInput}
                  onChange={e => setDniInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") buscarPorDni(dniInput) }}
                  className="h-10"
                />
                {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => buscarPorDni(dniInput)}
                  disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {loading ? "Buscando..." : "Ingresar"}
                </Button>
                {cliente && (
                  <Button variant="outline" onClick={reset}>
                    Cambiar DNI
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {cliente && (
            <Card className="border-slate-200 dark:border-slate-700">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      {cliente.nombre}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      DNI {dniActual}
                    </p>
                  </div>
                </div>

                <Tabs defaultValue="turnos">
                  <TabsList className="h-9 bg-slate-200/80 dark:bg-slate-800/80">
                    <TabsTrigger value="turnos" className="text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
                      Mis turnos
                    </TabsTrigger>
                    <TabsTrigger value="libreta" className="text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
                      Libreta sanitaria
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="turnos" className="mt-4">
                    <MisTurnosCliente
                      dni={dniActual}
                      turnos={turnos}
                      onCancelar={cancelarTurno}
                      onRefresh={refrescar}
                    />
                  </TabsContent>
                  <TabsContent value="libreta" className="mt-4">
                    <MiLibretaCliente mascotas={mascotas} turnos={turnos} />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </section>

      </div>
    </main>
  )
}
