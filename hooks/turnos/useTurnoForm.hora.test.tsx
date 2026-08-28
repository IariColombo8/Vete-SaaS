import { describe, it, expect, vi } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { useTurnoForm } from "./useTurnoForm"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/lib/email/confirmacion-turno", () => ({ enviarEmailConfirmacion: vi.fn() }))

vi.mock("@/lib/supabase/queries", () => ({
  createTurno: vi.fn(),
  createCliente: vi.fn(),
  createMascota: vi.fn(),
  updateCliente: vi.fn(),
  updateMascota: vi.fn(),
  getClienteByDNI: vi.fn().mockResolvedValue(null),
  getMascotas: vi.fn().mockResolvedValue([]),
  getTurnosByDateRange: vi.fn().mockResolvedValue([]),
  getDiasBloqueados: vi.fn().mockResolvedValue([]),
  getTenantConfig: vi.fn().mockResolvedValue({
    horarios: [{ dia: "Lunes,Martes,Miercoles,Jueves,Viernes", apertura: "10:00", cierre: "20:00", cerrado: false }],
    minHorasAnticipacion: 2,
  }),
  getTurnoConfig: vi.fn().mockResolvedValue({
    servicios: [{ id: "general", emoji: "🩺", nombre: "Consulta general", duracionMin: 15, cupoSimultaneo: 2 }],
  }),
}))

describe("useTurnoForm - seleccion de hora con servicio de 15 min", () => {
  it("al elegir servicio + fecha + hora, formData.hora conserva el valor elegido", async () => {
    const { result } = renderHook(() => useTurnoForm({ tenantId: "vipvet" }))

    await waitFor(() => expect(result.current.turnoConfig).not.toBeNull())

    act(() => { result.current.handleChange("servicio", "general") })

    const fechaFutura = new Date()
    fechaFutura.setDate(fechaFutura.getDate() + 7) // viernes o cualquier dia habil, lejos de "hoy"
    act(() => { result.current.setSelectedDate(fechaFutura) })

    await waitFor(() => expect(result.current.horariosDisponibles.length).toBeGreaterThan(0))

    const horaElegida = result.current.horariosDisponibles[0]
    act(() => { result.current.handleChange("hora", horaElegida) })

    // El bug reportado: la hora elegida se resetea sola a "" poco despues de elegirla.
    await new Promise((r) => setTimeout(r, 50))
    expect(result.current.formData.hora).toBe(horaElegida)
  })
})
