// /components/turnos/TurnoForm.tsx
"use client";

import type React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TurnoHeader } from "./TurnoHeader";
import { ClienteSection } from "./ClienteSection";
import { MascotaSection } from "./MascotaSection";
import { ServicioSection } from "./ServicioSection";
import { VacunaSection } from "./VacunaSection";
import { LugarSection } from "./LugarSection";
import { FechaHoraSection } from "./FechaHoraSection";
import { TurnoSubmitButton } from "./TurnoSubmitButton";
import { ModalConfirmacion } from "./ModalConfirmacion";
import { useTurnoForm } from "@/hooks/turnos/useTurnoForm";
import { useTenant } from "@/hooks/useTenant";
import { useSlug } from "@/context/slug-context";
import { Heart, Clock, PauseCircle } from "lucide-react";
import { VACUNAS_DEFAULT } from "@/lib/turno-defaults";

interface TurnoFormProps {
  tenantId?: string;
  defaultDni?: string;
  lockDni?: boolean;
  defaultMascotaId?: string;
  redirectOnSuccess?: boolean;
  onSuccess?: () => void;
}

export function TurnoForm({
  tenantId: tenantIdProp,
  defaultDni,
  lockDni,
  defaultMascotaId,
  redirectOnSuccess = true,
  onSuccess,
}: TurnoFormProps) {
  const slug = useSlug()
  const tenantId = tenantIdProp || slug
  const { tenant, loading: tenantLoading } = useTenant(tenantId)

  const {
    formData,
    handleChange,
    handleSubmit,
    handleConfirmedSubmit,
    handleVacunasChange,
    handleLugarChange,
    loading,
    clienteExistente,
    mascotas,
    mostrarNuevaMascota,
    setMostrarNuevaMascota,
    selectedDate,
    setSelectedDate,
    horariosDisponibles,
    diasBloqueados,
    loadingCliente,
    showConfirmModal,
    setShowConfirmModal,
    closedDays,
    tenantHorarios,
    turnoConfig,
  } = useTurnoForm({ tenantId, defaultDni, lockDni, defaultMascotaId, redirectOnSuccess, onSuccess });

  const vacunasMap = turnoConfig?.vacunas ?? VACUNAS_DEFAULT;
  const mostrarVacunas = formData.servicio === "vacunacion" && formData.tipoMascota &&
    (vacunasMap[formData.tipoMascota]?.length ?? 0) > 0;

  if (!tenantLoading && tenant?.status === "pausado") {
    return (
      <Card className="shadow-2xl border-2 backdrop-blur-sm bg-background/95">
        <CardContent className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
            <PauseCircle className="h-8 w-8 text-orange-500" />
          </div>
          <h2 className="text-xl font-extrabold">Servicio pausado</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            Esta veterinaria no esta recibiendo turnos en este momento. Por favor, contactate directamente con la clinica.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="shadow-2xl border-2 backdrop-blur-sm bg-background/95 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <TurnoHeader />

        <CardContent className="px-6 py-8 md:px-8 md:py-10">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Cliente Info */}
            <ClienteSection
              formData={formData}
              handleChange={handleChange}
              clienteExistente={clienteExistente}
              loadingCliente={loadingCliente}
              lockDni={lockDni}
            />

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center">
                <div className="px-4 bg-background">
                  <Heart className="h-5 w-5 text-primary fill-primary/20" />
                </div>
              </div>
            </div>

            {/* Mascota Info */}
            <MascotaSection
              formData={formData}
              handleChange={handleChange}
              mascotas={mascotas}
              mostrarNuevaMascota={mostrarNuevaMascota}
              setMostrarNuevaMascota={setMostrarNuevaMascota}
              mascotasConfig={turnoConfig?.mascotas}
            />

            {/* Servicio */}
            <ServicioSection
              formData={formData}
              handleChange={handleChange}
              serviciosConfig={turnoConfig?.servicios}
              profesionales={turnoConfig?.profesionales}
            />

            {/* Vacunas - Solo se muestra si el servicio es vacunacion y hay vacunas para ese animal */}
            {mostrarVacunas && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border/50" />
                  </div>
                </div>

                <VacunaSection
                  tipoMascota={formData.tipoMascota}
                  vacunasSeleccionadas={formData.vacunas}
                  onVacunasChange={handleVacunasChange}
                  vacunasConfig={turnoConfig?.vacunas}
                />
              </>
            )}

            {/* Lugar de atencion (solo si modalidad es "ambos") */}
            {tenant?.modalidad === "ambos" && (
              <LugarSection
                modalidad={tenant.modalidad}
                lugar={formData.lugar}
                onLugarChange={handleLugarChange}
              />
            )}

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center">
                <div className="px-4 bg-background">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
              </div>
            </div>

            {/* Fecha y Hora */}
            <FechaHoraSection
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              formData={formData}
              handleChange={handleChange}
              diasBloqueados={diasBloqueados}
              horariosDisponibles={horariosDisponibles}
              closedDays={closedDays}
              tenantHorarios={tenantHorarios}
              servicioSel={turnoConfig?.servicios?.find((s) => s.id === formData.servicio)}
            />

            {/* Submit Button */}
            <TurnoSubmitButton loading={loading} />
          </form>
        </CardContent>
      </Card>

      {/* Modal de Confirmacion */}
      <ModalConfirmacion
        open={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmedSubmit}
        formData={formData}
        selectedDate={selectedDate}
        loading={loading}
      />
    </>
  );
}
