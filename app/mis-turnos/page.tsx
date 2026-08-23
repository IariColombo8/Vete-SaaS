"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { useMisTurnosCliente } from "@/hooks/turnos/useMisTurnosCliente"
import { MisTurnosCliente } from "@/components/turnos/MisTurnosCliente"
import { getTenantsFull, type TenantFull } from "@/lib/supabase/queries"
import { useAuth } from "@/hooks/use-auth"
import { MapPin, Phone, CalendarPlus, Stethoscope, Loader2, LogIn } from "lucide-react"

export default function MisTurnosPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [vets, setVets] = useState<TenantFull[]>([])
  const [loadingVets, setLoadingVets] = useState(true)
  const [selectedVet, setSelectedVet] = useState<TenantFull | null>(null)

  const {
    loading,
    error,
    turnos,
    buscarMisTurnos,
    cancelarTurno,
    refrescar,
    reset,
  } = useMisTurnosCliente(selectedVet?.slug ?? "")

  useEffect(() => {
    getTenantsFull()
      .then(all => setVets(all.filter(v => v.status === "activo")))
      .catch(() => setVets([]))
      .finally(() => setLoadingVets(false))
  }, [])

  // Buscar turnos automáticamente cuando se selecciona una vet y el usuario está autenticado
  useEffect(() => {
    if (selectedVet && user) {
      buscarMisTurnos()
    }
  }, [selectedVet, user, buscarMisTurnos])

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

        {/* Auth check */}
        {!authLoading && !user && (
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
            <CardContent className="py-6 text-center space-y-3">
              <LogIn className="h-8 w-8 text-amber-600 mx-auto" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Iniciá sesión para ver y gestionar tus turnos.
              </p>
              <Button
                onClick={() => router.push("/login")}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Iniciar sesión
              </Button>
            </CardContent>
          </Card>
        )}

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

        {/* Ver mis turnos — requiere auth */}
        {user && (
          <section className="space-y-3">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Ver mis turnos</h2>

            <Card className="border-slate-200 dark:border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Mis turnos</CardTitle>
                <CardDescription className="text-xs">
                  Seleccioná tu veterinaria para ver tus turnos asociados a {user.email}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">

                {/* Selector de veterinaria */}
                {!selectedVet ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      ¿En qué veterinaria tenés turno?
                    </p>
                    {loadingVets ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Cargando veterinarias...
                      </div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {vets.map(vet => (
                          <button
                            key={vet.slug}
                            type="button"
                            onClick={() => { setSelectedVet(vet); reset() }}
                            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-left hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors"
                          >
                            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/30 shrink-0">
                              <Stethoscope className="h-3.5 w-3.5 text-emerald-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{vet.nombre ?? vet.slug}</p>
                              {vet.ciudad && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />{vet.ciudad}
                                </p>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Stethoscope className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm font-medium">{selectedVet.nombre ?? selectedVet.slug}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedVet(null); reset() }}
                      className="text-xs text-muted-foreground hover:text-slate-700 dark:hover:text-slate-300 underline"
                    >
                      Cambiar
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedVet && (
              <Card className="border-slate-200 dark:border-slate-700">
                <CardContent className="p-4 sm:p-6">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : error ? (
                    <div className="text-center py-6 text-sm text-muted-foreground">{error}</div>
                  ) : (
                    <Tabs defaultValue="turnos">
                      <TabsList className="h-9 bg-slate-200/80 dark:bg-slate-800/80">
                        <TabsTrigger value="turnos" className="text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
                          Mis turnos
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="turnos" className="mt-4">
                        <MisTurnosCliente
                          turnos={turnos}
                          onCancelar={cancelarTurno}
                          onRefresh={refrescar}
                        />
                      </TabsContent>
                    </Tabs>
                  )}
                </CardContent>
              </Card>
            )}
          </section>
        )}

      </div>
    </main>
  )
}
