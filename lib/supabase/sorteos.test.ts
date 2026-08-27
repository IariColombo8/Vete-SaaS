import { describe, it, expect, vi } from "vitest"
import { elegirGanador } from "./sorteos"
import type { ParticipanteSorteo } from "./types"

describe("elegirGanador", () => {
  it("elige siempre al unico participante si es el unico", () => {
    const participantes: ParticipanteSorteo[] = [
      { clienteId: "a", clienteNombre: "Iara", chances: 10, ventaIds: ["v1", "v2"] },
    ]
    const ganador = elegirGanador(participantes, () => 0.5)
    expect(ganador?.clienteId).toBe("a")
  })

  it("devuelve null si no hay participantes", () => {
    expect(elegirGanador([], () => 0)).toBeNull()
  })

  it("pesa la eleccion por cantidad de chances: random bajo cae en el primero", () => {
    const participantes: ParticipanteSorteo[] = [
      { clienteId: "a", clienteNombre: "Iara", chances: 9, ventaIds: ["v1"] },
      { clienteId: "b", clienteNombre: "Bruno", chances: 1, ventaIds: ["v2"] },
    ]
    // 9 chances de "a" sobre 10 totales: random() = 0.1 (10%) todavia cae en "a" (rango [0, 0.9)).
    const ganador = elegirGanador(participantes, () => 0.1)
    expect(ganador?.clienteId).toBe("a")
  })

  it("random alto cae en el ultimo participante", () => {
    const participantes: ParticipanteSorteo[] = [
      { clienteId: "a", clienteNombre: "Iara", chances: 9, ventaIds: ["v1"] },
      { clienteId: "b", clienteNombre: "Bruno", chances: 1, ventaIds: ["v2"] },
    ]
    // random() = 0.95 (95%) cae en el rango de "b" ([0.9, 1)).
    const ganador = elegirGanador(participantes, () => 0.95)
    expect(ganador?.clienteId).toBe("b")
  })

  it("elige una venta al azar entre las del ganador", () => {
    const participantes: ParticipanteSorteo[] = [
      { clienteId: "a", clienteNombre: "Iara", chances: 3, ventaIds: ["v1", "v2", "v3"] },
    ]
    const ganador = elegirGanador(participantes, () => 0, () => 0.999)
    expect(ganador?.ventaId).toBe("v3")
  })
})
