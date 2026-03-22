// /components/turnos/TurnoForm.tsx
"use client";

import type React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TurnoHeader } from "./TurnoHeader";
import { ClienteSection } from "./ClienteSection";
import { MascotaSection } from "./MascotaSection";
import { ServicioSection } from "./ServicioSection";
import { VacunaSection } from "./VacunaSection"; // NUEVO
import { FechaHoraSection } from "./FechaHoraSection";
import { TurnoSubmitButton } from "./TurnoSubmitButton";
import { ModalConfirmacion } from "./ModalConfirmacion";
import { useTurnoForm } from "@/hooks/turnos/useTurnoForm";
import { useTenant } from "@/hooks/useTenant";
import { Heart, Clock, PauseCircle } from "lucide-react";

interface TurnoFormProps {
  tenantId?: string;
  defaultDni?: string;
  lockDni?: boolean;
  redirectOnSuccess?: boolean;
  onSuccess?: () => void;
}

export function TurnoForm({
  tenantId,
  defaultDni,
  lockDni,
  redirectOnSuccess = true,
  onSuccess,
}: TurnoFormProps) {
  const { tenant, loading: tenantLoading } = useTenant(tenantId)

  const {
    formData,
    handleChange,
    handleSubmit,
    handleConfirmedSubmit,
    handleVacunasChange,
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
  } = useTurnoForm({ tenantId, defaultDni, lockDni, redirectOnSuccess, onSuccess });

  const mostrarVacunas = formData.servicio === "vacunacion" && formData.tipoMascota;

  if (!tenantLoading && tenant?.status === "pausado") {
    return (
      <Card className="shadow-2xl border-2 backdrop-blur-sm bg-background/95">
        <CardContent className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
            <PauseCircle className="h-8 w-8 text-orange-500" />
          </div>
          <h2 className="text-xl font-extrabold">Servicio pausado</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            Esta veterinaria no está recibiendo turnos en este momento. Por favor, contactate directamente con la clínica.
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
            />

            {/* Servicio */}
            <ServicioSection formData={formData} handleChange={handleChange} />

            {/* NUEVO: Sección de Vacunas - Solo se muestra si el servicio es vacunación */}
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
                />
              </>
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
            />

            {/* Submit Button */}
            <TurnoSubmitButton loading={loading} />
          </form>
        </CardContent>
      </Card>

      {/* Modal de Confirmación */}
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