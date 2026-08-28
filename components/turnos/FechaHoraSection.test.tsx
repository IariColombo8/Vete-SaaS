import { describe, it, expect, vi } from "vitest"
import { useState } from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { FechaHoraSection } from "./FechaHoraSection"

vi.mock("@/context/slug-context", () => ({ useSlug: () => "test-slug" }))
vi.mock("@/hooks/turnos/useDisponibilidadTurnos", () => ({
  useDisponibilidadTurnos: () => ({ turnosExistentes: [] }),
}))

const HORARIOS_15MIN = ["10:00", "10:15", "10:30", "10:45", "11:00"]

function Harness({ horariosDisponibles = HORARIOS_15MIN }: { horariosDisponibles?: string[] }) {
  const [hora, setHora] = useState("")
  return (
    <FechaHoraSection
      selectedDate={new Date("2026-08-28")}
      setSelectedDate={() => {}}
      formData={{ hora, fecha: "2026-08-28" }}
      handleChange={(field: string, value: string) => { if (field === "hora") setHora(value) }}
      diasBloqueados={[]}
      horariosDisponibles={horariosDisponibles}
      closedDays={[]}
      tenantHorarios={[{ dia: "Viernes", apertura: "10:00", cierre: "12:00", cerrado: false }]}
      servicioSel={{ id: "general", emoji: "🩺", nombre: "General", duracionMin: 15 }}
    />
  )
}

describe("FechaHoraSection - seleccion de hora con minutos", () => {
  it("al elegir una hora, el select de Hora refleja la seleccion", async () => {
    render(<Harness />)
    const selectHora = screen.getByDisplayValue("Hora...") as HTMLSelectElement
    fireEvent.change(selectHora, { target: { value: "10" } })
    expect(selectHora.value).toBe("10")
  })

  it("tras elegir hora, se puede elegir un minuto especifico", async () => {
    render(<Harness />)
    const selectHora = screen.getByDisplayValue("Hora...") as HTMLSelectElement
    fireEvent.change(selectHora, { target: { value: "10" } })

    const selectMin = screen.getByDisplayValue("00") as HTMLSelectElement
    fireEvent.change(selectMin, { target: { value: "30" } })
    expect(selectMin.value).toBe("30")
  })

  it("mantiene la hora elegida si el padre recalcula horariosDisponibles con una referencia nueva (mismo contenido)", async () => {
    const { rerender } = render(<Harness horariosDisponibles={HORARIOS_15MIN} />)
    const selectHora = screen.getByDisplayValue("Hora...") as HTMLSelectElement
    fireEvent.change(selectHora, { target: { value: "10" } })
    expect(selectHora.value).toBe("10")

    // Simula lo que hace useTurnoForm: recomputa "disponibles" (nuevo array, mismo contenido) en cada
    // render del efecto de disponibilidad, no solo cuando cambia la hora elegida.
    rerender(<Harness horariosDisponibles={[...HORARIOS_15MIN]} />)
    expect(selectHora.value).toBe("10")
  })
})
